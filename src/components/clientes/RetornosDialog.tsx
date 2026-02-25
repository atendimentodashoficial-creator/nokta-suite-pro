import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw, Calendar, Clock, User, FileText, ArrowLeft, CheckCircle2, XCircle, AlertCircle, MapPin, Phone, CalendarClock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Retorno {
  id: string;
  data_agendamento: string;
  status: string;
  tipo?: string;
  observacoes?: string | null;
  data_follow_up?: string | null;
  numero_reagendamentos?: number;
  origem_agendamento?: string | null;
  origem_instancia_nome?: string | null;
  created_at?: string;
  procedimentos?: { nome: string } | null;
  profissionais?: { nome: string } | null;
  leads?: { nome?: string; telefone?: string } | null;
}

interface RetornosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  retornos: Retorno[];
  faturaLabel?: string;
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  agendado: { label: "Agendado", icon: <Calendar className="h-3 w-3" />, className: "bg-blue-500/20 text-blue-700" },
  pendente: { label: "Pendente", icon: <Clock className="h-3 w-3" />, className: "bg-yellow-500/20 text-yellow-700" },
  confirmado: { label: "Confirmado", icon: <CheckCircle2 className="h-3 w-3" />, className: "bg-green-500/20 text-green-700" },
  realizado: { label: "Realizado", icon: <CheckCircle2 className="h-3 w-3" />, className: "bg-green-500/20 text-green-700" },
  cancelado: { label: "Cancelado", icon: <XCircle className="h-3 w-3" />, className: "bg-red-500/20 text-red-700" },
  nao_compareceu: { label: "Não Compareceu", icon: <AlertCircle className="h-3 w-3" />, className: "bg-orange-500/20 text-orange-700" },
};

const getStatus = (s: string) => statusConfig[s] || { label: s, icon: <Clock className="h-3 w-3" />, className: "bg-muted text-muted-foreground" };

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export function RetornosDialog({ open, onOpenChange, retornos, faturaLabel }: RetornosDialogProps) {
  const [selectedRetorno, setSelectedRetorno] = useState<Retorno | null>(null);

  const handleClose = (o: boolean) => {
    if (!o) setSelectedRetorno(null);
    onOpenChange(o);
  };

  if (selectedRetorno) {
    const st = getStatus(selectedRetorno.status);
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col min-h-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-purple-500" />
              Retorno
            </DialogTitle>
            <DialogDescription className="mt-1">
              {(selectedRetorno.leads as any)?.nome || faturaLabel || "Retorno"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
            <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => setSelectedRetorno(null)}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>

            {/* Status e Data */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge className={`${st.className} gap-1 rounded-md`}>{st.icon}{st.label}</Badge>
              </div>

              <InfoRow
                label="Data"
                value={format(new Date(selectedRetorno.data_agendamento), "dd/MM/yyyy", { locale: ptBR })}
                icon={<Calendar className="h-3.5 w-3.5" />}
              />

              <InfoRow
                label="Horário"
                value={format(new Date(selectedRetorno.data_agendamento), "HH:mm", { locale: ptBR })}
                icon={<Clock className="h-3.5 w-3.5" />}
              />

              {selectedRetorno.tipo && (
                <InfoRow label="Tipo" value={selectedRetorno.tipo} />
              )}
            </div>

            {/* Profissional e Procedimento */}
            {((selectedRetorno.profissionais as any)?.nome || (selectedRetorno.procedimentos as any)?.nome) && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-sm text-foreground border-b border-border pb-2">Atendimento</h4>

                {(selectedRetorno.profissionais as any)?.nome && (
                  <InfoRow
                    label="Profissional"
                    value={(selectedRetorno.profissionais as any).nome}
                    icon={<User className="h-3.5 w-3.5" />}
                  />
                )}

                {(selectedRetorno.procedimentos as any)?.nome && (
                  <InfoRow
                    label="Procedimento"
                    value={(selectedRetorno.procedimentos as any).nome}
                    icon={<FileText className="h-3.5 w-3.5" />}
                  />
                )}
              </div>
            )}

            {/* Informações adicionais */}
            {(selectedRetorno.data_follow_up || (selectedRetorno.numero_reagendamentos ?? 0) > 0 || selectedRetorno.origem_agendamento) && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-sm text-foreground border-b border-border pb-2">Informações Adicionais</h4>

                {selectedRetorno.data_follow_up && (
                  <InfoRow
                    label="Follow-up"
                    value={format(new Date(selectedRetorno.data_follow_up), "dd/MM/yyyy", { locale: ptBR })}
                    icon={<CalendarClock className="h-3.5 w-3.5" />}
                  />
                )}

                {(selectedRetorno.numero_reagendamentos ?? 0) > 0 && (
                  <InfoRow
                    label="Reagendamentos"
                    value={String(selectedRetorno.numero_reagendamentos)}
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                  />
                )}

                {selectedRetorno.origem_agendamento && (
                  <InfoRow
                    label="Origem"
                    value={selectedRetorno.origem_agendamento}
                    icon={<MapPin className="h-3.5 w-3.5" />}
                  />
                )}
              </div>
            )}

            {/* Observações */}
            {selectedRetorno.observacoes && selectedRetorno.observacoes.trim() !== "" && (
              <div className="space-y-1">
                <span className="text-sm font-medium text-muted-foreground">Observações</span>
                <p className="text-sm bg-muted/30 rounded-lg p-3 whitespace-pre-wrap">{selectedRetorno.observacoes}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-purple-500" />
            Retornos
          </DialogTitle>
          <DialogDescription>{faturaLabel || "Selecione um retorno para ver os detalhes"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {retornos.map((r) => {
            const st = getStatus(r.status);
            return (
              <button
                key={r.id}
                onClick={() => setSelectedRetorno(r)}
                className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors space-y-1.5 overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {format(new Date(r.data_agendamento), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <Badge className={`${st.className} gap-1 flex-shrink-0 text-xs rounded-md whitespace-nowrap`}>{st.icon}{st.label}</Badge>
                </div>
                {((r.procedimentos as any)?.nome || (r.profissionais as any)?.nome) && (
                  <div className="flex items-center gap-1.5 ml-[22px] overflow-hidden">
                    {(r.procedimentos as any)?.nome && (
                      <span className="text-xs text-muted-foreground truncate">
                        {(r.procedimentos as any).nome}
                      </span>
                    )}
                    {(r.profissionais as any)?.nome && (
                      <span className="text-xs text-muted-foreground truncate">
                        • {(r.profissionais as any).nome}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
          {retornos.length === 0 && (
            <p className="text-center text-muted-foreground py-4 text-sm">Nenhum retorno encontrado</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
