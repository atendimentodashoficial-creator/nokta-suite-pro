import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Trash2, Plus, X, CalendarIcon } from "lucide-react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useProcedimentos } from "@/hooks/useProcedimentos";
import { useProfissionais } from "@/hooks/useProfissionais";
import { useProdutos } from "@/hooks/useProdutos";

import type { Fatura } from "@/hooks/useFaturas";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const upsellSchema = z.object({
  tipo: z.enum(["produto", "procedimento"]),
  item_id: z.string().min(1, "Selecione um item"),
  descricao: z.string().min(1, "Descrição é obrigatória"),
  valor: z.string().min(1, "Valor é obrigatório"),
});

const faturaSchema = z.object({
  valor_base: z.string().min(1, "Valor é obrigatório"),
  status: z.enum(["negociacao", "fechado"]),
  data_fatura: z.string().optional(),
  procedimento_id: z.string().optional(),
  profissional_id: z.string().optional(),
  data_follow_up: z.string().optional(),
  observacoes: z.string().optional(),
  upsells: z.array(upsellSchema).optional(),
  meio_pagamento: z.string().optional(),
  forma_pagamento: z.enum(["a_vista", "parcelado", "entrada_parcelado"]),
  valor_entrada: z.string().optional(),
  numero_parcelas: z.string().optional(),
  taxa_parcelamento: z.string().optional(),
  juros_pago_por: z.enum(["cliente", "empresa"]),
});

type FaturaFormData = z.infer<typeof faturaSchema>;

