import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw, Calendar, Clock, User, FileText, ArrowLeft, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Retorno {
  id: string;
  data_agendamento: string;
  status: string;
  observacoes?: string | null;
  numero_reagendamentos?: number;
  procedimentos?: { nome: string } | null;
  profissionais?: { nome: string } | null;
}

interface RetornosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  retornos: Retorno[];
  faturaLabel?: string;
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  pendente: { label: "Pendente", icon: <Clock className="h-3 w-3" />, className: "bg-yellow-500/20 text-yellow-700" },
  confirmado: { label: "Confirmado", icon: <CheckCircle2 className="h-3 w-3" />, className: "bg-green-500/20 text-green-700" },
  realizado: { label: "Realizado", icon: <CheckCircle2 className="h-3 w-3" />, className: "bg-green-500/20 text-green-700" },
  cancelado: { label: "Cancelado", icon: <XCircle className="h-3 w-3" />, className: "bg-red-500/20 text-red-700" },
  nao_compareceu: { label: "Não Compareceu", icon: <AlertCircle className="h-3 w-3" />, className: "bg-orange-500/20 text-orange-700" },
};

export function RetornosDialog({ open, onOpenChange, retornos, faturaLabel }: RetornosDialogProps) {
  const [selectedRetorno, setSelectedRetorno] = useState<Retorno | null>(null);

  const handleClose = (o: boolean) => {
    if (!o) setSelectedRetorno(null);
    onOpenChange(o);
  };

  const getStatus = (s: string) => statusConfig[s] || { label: s, icon: <Clock className="h-3 w-3" />, className: "bg-muted text-muted-foreground" };

  if (selectedRetorno) {
    const st = getStatus(selectedRetorno.status);
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-purple-500" />
              Detalhes do Retorno
            </DialogTitle>
            <DialogDescription>
              {format(new Date(selectedRetorno.data_agendamento), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => setSelectedRetorno(null)}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>

            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge className={`${st.className} gap-1`}>{st.icon}{st.label}</Badge>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Data</span>
                <span className="text-sm font-medium">
                  {format(new Date(selectedRetorno.data_agendamento), "dd/MM/yyyy", { locale: ptBR })}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Horário</span>
                <span className="text-sm font-medium">
                  {format(new Date(selectedRetorno.data_agendamento), "HH:mm", { locale: ptBR })}
                </span>
              </div>

              {(selectedRetorno.profissionais as any)?.nome && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Profissional</span>
                  <span className="text-sm font-medium">{(selectedRetorno.profissionais as any).nome}</span>
                </div>
              )}

              {(selectedRetorno.procedimentos as any)?.nome && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Procedimento</span>
                  <span className="text-sm font-medium">{(selectedRetorno.procedimentos as any).nome}</span>
                </div>
              )}

              {(selectedRetorno.numero_reagendamentos ?? 0) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Reagendamentos</span>
                  <span className="text-sm font-medium">{selectedRetorno.numero_reagendamentos}</span>
                </div>
              )}
            </div>

            {selectedRetorno.observacoes && (
              <div className="space-y-1">
                <span className="text-sm font-medium text-muted-foreground">Observações</span>
                <p className="text-sm bg-muted/30 rounded-lg p-3">{selectedRetorno.observacoes}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
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
                className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium">
                      {format(new Date(r.data_agendamento), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  {(r.procedimentos as any)?.nome && (
                    <p className="text-xs text-muted-foreground mt-1 truncate ml-5.5">
                      {(r.procedimentos as any).nome}
                    </p>
                  )}
                </div>
                <Badge className={`${st.className} gap-1 flex-shrink-0 text-xs`}>{st.icon}{st.label}</Badge>
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
