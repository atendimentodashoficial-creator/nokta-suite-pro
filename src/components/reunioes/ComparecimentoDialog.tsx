import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { CurrencyInput, parseCurrencyToNumber } from "@/components/ui/currency-input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckCircle2, XCircle, Columns3, CalendarIcon, Upload, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { getLast8Digits } from "@/utils/phoneFormat";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { uploadComprovante } from "@/hooks/useFaturaPagamentos";

interface Reuniao {
  id: string;
  cliente_telefone: string | null;
  titulo: string;
}

interface KanbanColumn {
  id: string;
  nome: string;
  cor: string;
}

interface ComparecimentoDialogProps {
  reuniao: Reuniao | null;
  tipo: "compareceu" | "nao_compareceu" | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

async function moveKanbanCard(userId: string, telefone: string, columnId: string) {
  const last8 = getLast8Digits(telefone);
  if (!last8) return;

  const { data: chats } = await supabase
    .from("disparos_chats")
    .select("id")
    .eq("user_id", userId)
    .like("normalized_number", `%${last8}`)
    .is("deleted_at", null);

  if (!chats || chats.length === 0) return;

  for (const chat of chats) {
    await supabase
      .from("disparos_chat_kanban")
      .upsert(
        { chat_id: chat.id, column_id: columnId, user_id: userId },
        { onConflict: "chat_id" }
      );
  }
}

export function ComparecimentoDialog({
  reuniao,
  tipo,
  open,
  onOpenChange,
}: ComparecimentoDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);

  // Partial payment state
  const [registrarPagamento, setRegistrarPagamento] = useState(false);
  const [selectedFaturaId, setSelectedFaturaId] = useState<string | null>(null);
  const [valorPago, setValorPago] = useState("");
  const [dataPagamento, setDataPagamento] = useState<Date>(new Date());
  const [dataProximo, setDataProximo] = useState<Date | undefined>();
  const [comprovante, setComprovante] = useState<File | null>(null);
  const comprovanteRef = useRef<HTMLInputElement>(null);

