import { useState, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Trash2, FileImage, CalendarIcon, Upload, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput, parseCurrencyToNumber } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useFaturaPagamentos,
  useCreateFaturaPagamento,
  useDeleteFaturaPagamento,
  uploadComprovante,
} from "@/hooks/useFaturaPagamentos";

interface FaturaPagamentosSectionProps {
  faturaId: string;
  valorTotal: number;
}

export function FaturaPagamentosSection({ faturaId, valorTotal }: FaturaPagamentosSectionProps) {
  const { data: pagamentos, isLoading } = useFaturaPagamentos(faturaId);
  const createPagamento = useCreateFaturaPagamento();
  const deletePagamento = useDeleteFaturaPagamento();

  const [showForm, setShowForm] = useState(false);
  const [valor, setValor] = useState("");
  const [dataPagamento, setDataPagamento] = useState<Date>(new Date());
  const [dataProximo, setDataProximo] = useState<Date | undefined>();
  const [observacoes, setObservacoes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const totalPago = pagamentos?.reduce((s, p) => s + Number(p.valor), 0) || 0;
  const percentPago = valorTotal > 0 ? Math.min((totalPago / valorTotal) * 100, 100) : 0;
  const restante = Math.max(valorTotal - totalPago, 0);

  const proximoPagamento = pagamentos
    ?.filter((p) => p.data_proximo_pagamento)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    ?.data_proximo_pagamento;

  const resetForm = () => {
    setValor("");
    setDataPagamento(new Date());
    setDataProximo(undefined);
    setObservacoes("");
    setFile(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    const valorNum = parseCurrencyToNumber(valor);
    if (valorNum <= 0) {
      toast.error("Informe o valor do pagamento");
      return;
    }

    setUploading(true);
    try {
      let comprovanteUrl: string | null = null;
      if (file) {
        comprovanteUrl = await uploadComprovante(file);
      }

      await createPagamento.mutateAsync({
        fatura_id: faturaId,
        valor: valorNum,
        data_pagamento: format(dataPagamento, "yyyy-MM-dd"),
        data_proximo_pagamento: dataProximo ? format(dataProximo, "yyyy-MM-dd") : null,
        comprovante_url: comprovanteUrl,
        observacoes: observacoes || null,
      });

      toast.success("Pagamento registrado!");
      resetForm();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao registrar pagamento");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePagamento.mutateAsync({ id, faturaId });
      toast.success("Pagamento removido");
    } catch {
      toast.error("Erro ao remover pagamento");
    }
  };

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm text-foreground">Pagamentos Parciais</h4>
        {!showForm && (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Registrar
          </Button>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Pago: {fmt(totalPago)}</span>
          <span>Restante: {fmt(restante)}</span>
        </div>
        <Progress
          value={percentPago}
          className="h-3"
          style={{
            "--progress-color": percentPago >= 100 ? "hsl(var(--chart-2))" : "hsl(var(--primary))",
            "--progress-background": "hsl(var(--muted))",
          } as any}
        />
        <p className="text-xs text-right text-muted-foreground">{percentPago.toFixed(0)}%</p>
      </div>

      {proximoPagamento && (
        <div className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400">
          <CalendarIcon className="h-3 w-3" />
          Próximo pagamento previsto:{" "}
          {format(new Date(proximoPagamento + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
        </div>
      )}

      {/* Existing payments */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : pagamentos && pagamentos.length > 0 ? (
        <div className="space-y-2">
          {pagamentos.map((p) => (
            <div
              key={p.id}
              className="border rounded-lg px-3 py-2 bg-card space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{fmt(Number(p.valor))}</span>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-[10px]">
                    {format(new Date(p.data_pagamento + "T00:00:00"), "dd/MM/yy", { locale: ptBR })}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive"
                    onClick={() => handleDelete(p.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {p.observacoes && (
                <p className="text-[11px] text-muted-foreground">{p.observacoes}</p>
              )}
              {p.comprovante_url && (
                <a
                  href={p.comprovante_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <FileImage className="h-3 w-3" />
                  Ver comprovante
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
              {p.data_proximo_pagamento && (
                <p className="text-[11px] text-orange-600 dark:text-orange-400">
                  Próximo: {format(new Date(p.data_proximo_pagamento + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* New payment form */}
      {showForm && (
        <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Valor *</label>
              <CurrencyInput value={valor} onChange={setValor} className="h-9" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Data Pagamento *</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal h-9 text-xs")}
                  >
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
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full h-9 text-xs"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              {file ? file.name : "Anexar comprovante (opcional)"}
            </Button>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Observações</label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              className="text-xs resize-none"
              placeholder="Observações do pagamento..."
            />
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={handleSubmit}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Salvar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={resetForm}
              disabled={uploading}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
