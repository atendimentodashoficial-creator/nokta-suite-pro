import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useUpdateLeadStatus, FormularioLead } from "@/hooks/useFormularios";

interface LeadDetailsDialogProps {
  lead: (FormularioLead & { formularios_templates?: { nome: string } | null }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusColors: Record<string, string> = {
  novo: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  contactado: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  fechado: "bg-green-500/10 text-green-500 border-green-500/20",
  negado: "bg-red-500/10 text-red-500 border-red-500/20",
};

const statusLabels: Record<string, string> = {
  novo: "Novo",
  contactado: "Contactado",
  fechado: "Fechado",
  negado: "Negado",
};

export default function LeadDetailsDialog({ lead, open, onOpenChange }: LeadDetailsDialogProps) {
  const updateStatus = useUpdateLeadStatus();

  if (!lead) return null;

  const formatTime = (seconds: number | null) => {
    if (!seconds) return "-";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const handleStatusChange = (status: string) => {
    updateStatus.mutate({ id: lead.id, status });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Lead</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Nome</p>
              <p className="font-medium">{lead.nome || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{lead.email || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Telefone</p>
              <p className="font-medium">{lead.telefone || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Select value={lead.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[150px] mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="novo">Novo</SelectItem>
                  <SelectItem value="contactado">Contactado</SelectItem>
                  <SelectItem value="fechado">Fechado</SelectItem>
                  <SelectItem value="negado">Negado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Formulário</p>
              <p className="font-medium">{lead.formularios_templates?.nome || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Data de Criação</p>
              <p className="font-medium">
                {format(new Date(lead.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tempo para Completar</p>
              <p className="font-medium">{formatTime(lead.tempo_total_segundos)}</p>
            </div>
          </div>

          {lead.dados && Object.keys(lead.dados).length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="font-semibold mb-3">Dados Capturados</h4>
                <div className="grid grid-cols-1 gap-3">
                  {Object.entries(lead.dados).map(([key, value]) => (
                    <div key={key} className="bg-muted p-3 rounded-lg">
                      <p className="text-sm text-muted-foreground capitalize">{key.replace(/_/g, " ")}</p>
                      <p className="font-medium">
                        {Array.isArray(value) ? value.join(", ") : String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