  const { data: columns, isLoading } = useQuery({
    queryKey: ["disparos-kanban-columns", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disparos_kanban_columns")
        .select("id, nome, cor")
        .eq("user_id", user!.id)
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data || []) as KanbanColumn[];
    },
    enabled: !!user?.id && open,
  });

  // Fetch client faturas by phone
  const { data: clienteFaturas } = useQuery({
    queryKey: ["comparecimento-faturas", reuniao?.cliente_telefone, user?.id],
    queryFn: async () => {
      if (!reuniao?.cliente_telefone || !user?.id) return [];
      const last8 = getLast8Digits(reuniao.cliente_telefone);
      if (!last8) return [];

      // Find leads matching phone
      const { data: leads } = await supabase
        .from("leads")
        .select("id, nome")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .like("telefone", `%${last8}`);

      if (!leads || leads.length === 0) return [];

      const leadIds = leads.map((l) => l.id);
      const { data: faturas } = await supabase
        .from("faturas")
        .select("id, valor, status, procedimentos(nome), created_at")
        .eq("user_id", user.id)
        .in("cliente_id", leadIds)
        .order("created_at", { ascending: false });

      return (faturas || []) as any[];
    },
    enabled: !!reuniao?.cliente_telefone && !!user?.id && open && registrarPagamento,
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!selectedColumnId || !reuniao || !user) throw new Error("Dados incompletos");

      // Mover card do kanban se tiver telefone
      if (reuniao.cliente_telefone) {
        await moveKanbanCard(user.id, reuniao.cliente_telefone, selectedColumnId);
      }

      // Register partial payment if enabled
      if (registrarPagamento && selectedFaturaId) {
        const valorNum = parseCurrencyToNumber(valorPago);
        if (valorNum > 0) {
          let comprovanteUrl: string | null = null;
          if (comprovante) {
            comprovanteUrl = await uploadComprovante(comprovante);
          }
          await supabase.from("fatura_pagamentos").insert({
            fatura_id: selectedFaturaId,
            user_id: user.id,
            valor: valorNum,
            data_pagamento: format(dataPagamento, "yyyy-MM-dd"),
            data_proximo_pagamento: dataProximo ? format(dataProximo, "yyyy-MM-dd") : null,
            comprovante_url: comprovanteUrl,
          });
        }
      }

      // Atualizar status da reunião
      const novoStatus = tipo === "compareceu" ? "realizada" : "nao_compareceu";
      await supabase
        .from("reunioes" as any)
        .update({ status: novoStatus })
        .eq("id", reuniao.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reunioes"] });
      queryClient.invalidateQueries({ queryKey: ["disparos-chat-kanban"] });
      queryClient.invalidateQueries({ queryKey: ["fatura-pagamentos"] });
      toast.success(
        tipo === "compareceu"
          ? "Reunião marcada como realizada!"
          : "Não comparecimento registrado!"
      );
      resetState();
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Erro ao registrar comparecimento:", error);
      toast.error("Erro ao registrar comparecimento");
    },
  });

  const resetState = () => {
    setSelectedColumnId(null);
    setRegistrarPagamento(false);
    setSelectedFaturaId(null);
    setValorPago("");
    setDataPagamento(new Date());
    setDataProximo(undefined);
    setComprovante(null);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  if (!reuniao || !tipo) return null;

  const isCompareceu = tipo === "compareceu";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col min-h-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCompareceu ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-destructive" />
            )}
            {isCompareceu ? "Compareceu" : "Não Compareceu"}
          </DialogTitle>
          <DialogDescription>
            Selecione para qual coluna do Kanban de Disparos o card do cliente deve ser movido.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : columns && columns.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Columns3 className="w-4 h-4" />
                <span>Escolha a coluna destino:</span>
              </div>
              {columns.map((col) => (
                <button
                  key={col.id}
                  onClick={() => setSelectedColumnId(col.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                    selectedColumnId === col.id
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: col.cor }}
                  />
                  <span className="font-medium text-sm">{col.nome}</span>
                  {selectedColumnId === col.id && (
                    <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-muted-foreground">
              <Columns3 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>Nenhuma coluna do Kanban encontrada.</p>
              <p className="text-xs mt-1">Configure as colunas na aba Disparos.</p>
            </div>
          )}

          {/* Partial Payment Section */}
          {reuniao.cliente_telefone && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4" />
                  Registrar pagamento parcial?
                </label>
                <Switch checked={registrarPagamento} onCheckedChange={setRegistrarPagamento} />
              </div>

              {registrarPagamento && (
                <div className="space-y-3 pt-2 border-t border-border">
                  {/* Fatura selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Fatura *</label>
                    {clienteFaturas && clienteFaturas.length > 0 ? (
                      <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                        {clienteFaturas.map((f: any) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setSelectedFaturaId(f.id)}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2 rounded-md border text-left text-xs transition-all",
                              selectedFaturaId === f.id
                                ? "border-primary bg-primary/10 ring-1 ring-primary"
                                : "border-border hover:bg-muted/50"
                            )}
                          >
                            <div>
                              <span className="font-medium">{(f.procedimentos as any)?.nome || "Sem procedimento"}</span>
                              <span className="ml-2 text-muted-foreground">
                                R$ {Number(f.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <Badge variant={f.status === "fechado" ? "default" : "secondary"} className="text-[10px]">
                              {f.status === "fechado" ? "Fechado" : "Negociação"}
                            </Badge>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhuma fatura encontrada para este cliente.</p>
                    )}
                  </div>

                  {selectedFaturaId && (
                    <>
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
                                {format(dataPagamento, "dd/MM/yy", { locale: ptBR })}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={dataPagamento}
                                onSelect={(d) => d && setDataPagamento(d)}
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
                                !dataProximo && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                              {dataProximo
                                ? format(dataProximo, "dd/MM/yyyy", { locale: ptBR })
                                : "Selecione (opcional)"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={dataProximo}
                              onSelect={setDataProximo}
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
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              className={`flex-1 gap-2 ${
                isCompareceu
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              }`}
              disabled={!selectedColumnId || confirmMutation.isPending || (registrarPagamento && (!selectedFaturaId || parseCurrencyToNumber(valorPago) <= 0))}
              onClick={() => confirmMutation.mutate()}
            >
              {isCompareceu ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              Confirmar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
