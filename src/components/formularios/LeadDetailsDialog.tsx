import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useUpdateLeadStatus, FormularioLead, FormularioEtapa } from "@/hooks/useFormularios";

interface LeadDetailsDialogProps {
  lead: (FormularioLead & { 
    formularios_templates?: { 
      nome: string;
      formularios_etapas?: FormularioEtapa[];
    } | null 
  }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

  // Criar mapa de ID -> Label baseado nas etapas do formulário
  const buildFieldLabelsMap = (): Record<string, string> => {
    const labelsMap: Record<string, string> = {};
    const etapas = lead.formularios_templates?.formularios_etapas || [];
    
    etapas.forEach(etapa => {
      // Cada etapa pode ser um campo único (ID da etapa é a chave)
      labelsMap[etapa.id] = etapa.titulo;
      
      // Ou pode ter múltiplos campos na configuração
      const config = etapa.configuracao as { 
        campos?: { id: string; label?: string; nome?: string }[];
      } | null;
      
      if (config?.campos) {
        config.campos.forEach(campo => {
          labelsMap[campo.id] = campo.label || campo.nome || campo.id;
        });
      }
    });
    
    return labelsMap;
  };

  const fieldLabels = buildFieldLabelsMap();

  const getFieldLabel = (key: string): string => {
    return fieldLabels[key] || key.replace(/_/g, " ");
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
                      <p className="text-sm text-muted-foreground">{getFieldLabel(key)}</p>
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
