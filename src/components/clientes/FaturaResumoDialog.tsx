import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { DollarSign, User, FileText, Clock, CalendarClock, CreditCard, ShoppingBag, Handshake, Receipt } from "lucide-react";
import { FaturaPagamentosSection } from "@/components/clientes/FaturaPagamentosSection";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FaturaResumoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fatura: any;
}

const meioPagamentoLabels: Record<string, string> = {
  pix: "Pix",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  boleto: "Boleto",
  dinheiro: "Dinheiro",
};

const formaPagamentoLabels: Record<string, string> = {
  a_vista: "À Vista",
  parcelado: "Parcelado",
  entrada_parcelado: "Entrada + Parcelado",
};

function InfoRow({ label, value, icon, valueClassName }: { label: string; value: string; icon?: React.ReactNode; valueClassName?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className={`text-sm font-medium ${valueClassName || ""}`}>{value}</span>
    </div>
  );
}

export function FaturaResumoDialog({ open, onOpenChange, fatura }: FaturaResumoDialogProps) {
  if (!fatura) return null;

  const isNegociacao = fatura.status === "negociacao";
  const statusLabel = isNegociacao ? "Negociação" : "Fechado";
  const statusColor = isNegociacao ? "text-blue-600" : "text-green-600";
  const statusBadgeClass = isNegociacao ? "bg-blue-500/20 text-blue-700" : "bg-green-500/20 text-green-700";
  const StatusIcon = isNegociacao ? Handshake : Receipt;

  const valorBruto = Number(fatura.valor);
  const taxa = Number(fatura.taxa_parcelamento) || 0;
  const jurosPagoPor = fatura.juros_pago_por;

  let valorLiquido = valorBruto;
  if (jurosPagoPor === "cliente" && taxa > 0) {
    valorLiquido = valorBruto / (1 + taxa / 100);
  } else if (jurosPagoPor === "empresa" && taxa > 0) {
    valorLiquido = valorBruto * (1 - taxa / 100);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col min-h-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StatusIcon className={`h-5 w-5 ${isNegociacao ? "text-blue-500" : "text-green-500"}`} />
            {isNegociacao ? "Negociação" : "Fatura"}
          </DialogTitle>
          <DialogDescription className="mt-1">
            {(fatura.leads as any)?.nome || "Cliente"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          {/* Valor e Status */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge className={`${statusBadgeClass} gap-1 rounded-md`}>
                {statusLabel}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Valor
              </span>
              <span className={`text-lg font-bold ${statusColor}`}>
                R$ {valorBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {taxa > 0 && valorLiquido !== valorBruto && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Valor Líquido</span>
                <span className="text-sm font-medium text-green-600">
                  R$ {valorLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          {/* Profissional e Procedimento */}
          {((fatura.profissionais as any)?.nome || (fatura.procedimentos as any)?.nome) && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm text-foreground border-b border-border pb-2">Atendimento</h4>
              {(fatura.profissionais as any)?.nome && (
                <InfoRow label="Profissional" value={(fatura.profissionais as any).nome} icon={<User className="h-3.5 w-3.5" />} />
              )}
              {(fatura.procedimentos as any)?.nome && (
                <InfoRow label="Procedimento" value={(fatura.procedimentos as any).nome} icon={<FileText className="h-3.5 w-3.5" />} />
              )}
            </div>
          )}

          {/* Pagamento (só para fechado) */}
          {!isNegociacao && (fatura.meio_pagamento || fatura.forma_pagamento) && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm text-foreground border-b border-border pb-2">Pagamento</h4>
              {fatura.meio_pagamento && (
                <InfoRow
                  label="Meio"
                  value={meioPagamentoLabels[fatura.meio_pagamento] || fatura.meio_pagamento}
                  icon={<CreditCard className="h-3.5 w-3.5" />}
                />
              )}
              <InfoRow
                label="Condição"
                value={formaPagamentoLabels[fatura.forma_pagamento] || "À Vista"}
              />
              {(fatura.forma_pagamento === "parcelado" || fatura.forma_pagamento === "entrada_parcelado") && fatura.numero_parcelas > 0 && (
                <InfoRow label="Parcelas" value={`${fatura.numero_parcelas}x de R$ ${Number(fatura.valor_parcela || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
              )}
              {fatura.forma_pagamento === "entrada_parcelado" && fatura.valor_entrada > 0 && (
                <InfoRow
                  label="Entrada"
                  value={`R$ ${Number(fatura.valor_entrada).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  valueClassName="text-green-600"
                />
              )}
              {taxa > 0 && (
                <>
                  <InfoRow label="Taxa" value={`${taxa}%`} valueClassName={jurosPagoPor === "empresa" ? "text-red-600" : "text-orange-600"} />
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Juros pago por</span>
                    <Badge variant={jurosPagoPor === "empresa" ? "destructive" : "secondary"} className="rounded-md text-xs">
                      {jurosPagoPor === "empresa" ? "Empresa" : "Cliente"}
                    </Badge>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Datas */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h4 className="font-medium text-sm text-foreground border-b border-border pb-2">Datas</h4>
            
            {(fatura.fatura_agendamentos as any)?.[0]?.agendamentos?.data_agendamento && (
              <InfoRow
                label="Atendido em"
                value={format(new Date((fatura.fatura_agendamentos as any)[0].agendamentos.data_agendamento), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                icon={<Clock className="h-3.5 w-3.5" />}
              />
            )}

            {fatura.data_follow_up && (
              <InfoRow
                label="Follow-up"
                value={format(new Date(fatura.data_follow_up), "dd/MM/yyyy", { locale: ptBR })}
                icon={<CalendarClock className="h-3.5 w-3.5" />}
              />
            )}

            {fatura.created_at && (
              <InfoRow
                label="Criado em"
                value={format(new Date(fatura.created_at), "dd/MM/yyyy", { locale: ptBR })}
              />
            )}
          </div>

          {/* Upsells */}
          {(fatura.fatura_upsells as any)?.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm text-foreground border-b border-border pb-2 flex items-center gap-1.5">
                <ShoppingBag className="h-3.5 w-3.5" />
                Upsells
              </h4>
              <div className="flex flex-wrap gap-1">
                {(fatura.fatura_upsells as any).map((upsell: any) => (
                  <Badge key={upsell.id} variant="secondary" className="text-xs rounded">
                    {upsell.descricao}
                    {upsell.valor > 0 && ` - R$ ${Number(upsell.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Pagamentos Parciais */}
          {fatura?.id && (
            <div className="bg-muted/50 rounded-lg p-4">
              <FaturaPagamentosSection
                faturaId={fatura.id}
                valorTotal={valorBruto}
              />
            </div>
          )}

          {/* Observações */}
          {fatura.observacoes && (
            <div className="space-y-1">
              <span className="text-sm font-medium text-muted-foreground">Observações</span>
              <p className="text-sm bg-muted/30 rounded-lg p-3">{fatura.observacoes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
