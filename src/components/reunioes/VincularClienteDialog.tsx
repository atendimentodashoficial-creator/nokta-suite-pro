import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, Phone, Search, Link2, Check } from "lucide-react";
import { toast } from "sonner";

interface VincularClienteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reuniaoId: string;
  clienteIdAtual?: string | null;
}

export function VincularClienteDialog({
  open,
  onOpenChange,
  reuniaoId,
  clienteIdAtual,
}: VincularClienteDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads-para-vincular", user?.id, search],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("id, nome, telefone, status")
        .eq("user_id", user?.id)
        .is("deleted_at", null)
        .order("nome");

      if (search.trim()) {
        query = query.or(`nome.ilike.%${search}%,telefone.ilike.%${search}%`);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && open,
  });

  const vincularMutation = useMutation({
    mutationFn: async (clienteId: string | null) => {
      const lead = clienteId ? leads?.find((l) => l.id === clienteId) : null;
      
      const { error } = await supabase
        .from("reunioes")
        .update({
          cliente_id: clienteId,
          cliente_telefone: lead?.telefone || null,
        })
        .eq("id", reuniaoId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reunioes"] });
      toast.success("Cliente vinculado com sucesso!");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Erro ao vincular cliente");
    },
  });

  const handleVincular = (clienteId: string) => {
    vincularMutation.mutate(clienteId);
  };

  const handleDesvincular = () => {
    vincularMutation.mutate(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Vincular Cliente à Reunião
          </DialogTitle>
          <DialogDescription>
            Selecione um cliente para vincular a esta reunião transcrita
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Cliente vinculado atual */}
          {clienteIdAtual && (
            <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border border-primary/20">
              <span className="text-sm font-medium">Cliente já vinculado</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDesvincular}
                disabled={vincularMutation.isPending}
              >
                Desvincular
              </Button>
            </div>
          )}

          {/* Lista de leads */}
          <ScrollArea className="h-[300px] border rounded-lg">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                Carregando...
              </div>
            ) : leads && leads.length > 0 ? (
              <div className="divide-y">
                {leads.map((lead) => (
                  <div
                    key={lead.id}
                    className={`flex items-center justify-between p-3 hover:bg-muted/50 transition-colors ${
                      lead.id === clienteIdAtual ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate">{lead.nome}</span>
                        {lead.id === clienteIdAtual && (
                          <Check className="w-4 h-4 text-primary shrink-0" />
                        )}
                      </div>
                      {lead.telefone && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                          <Phone className="w-3 h-3" />
                          <span>{lead.telefone}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant={lead.id === clienteIdAtual ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => handleVincular(lead.id)}
                      disabled={vincularMutation.isPending || lead.id === clienteIdAtual}
                    >
                      {lead.id === clienteIdAtual ? "Vinculado" : "Vincular"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                {search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