interface EditarFaturaDialogProps {
  fatura: Fatura;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditarFaturaDialog({
  fatura,
  open,
  onOpenChange,
}: EditarFaturaDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const queryClient = useQueryClient();
  const { data: procedimentos } = useProcedimentos();
  const { data: profissionais } = useProfissionais();
  const { data: produtos } = useProdutos(true);

  // Fetch existing upsells
  const { data: existingUpsells } = useQuery({
    queryKey: ["fatura-upsells", fatura.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fatura_upsells")
        .select("*")
        .eq("fatura_id", fatura.id);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Calculate base value (total - upsells)
  const upsellsTotal = existingUpsells?.reduce((sum, u) => sum + Number(u.valor), 0) || 0;
  const valorBase = Number(fatura.valor) - upsellsTotal;

  const form = useForm<FaturaFormData>({
    resolver: zodResolver(faturaSchema),
    defaultValues: {
      valor_base: valorBase.toString(),
      status: fatura.status,
      data_fatura: fatura.data_fatura || undefined,
      procedimento_id: fatura.procedimento_id || undefined,
      profissional_id: fatura.profissional_id || undefined,
      data_follow_up: fatura.data_follow_up || undefined,
      observacoes: fatura.observacoes || undefined,
      upsells: [],
      meio_pagamento: (fatura as any).meio_pagamento || undefined,
      forma_pagamento:
        (fatura.forma_pagamento as "a_vista" | "parcelado" | "entrada_parcelado") ||
        "a_vista",
      valor_entrada: fatura.valor_entrada?.toString() || "",
      numero_parcelas: fatura.numero_parcelas?.toString() || "1",
      taxa_parcelamento: fatura.taxa_parcelamento?.toString() || "0",
      juros_pago_por:
        ((fatura as any).juros_pago_por as "cliente" | "empresa") || "cliente",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "upsells",
  });

  // Reset form when existing upsells are loaded
  useEffect(() => {
    if (existingUpsells && open) {
      const upsellsForForm = existingUpsells.map(u => ({
        tipo: u.tipo as "produto" | "procedimento",
        item_id: u.produto_id || u.procedimento_id || "",
        descricao: u.descricao,
        valor: u.valor.toString(),
      }));
      
      form.reset({
        valor_base: valorBase.toString(),
        status: fatura.status,
        data_fatura: fatura.data_fatura || undefined,
        procedimento_id: fatura.procedimento_id || undefined,
        profissional_id: fatura.profissional_id || undefined,
        data_follow_up: fatura.data_follow_up || undefined,
        observacoes: fatura.observacoes || undefined,
        upsells: upsellsForForm,
        meio_pagamento: (fatura as any).meio_pagamento || undefined,
        forma_pagamento:
          (fatura.forma_pagamento as "a_vista" | "parcelado" | "entrada_parcelado") ||
          "a_vista",
        valor_entrada: fatura.valor_entrada?.toString() || "",
        numero_parcelas: fatura.numero_parcelas?.toString() || "1",
        taxa_parcelamento: fatura.taxa_parcelamento?.toString() || "0",
        juros_pago_por:
          ((fatura as any).juros_pago_por as "cliente" | "empresa") || "cliente",
      });
    }
  }, [existingUpsells, open, fatura, valorBase, form]);

  const statusAtual = form.watch("status");
  const upsellsWatch = form.watch("upsells") || [];
  const valorBaseWatch = parseCurrencyToNumber(form.watch("valor_base") || "0");
  const valorUpsells = upsellsWatch.reduce((sum, u) => sum + parseCurrencyToNumber(u?.valor || "0"), 0);
  const valorTotal = valorBaseWatch + valorUpsells;

  const updateFatura = useMutation({
    mutationFn: async (data: FaturaFormData) => {
      const valorBase = parseCurrencyToNumber(data.valor_base) + (data.upsells?.reduce((sum, u) => sum + parseCurrencyToNumber(u.valor), 0) || 0);

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
      const valorTaxa = valorBase * (taxaParcelamento / 100);
      let valorFinal = valorBase;
      
      if (data.juros_pago_por === "cliente") {
        valorFinal = valorBase + valorTaxa;
      } else {
        valorFinal = valorBase;
      }
      
      let valorParcela = 0;
      if (data.forma_pagamento === "parcelado") {
        valorParcela = valorFinal / numeroParcelas;
      } else if (data.forma_pagamento === "entrada_parcelado") {
        valorParcela = (valorFinal - valorEntrada) / numeroParcelas;
      }

      // Check if status is changing to "fechado" and if Purchase wasn't already sent
      const statusChangingToFechado = data.status === "fechado" && fatura.status !== "fechado";
      const purchaseAlreadySent = !!fatura.pixel_event_sent_at;

      // Update fatura
      const { error: faturaError } = await supabase
        .from("faturas")
        .update({
          valor: valorFinal,
          status: data.status,
          data_fatura: data.data_fatura || null,
          procedimento_id: data.procedimento_id || null,
          profissional_id: data.profissional_id || null,
          data_follow_up: data.data_follow_up || null,
          observacoes: data.observacoes || null,
          meio_pagamento: data.meio_pagamento || null,
          forma_pagamento: data.forma_pagamento,
          valor_entrada: valorEntrada,
          numero_parcelas: numeroParcelas,
          valor_parcela: valorParcela,
          taxa_parcelamento: taxaParcelamento,
          juros_pago_por: data.juros_pago_por,
        })
        .eq("id", fatura.id);

      if (faturaError) throw faturaError;

      // Delete existing upsells
      const { error: deleteError } = await supabase
        .from("fatura_upsells")
        .delete()
        .eq("fatura_id", fatura.id);

      if (deleteError) throw deleteError;

      // Insert new upsells
      if (data.upsells && data.upsells.length > 0) {
        const upsellsToInsert = data.upsells.map(upsell => ({
          fatura_id: fatura.id,
          tipo: upsell.tipo,
          descricao: upsell.descricao,
          valor: parseCurrencyToNumber(upsell.valor),
          produto_id: upsell.tipo === "produto" ? upsell.item_id : null,
          procedimento_id: upsell.tipo === "procedimento" ? upsell.item_id : null,
        }));

        const { error: upsellError } = await supabase
          .from("fatura_upsells")
          .insert(upsellsToInsert);

        if (upsellError) throw upsellError;
      }

      // Return data for onSuccess handler
      return { 
        newStatus: data.status, 
        valorFinal,
        dataFatura: data.data_fatura,
        shouldSendPurchase: statusChangingToFechado && !purchaseAlreadySent
      };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["fatura-upsells"] });
      
      // Automatically send Purchase event when status changes to "fechado" (idempotent)
      if (result.shouldSendPurchase) {
        try {
          const { sendPurchaseConversion } = await import("@/hooks/useMetaConversions");
          
          const conversionResult = await sendPurchaseConversion(
            fatura.id,
            fatura.cliente_id,
            result.valorFinal,
            result.dataFatura || undefined
          );
          
          if (conversionResult.success) {
            // Mark as sent
            await supabase
              .from("faturas")
              .update({ 
                pixel_event_sent_at: new Date().toISOString(),
                pixel_status: "enviado"
              })
              .eq("id", fatura.id);
            
            console.log("Meta Conversion: Purchase sent automatically for fatura", fatura.id);
            toast.success("Fatura atualizada e evento Purchase enviado ao Meta!");
          } else {
            console.log("Meta Conversion: Purchase not sent -", conversionResult.error);
            toast.success("Fatura atualizada com sucesso!");
          }
        } catch (error) {
          console.error("Meta Conversion: Failed to send Purchase", error);
          toast.success("Fatura atualizada com sucesso!");
          // Don't throw - this shouldn't block the fatura update
        }
      } else {
        toast.success("Fatura atualizada com sucesso!");
      }
      
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Erro ao atualizar fatura:", error);
      toast.error("Erro ao atualizar fatura");
    },
  });

  const deleteFatura = useMutation({
    mutationFn: async () => {
      // Delete fatura_agendamentos first
      await supabase
        .from("fatura_agendamentos")
        .delete()
        .eq("fatura_id", fatura.id);

      // Delete upsells
      await supabase
        .from("fatura_upsells")
        .delete()
        .eq("fatura_id", fatura.id);

      // Delete fatura
      const { error } = await supabase
        .from("faturas")
        .delete()
        .eq("id", fatura.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      queryClient.invalidateQueries({ queryKey: ["fatura-upsells"] });
      toast.success("Fatura excluída com sucesso!");
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Erro ao excluir fatura:", error);
      toast.error("Erro ao excluir fatura");
    },
  });

  const onSubmit = async (data: FaturaFormData) => {
    setIsSubmitting(true);
    try {
      await updateFatura.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    await deleteFatura.mutateAsync();
    setShowDeleteDialog(false);
  };

  const handleAddUpsell = () => {
    append({
      tipo: "produto",
      item_id: "",
      descricao: "",
      valor: "",
    });
  };

  const handleItemChange = (index: number, itemId: string, tipo: "produto" | "procedimento") => {
    if (tipo === "produto") {
      const produto = produtos?.find(p => p.id === itemId);
      if (produto) {
        form.setValue(`upsells.${index}.descricao`, produto.nome);
        form.setValue(`upsells.${index}.valor`, produto.valor.toString());
      }
    } else {
      const procedimento = procedimentos?.find(p => p.id === itemId);
      if (procedimento) {
        form.setValue(`upsells.${index}.descricao`, procedimento.nome);
        form.setValue(`upsells.${index}.valor`, procedimento.valor_medio?.toString() || "0");
      }
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Fatura</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Linha 1: Data e Status */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="data_fatura"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Data da Fatura</FormLabel>
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
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Selecione o status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="negociacao">Negociação</SelectItem>
                          <SelectItem value="fechado">Fechado</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Linha 2: Valor */}
              <FormField
                control={form.control}
                name="valor_base"
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="procedimento_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Procedimento</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {procedimentos
                            ?.filter((p) => p.ativo)
                            .map((proc) => (
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
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {profissionais
                            ?.filter((p) => p.ativo)
                            .map((prof) => (
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
              </div>

              {statusAtual === "negociacao" && (
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

              {/* Forma de Pagamento */}
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
                            type="number"
                            step="0.01"
                            placeholder="0"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {(form.watch("forma_pagamento") === "parcelado" || form.watch("forma_pagamento") === "entrada_parcelado") && parseFloat(form.watch("taxa_parcelamento") || "0") > 0 && (
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
                        <span className={`font-medium ${form.watch("juros_pago_por") === "empresa" ? "text-red-600" : "text-orange-600"}`}>
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
                    {parseFloat((form.watch("taxa_parcelamento") || "0").replace(",", ".")) > 0 && (
                      <div className="flex justify-between pt-1 border-t border-border">
                        <span className="font-medium">{form.watch("juros_pago_por") === "empresa" ? "Valor a receber (após taxa):" : "Total com taxa:"}</span>
                        <span className="font-bold">
                          R$ {(() => {
                            const total = valorTotal;
                            const taxa = parseFloat((form.watch("taxa_parcelamento") || "0").replace(",", ".")) || 0;
                            const jurosPagoPor = form.watch("juros_pago_por");
                            const valorTaxa = total * (taxa / 100);
                            if (jurosPagoPor === "empresa") {
                              return (total - valorTaxa).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
                            }
                            return (total + valorTaxa).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
                          })()}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Upsells Section */}
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-base font-semibold">Upsells (Produtos/Procedimentos Extras)</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddUpsell}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar
                  </Button>
                </div>

                {fields.map((field, index) => {
                  const tipoAtual = form.watch(`upsells.${index}.tipo`);
                  return (
                    <div key={field.id} className="flex items-end gap-2 border p-3 rounded-md">
                      <FormField
                        control={form.control}
                        name={`upsells.${index}.tipo`}
                        render={({ field }) => (
                          <FormItem className="w-32">
                            <FormLabel>Tipo</FormLabel>
                            <Select
                              onValueChange={(value) => {
                                field.onChange(value);
                                form.setValue(`upsells.${index}.item_id`, "");
                                form.setValue(`upsells.${index}.descricao`, "");
                                form.setValue(`upsells.${index}.valor`, "");
                              }}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Tipo" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="produto">Produto</SelectItem>
                                <SelectItem value="procedimento">Procedimento</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`upsells.${index}.item_id`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel>Item</FormLabel>
                            <Select
                              onValueChange={(value) => {
                                field.onChange(value);
                                handleItemChange(index, value, tipoAtual);
                              }}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {tipoAtual === "produto"
                                  ? produtos?.map((prod) => (
                                      <SelectItem key={prod.id} value={prod.id}>
                                        {prod.nome} - R$ {prod.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </SelectItem>
                                    ))
                                  : procedimentos
                                      ?.filter((p) => p.ativo)
                                      .map((proc) => (
                                        <SelectItem key={proc.id} value={proc.id}>
                                          {proc.nome} - R$ {(proc.valor_medio || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </SelectItem>
                                      ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`upsells.${index}.valor`}
                        render={({ field }) => (
                          <FormItem className="w-32">
                            <FormLabel>Valor</FormLabel>
                            <FormControl>
                              <CurrencyInput
                                value={field.value}
                                onChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => remove(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}

                {/* Totals */}
                {fields.length > 0 && (
                  <div className="bg-muted/50 p-3 rounded-md space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Valor Base:</span>
                      <span>R$ {valorBaseWatch.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Valor Upsells:</span>
                      <span>R$ {valorUpsells.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t pt-1">
                      <span>Total:</span>
                      <span>R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
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
                        placeholder="Observações sobre a fatura..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-between gap-3 pt-4">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </Button>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={isSubmitting}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Fatura</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta fatura? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
