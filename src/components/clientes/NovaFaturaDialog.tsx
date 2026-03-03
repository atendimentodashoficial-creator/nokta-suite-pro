import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { uploadComprovante } from "@/hooks/useFaturaPagamentos";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CurrencyInput, parseCurrencyToNumber } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useCreateFatura, useFaturas } from "@/hooks/useFaturas";
import { useProcedimentos } from "@/hooks/useProcedimentos";
import { useProfissionais } from "@/hooks/useProfissionais";
import { useProdutos } from "@/hooks/useProdutos";

import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Trash2, Package, Stethoscope, CalendarIcon, RotateCcw, DollarSign, User, FileText, CheckCircle2, Eye, Upload, Loader2 } from "lucide-react";
import { FaturaResumoDialog } from "@/components/clientes/FaturaResumoDialog";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
const upsellSchema = z.object({
  tipo: z.enum(["produto", "procedimento"]),
  item_id: z.string().min(1, "Selecione um item"),
  valor: z.string().min(1, "Valor é obrigatório"),
});

const faturaSchema = z.object({
  valor: z.string().optional(),
  status: z.enum(["negociacao", "fechado", "retorno"], { required_error: "Selecione o status" }),
  procedimento_id: z.string().optional(),
  profissional_id: z.string().optional(),
  data_fatura: z.string().min(1, "Data é obrigatória"),
  data_follow_up: z.string().optional(),
  observacoes: z.string().max(500).optional(),
  upsells: z.array(upsellSchema).optional(),
  meio_pagamento: z.string().optional(),
  forma_pagamento: z.enum(["a_vista", "parcelado", "entrada_parcelado"]),
  valor_entrada: z.string().optional(),
  numero_parcelas: z.string().optional(),
  taxa_parcelamento: z.string().optional(),
  juros_pago_por: z.enum(["cliente", "empresa"]),
});

type FaturaFormData = z.infer<typeof faturaSchema>;

interface NovaFaturaDialogProps {
  clienteId: string;
  clienteNome: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  procedimentoId?: string;
  profissionalId?: string;
  agendamentoId?: string;
  dataAgendamento?: string;
  onFaturaCreated?: () => void;
}

export function NovaFaturaDialog({
  clienteId,
  clienteNome,
  open,
  onOpenChange,
  procedimentoId,
  profissionalId,
  agendamentoId,
  dataAgendamento,
  onFaturaCreated,
}: NovaFaturaDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRetornoFaturaId, setSelectedRetornoFaturaId] = useState<string | null>(null);
  const [previewFatura, setPreviewFatura] = useState<any>(null);
  const [pagamentoParcial, setPagamentoParcial] = useState(false);
  const [valorPago, setValorPago] = useState("");
  const [dataPagamentoParcial, setDataPagamentoParcial] = useState<Date>(new Date());
  const [dataProximoPagamento, setDataProximoPagamento] = useState<Date | undefined>();
  const [comprovante, setComprovante] = useState<File | null>(null);
  const [uploadingComprovante, setUploadingComprovante] = useState(false);
  const comprovanteRef = useRef<HTMLInputElement>(null);
  const createFatura = useCreateFatura();
  const queryClient = useQueryClient();
  const { data: procedimentos } = useProcedimentos();
  const { data: profissionais } = useProfissionais();
  const { data: produtos } = useProdutos(true);
  const { data: allFaturas } = useFaturas();
  
  const clienteFaturas = allFaturas?.filter(f => f.cliente_id === clienteId) || [];

  // Extrair apenas a data do dataAgendamento (que pode ter hora)
  const getDataFaturaDefault = () => {
    if (dataAgendamento) {
      // Se tiver data do agendamento, usar ela (pode ser ISO ou date string)
      const data = new Date(dataAgendamento);
      if (!isNaN(data.getTime())) {
        return format(data, "yyyy-MM-dd");
      }
    }
    // Fallback para hoje
    return format(new Date(), "yyyy-MM-dd");
  };

  const form = useForm<FaturaFormData>({
    resolver: zodResolver(faturaSchema),
    defaultValues: {
      status: undefined,
      observacoes: "",
      data_fatura: getDataFaturaDefault(),
      data_follow_up: format(new Date(), "yyyy-MM-dd"),
      procedimento_id: procedimentoId || undefined,
      profissional_id: profissionalId || undefined,
      upsells: [],
      meio_pagamento: undefined,
      forma_pagamento: "a_vista",
      valor_entrada: "",
      numero_parcelas: "1",
      taxa_parcelamento: "0",
      juros_pago_por: "cliente",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "upsells",
  });

  // Preencher valor automaticamente quando procedimento for selecionado
  const selectedProcedimentoId = form.watch("procedimento_id");
  
  useEffect(() => {
    if (selectedProcedimentoId && procedimentos) {
      const procedimento = procedimentos.find(p => p.id === selectedProcedimentoId);
      if (procedimento?.valor_medio) {
        form.setValue("valor", procedimento.valor_medio.toString().replace('.', ','));
      }
    }
  }, [selectedProcedimentoId, procedimentos, form]);

  // Calcular valor total incluindo upsells
  const upsells = form.watch("upsells") || [];
  const valorBase = form.watch("valor") || "0";
  const valorBaseNumerico = parseCurrencyToNumber(valorBase);
  const valorUpsells = upsells.reduce((acc, upsell) => {
    return acc + parseCurrencyToNumber(upsell.valor || "0");
  }, 0);
  const valorTotal = valorBaseNumerico + valorUpsells;
  const watchedStatus = form.watch("status");

  const onSubmit = async (data: FaturaFormData) => {
    setIsSubmitting(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");

      // Handle retorno flow - no new fatura, just link agendamento
      if (data.status === "retorno") {
        if (!selectedRetornoFaturaId) {
          toast.error("Selecione uma fatura para o retorno");
          setIsSubmitting(false);
          return;
        }
        if (agendamentoId) {
          await supabase
            .from("agendamentos")
            .update({ 
              status: "realizado" as any,
              retorno_fatura_id: selectedRetornoFaturaId,
            })
            .eq("id", agendamentoId);

          await supabase.from("fatura_agendamentos").insert({
            fatura_id: selectedRetornoFaturaId,
            agendamento_id: agendamentoId,
          });

          queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
          queryClient.invalidateQueries({ queryKey: ["faturas"] });
        }
        toast.success("Retorno registrado com sucesso!");
        onOpenChange(false);
        form.reset();
        setSelectedRetornoFaturaId(null);
        onFaturaCreated?.();
        setIsSubmitting(false);
        return;
      }

      // Normal fatura creation flow
      // Converter valor de string para número
      const valorNumerico = parseCurrencyToNumber(data.valor || "0");

      if (valorNumerico <= 0) {
        toast.error("Valor é obrigatório");
        setIsSubmitting(false);
        return;
      }

      // Calcular valor total incluindo upsells
      const valorUpsellsTotal = (data.upsells || []).reduce((acc, upsell) => {
        return acc + parseCurrencyToNumber(upsell.valor);
      }, 0);

      const valorTotalFatura = valorNumerico + valorUpsellsTotal;

      const valorEntrada = data.forma_pagamento !== "a_vista" && data.valor_entrada 
        ? parseCurrencyToNumber(data.valor_entrada)
        : 0;
      const numeroParcelas = data.forma_pagamento !== "a_vista" && data.numero_parcelas
        ? parseInt(data.numero_parcelas)
        : 1;
      const taxaParcelamento = data.forma_pagamento !== "a_vista" && data.taxa_parcelamento
        ? parseCurrencyToNumber(data.taxa_parcelamento)
        : 0;
      
      // Calcular valor com taxa baseado em quem paga
      const valorTaxa = valorTotalFatura * (taxaParcelamento / 100);
      let valorFinal = valorTotalFatura;
      
      if (data.juros_pago_por === "cliente") {
        valorFinal = valorTotalFatura + valorTaxa;
      } else {
        valorFinal = valorTotalFatura;
      }
      
      // Calcular valor da parcela
      let valorParcela = 0;
      if (data.forma_pagamento === "parcelado") {
        valorParcela = valorFinal / numeroParcelas;
      } else if (data.forma_pagamento === "entrada_parcelado") {
        valorParcela = (valorFinal - valorEntrada) / numeroParcelas;
      }

      const faturaResult = await createFatura.mutateAsync({
        cliente_id: clienteId,
        valor: valorFinal,
        status: data.status as "negociacao" | "fechado",
        procedimento_id: data.procedimento_id || null,
        profissional_id: data.profissional_id || null,
        observacoes: data.observacoes || null,
        data_fatura: data.data_fatura || null,
        data_follow_up: data.data_follow_up || null,
        meio_pagamento: data.meio_pagamento || null,
        forma_pagamento: data.forma_pagamento,
        valor_entrada: valorEntrada,
        numero_parcelas: numeroParcelas,
        valor_parcela: valorParcela,
        taxa_parcelamento: taxaParcelamento,
        juros_pago_por: data.juros_pago_por,
      });

      const { supabase: sb } = await import("@/integrations/supabase/client");

      // Se houver agendamentoId, criar vínculo e atualizar status do agendamento
      if (agendamentoId) {
        // Criar vínculo na tabela fatura_agendamentos
        if (faturaResult) {
          await sb.from("fatura_agendamentos").insert({
            fatura_id: faturaResult.id,
            agendamento_id: agendamentoId,
          });
        }

        // Atualizar status do agendamento para "realizado"
        await sb
          .from("agendamentos")
          .update({ status: "realizado" })
          .eq("id", agendamentoId);
        
        // Invalidar query de agendamentos para atualizar a lista
        queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      }

      // Criar upsells
      if (faturaResult && data.upsells && data.upsells.length > 0) {
        const upsellsToInsert = data.upsells.map(upsell => {
          const valorUpsell = parseCurrencyToNumber(upsell.valor);
          const isProduto = upsell.tipo === "produto";
          const item = isProduto 
            ? produtos?.find(p => p.id === upsell.item_id)
            : procedimentos?.find(p => p.id === upsell.item_id);
          
          return {
            fatura_id: faturaResult.id,
            tipo: upsell.tipo,
            produto_id: isProduto ? upsell.item_id : null,
            procedimento_id: !isProduto ? upsell.item_id : null,
            descricao: item?.nome || "Item",
            valor: valorUpsell,
          };
        });

        await sb.from("fatura_upsells").insert(upsellsToInsert);
      }

      // Register partial payment if enabled
      if (faturaResult && pagamentoParcial) {
        const valorPagoNum = parseCurrencyToNumber(valorPago);
        if (valorPagoNum > 0) {
          setUploadingComprovante(true);
          try {
            let comprovanteUrl: string | null = null;
            if (comprovante) {
              comprovanteUrl = await uploadComprovante(comprovante);
            }
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (currentUser) {
              await supabase.from("fatura_pagamentos").insert({
                fatura_id: faturaResult.id,
                user_id: currentUser.id,
                valor: valorPagoNum,
                data_pagamento: format(dataPagamentoParcial, "yyyy-MM-dd"),
                data_proximo_pagamento: dataProximoPagamento ? format(dataProximoPagamento, "yyyy-MM-dd") : null,
                comprovante_url: comprovanteUrl,
              });
            }
          } catch (e) {
            console.error("Erro ao registrar pagamento parcial:", e);
          } finally {
            setUploadingComprovante(false);
          }
        }
      }

      // Automatically send Purchase event if created with status "fechado"
      if (faturaResult && data.status === "fechado") {
        try {
          const { sendPurchaseConversion } = await import("@/hooks/useMetaConversions");
          
          const conversionResult = await sendPurchaseConversion(
            faturaResult.id,
            clienteId,
            valorFinal,
            data.data_fatura || undefined
          );
          
          if (conversionResult.success) {
            // Mark as sent
            await sb
              .from("faturas")
              .update({ 
                pixel_event_sent_at: new Date().toISOString(),
                pixel_status: "enviado"
              })
              .eq("id", faturaResult.id);
            
            console.log("Meta Conversion: Purchase sent automatically for new fatura", faturaResult.id);
            toast.success("Fatura criada e evento Purchase enviado ao Meta!");
          } else {
            console.log("Meta Conversion: Purchase not sent -", conversionResult.error);
            toast.success("Fatura criada com sucesso!");
          }
        } catch (error) {
          console.error("Meta Conversion: Failed to send Purchase", error);
          toast.success("Fatura criada com sucesso!");
        }
      } else {
        toast.success("Fatura criada com sucesso!");
      }

      onOpenChange(false);
      form.reset();
      setSelectedRetornoFaturaId(null);
      setPagamentoParcial(false);
      setValorPago("");
      setDataPagamentoParcial(new Date());
      setDataProximoPagamento(undefined);
      setComprovante(null);
      onFaturaCreated?.();
    } catch (error) {
      console.error("Erro ao criar fatura:", error);
      toast.error("Erro ao criar fatura");
    } finally {
      setIsSubmitting(false);
    }
  };

  const addUpsell = () => {
    append({ tipo: "produto", item_id: "", valor: "" });
  };

  // Atualizar valor do upsell quando item for selecionado
  const handleItemChange = (index: number, itemId: string, tipo: "produto" | "procedimento") => {
    if (tipo === "produto") {
      const produto = produtos?.find(p => p.id === itemId);
      if (produto?.valor) {
        form.setValue(`upsells.${index}.valor`, produto.valor.toString().replace('.', ','));
      }
    } else {
      const procedimento = procedimentos?.find(p => p.id === itemId);
      if (procedimento?.valor_medio) {
        form.setValue(`upsells.${index}.valor`, procedimento.valor_medio.toString().replace('.', ','));
      }
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Nova Fatura</DialogTitle>
          <p className="text-sm text-muted-foreground">Cliente: {clienteNome}</p>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Linha 1: Data e Status */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="data_fatura"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Data</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal h-10",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? format(parse(field.value, "yyyy-MM-dd", new Date()), "dd/MM/yy") : "Selecione"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value ? parse(field.value, "yyyy-MM-dd", new Date()) : undefined}
                            onSelect={(date) => field.onChange(date ? format(date, "yyyy-MM-dd") : "")}
                            locale={ptBR}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={(val) => {
                        field.onChange(val);
                        if (val !== "retorno") {
                          setSelectedRetornoFaturaId(null);
                        }
                      }} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Selecione o status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-background border shadow-lg z-50">
                          <SelectItem value="negociacao">Negociação</SelectItem>
                          <SelectItem value="fechado">Fechado</SelectItem>
                          <SelectItem value="retorno">Retorno</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Retorno: Fatura Picker */}
              {watchedStatus === "retorno" && (
                <div className="space-y-3 p-4 border border-border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <RotateCcw className="h-4 w-4 text-blue-600" />
                    Selecione a fatura referente a este retorno
                  </div>
                  {clienteFaturas.length > 0 ? (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                      {clienteFaturas.map((fatura) => (
                        <div
                          key={fatura.id}
                          onClick={() => setSelectedRetornoFaturaId(fatura.id)}
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-all",
                            selectedRetornoFaturaId === fatura.id
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border hover:bg-muted/50"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="text-sm font-medium truncate">
                                  {(fatura as any).procedimentos?.nome || "Sem procedimento"}
                                </span>
                                <Badge variant="outline" className={cn(
                                  "text-[10px] px-1.5 py-0",
                                  fatura.status === "negociacao"
                                    ? "border-blue-500 text-blue-600 bg-blue-50"
                                    : "border-green-500 text-green-600 bg-green-50"
                                )}>
                                  {fatura.status === "negociacao" ? "Negociação" : "Fatura"}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <DollarSign className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                                <span className="text-sm font-semibold text-green-600">
                                  R$ {Number(fatura.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              {(fatura as any).profissionais?.nome && (
                                <div className="flex items-center gap-2">
                                  <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <span className="text-xs text-muted-foreground truncate">
                                    {(fatura as any).profissionais.nome}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewFatura(fatura);
                                }}
                                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                title="Ver detalhes"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {selectedRetornoFaturaId === fatura.id && (
                                <CheckCircle2 className="w-5 h-5 text-primary" />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma fatura encontrada para este cliente.
                    </p>
                  )}
                </div>
              )}

              {watchedStatus !== "retorno" && (<>
              {/* Linha 2: Valor */}
              <FormField
                control={form.control}
                name="valor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor Base</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Forma de Pagamento - apenas quando status é fechado */}
              {form.watch("status") === "fechado" && (
                <div className="space-y-3 pt-2">
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="meio_pagamento"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Meio de Pagamento</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="pix">Pix</SelectItem>
                              <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                              <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                              <SelectItem value="boleto">Boleto</SelectItem>
                              <SelectItem value="dinheiro">Dinheiro</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="forma_pagamento"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Condição</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="a_vista">À Vista</SelectItem>
                              <SelectItem value="parcelado">Parcelado</SelectItem>
                              <SelectItem value="entrada_parcelado">Entrada + Parcelado</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {form.watch("forma_pagamento") === "entrada_parcelado" && (
                    <FormField
                      control={form.control}
                      name="valor_entrada"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Valor da Entrada</FormLabel>
                          <FormControl>
                            <CurrencyInput
                              value={field.value || ""}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {(form.watch("forma_pagamento") === "parcelado" || form.watch("forma_pagamento") === "entrada_parcelado") && (
                    <FormField
                      control={form.control}
                      name="numero_parcelas"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número de Parcelas</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                                <SelectItem key={n} value={n.toString()}>
                                  {n}x
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {(form.watch("forma_pagamento") === "parcelado" || form.watch("forma_pagamento") === "entrada_parcelado") && (
                    <FormField
                      control={form.control}
                      name="taxa_parcelamento"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Taxa de Parcelamento (%)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="text"
                              placeholder="0"
                              onChange={(e) => {
                                const value = e.target.value;
                                const formatted = value.replace(/[^\d,.-]/g, '');
                                field.onChange(formatted);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {(form.watch("forma_pagamento") === "parcelado" || form.watch("forma_pagamento") === "entrada_parcelado") && parseFloat((form.watch("taxa_parcelamento") || "0").replace(',', '.')) > 0 && (
                    <FormField
                      control={form.control}
                      name="juros_pago_por"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quem paga os juros?</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="cliente">Cliente (valor é acrescido)</SelectItem>
                              <SelectItem value="empresa">Empresa (valor é descontado)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Resumo de Pagamento */}
                  {form.watch("forma_pagamento") !== "a_vista" && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                      {form.watch("forma_pagamento") === "entrada_parcelado" && (
                        <div className="flex justify-between">
                          <span>Entrada:</span>
                          <span className="font-medium">
                            R$ {(parseCurrencyToNumber(form.watch("valor_entrada") || "0") || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      {parseFloat((form.watch("taxa_parcelamento") || "0").replace(",", ".")) > 0 && (
                        <div className="flex justify-between">
                          <span>Taxa ({form.watch("juros_pago_por") === "empresa" ? "paga pela empresa" : "paga pelo cliente"}):</span>
                          <span className={cn("font-medium", form.watch("juros_pago_por") === "empresa" ? "text-red-600" : "text-orange-600")}>
                            {form.watch("juros_pago_por") === "empresa" ? "-" : "+"}{form.watch("taxa_parcelamento")}%
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Parcelas:</span>
                        <span className="font-medium">
                          {form.watch("numero_parcelas") || 1}x de R$ {(() => {
                            const total = valorTotal;
                            const taxa = parseFloat((form.watch("taxa_parcelamento") || "0").replace(",", ".")) || 0;
                            const jurosPagoPor = form.watch("juros_pago_por");
                            const valorTaxa = total * (taxa / 100);
                            const totalFinal = jurosPagoPor === "empresa" ? total : total + valorTaxa;
                            const entrada = form.watch("forma_pagamento") === "entrada_parcelado"
                              ? parseCurrencyToNumber(form.watch("valor_entrada") || "0") || 0
                              : 0;
                            const parcelas = parseInt(form.watch("numero_parcelas") || "1") || 1;
                            return ((totalFinal - entrada) / parcelas).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
                          })()}
                        </span>
                      </div>
                      {parseFloat((form.watch("taxa_parcelamento") || "0").replace(',', '.')) > 0 && (
                        <div className="flex justify-between pt-1 border-t border-border">
                          <span className="font-medium">{form.watch("juros_pago_por") === "empresa" ? "Valor a receber (após taxa):" : "Total com taxa:"}</span>
                          <span className="font-bold">
                            R$ {(() => {
                              const total = valorTotal;
                              const taxa = parseFloat((form.watch("taxa_parcelamento") || "0").replace(',', '.')) || 0;
                              const jurosPagoPor = form.watch("juros_pago_por");
                              const valorTaxa = total * (taxa / 100);
                              if (jurosPagoPor === "empresa") {
                                return (total - valorTaxa).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                              }
                              return (total + valorTaxa).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                            })()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Pagamento Parcial - disponível para fechado e negociação */}
              {watchedStatus && (watchedStatus === "fechado" || watchedStatus === "negociacao") && (
                <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Registrar pagamento parcial?</label>
                    <Switch checked={pagamentoParcial} onCheckedChange={setPagamentoParcial} />
                  </div>

                  {pagamentoParcial && (
                    <div className="space-y-3 pt-2 border-t border-border">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Valor Pago *</label>
                          <CurrencyInput value={valorPago} onChange={setValorPago} className="h-9" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Data Pagamento</label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start text-left font-normal h-9 text-xs">
                                <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                                {format(dataPagamentoParcial, "dd/MM/yy", { locale: ptBR })}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={dataPagamentoParcial}
                                onSelect={(d) => d && setDataPagamentoParcial(d)}
                                locale={ptBR}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium">Próximo Pagamento Previsto</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal h-9 text-xs",
                                !dataProximoPagamento && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                              {dataProximoPagamento
                                ? format(dataProximoPagamento, "dd/MM/yyyy", { locale: ptBR })
                                : "Selecione (opcional)"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={dataProximoPagamento}
                              onSelect={setDataProximoPagamento}
                              locale={ptBR}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium">Comprovante</label>
                        <input
                          ref={comprovanteRef}
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => setComprovante(e.target.files?.[0] || null)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full h-9 text-xs"
                          onClick={() => comprovanteRef.current?.click()}
                        >
                          <Upload className="h-3.5 w-3.5 mr-1.5" />
                          {comprovante ? comprovante.name : "Anexar comprovante (opcional)"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {form.watch("status") === "negociacao" && (
                <FormField
                  control={form.control}
                  name="data_follow_up"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Data de Follow-up</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal h-10",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? format(parse(field.value, "yyyy-MM-dd", new Date()), "dd/MM/yy") : "Selecione"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value ? parse(field.value, "yyyy-MM-dd", new Date()) : undefined}
                            onSelect={(date) => field.onChange(date ? format(date, "yyyy-MM-dd") : "")}
                            locale={ptBR}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="procedimento_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Procedimento</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o procedimento" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {procedimentos?.filter(p => p.ativo).map((proc) => (
                          <SelectItem key={proc.id} value={proc.id}>
                            {proc.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="profissional_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profissional</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o profissional" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {profissionais?.filter(p => p.ativo).map((prof) => (
                          <SelectItem key={prof.id} value={prof.id}>
                            {prof.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Seção de Upsells */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-base font-medium">Upsells (Adicionais)</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addUpsell}
                    className="gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar
                  </Button>
                </div>


                {fields.map((field, index) => {
                  const tipoAtual = form.watch(`upsells.${index}.tipo`);
                  
                  return (
                    <div key={field.id} className="border rounded-lg p-3 space-y-3 bg-muted/30">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium flex items-center gap-2">
                          {tipoAtual === "produto" ? (
                            <Package className="h-4 w-4 text-primary" />
                          ) : (
                            <Stethoscope className="h-4 w-4 text-primary" />
                          )}
                          Upsell #{index + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(index)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <FormField
                          control={form.control}
                          name={`upsells.${index}.tipo`}
                          render={({ field: tipoField }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Tipo</FormLabel>
                              <Select 
                                onValueChange={(value) => {
                                  tipoField.onChange(value);
                                  // Limpar item selecionado ao mudar tipo
                                  form.setValue(`upsells.${index}.item_id`, "");
                                  form.setValue(`upsells.${index}.valor`, "");
                                }} 
                                value={tipoField.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="produto">
                                    <span className="flex items-center gap-2">
                                      <Package className="h-3 w-3" />
                                      Produto
                                    </span>
                                  </SelectItem>
                                  <SelectItem value="procedimento">
                                    <span className="flex items-center gap-2">
                                      <Stethoscope className="h-3 w-3" />
                                      Procedimento
                                    </span>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`upsells.${index}.item_id`}
                          render={({ field: itemField }) => (
                            <FormItem>
                              <FormLabel className="text-xs">
                                {tipoAtual === "produto" ? "Produto" : "Procedimento"}
                              </FormLabel>
                              <Select 
                                onValueChange={(value) => {
                                  itemField.onChange(value);
                                  handleItemChange(index, value, tipoAtual);
                                }} 
                                value={itemField.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Selecione" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {tipoAtual === "produto" ? (
                                    produtos?.map((prod) => (
                                      <SelectItem key={prod.id} value={prod.id}>
                                        {prod.nome}
                                      </SelectItem>
                                    ))
                                  ) : (
                                    procedimentos?.filter(p => p.ativo).map((proc) => (
                                      <SelectItem key={proc.id} value={proc.id}>
                                        {proc.nome}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`upsells.${index}.valor`}
                          render={({ field: valorField }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Valor</FormLabel>
                              <FormControl>
                                <CurrencyInput
                                  value={valorField.value}
                                  onChange={valorField.onChange}
                                  className="h-9"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Resumo de valores */}
                {(fields.length > 0 || valorBaseNumerico > 0) && (
                  <div className="pt-3 mt-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Valor base:</span>
                      <span>R$ {valorBaseNumerico.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {valorUpsells > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Upsells ({fields.length}):</span>
                        <span>R$ {valorUpsells.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-semibold pt-1 border-t">
                      <span>Valor Total:</span>
                      <span className="text-primary">R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}
              </div>

              <FormField
                control={form.control}
                name="observacoes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Observações sobre a fatura..."
                        className="resize-none"
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              </>)}

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting || (watchedStatus === "retorno" && !selectedRetornoFaturaId)}>
                  {isSubmitting 
                    ? (watchedStatus === "retorno" ? "Registrando..." : "Criando...") 
                    : (watchedStatus === "retorno" ? "Confirmar Retorno" : "Criar Fatura")}
                </Button>
              </div>
            </form>
          </Form>
        </ScrollArea>
      </DialogContent>
    </Dialog>

    <FaturaResumoDialog
      open={!!previewFatura}
      onOpenChange={(open) => !open && setPreviewFatura(null)}
      fatura={previewFatura}
    />
    </>
  );
}
