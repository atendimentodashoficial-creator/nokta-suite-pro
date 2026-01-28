import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User } from "lucide-react";

interface EditarProfissionalDialogProps {
  reuniao: {
    id: string;
    titulo: string;
    profissional_id: string | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditarProfissionalDialog({
  reuniao,
  open,
  onOpenChange,
}: EditarProfissionalDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [profissionalId, setProfissionalId] = useState<string>("");

  // Fetch profissionais
  const { data: profissionais } = useQuery({
    queryKey: ["profissionais", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profissionais")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && open,
  });

  // Set initial value when dialog opens
  useEffect(() => {
    if (reuniao?.profissional_id) {
      setProfissionalId(reuniao.profissional_id);
    } else {
      setProfissionalId("");
    }
  }, [reuniao, open]);

  const updateMutation = useMutation({
    mutationFn: async (newProfissionalId: string | null) => {
      const { error } = await supabase
        .from("reunioes" as any)
        .update({ profissional_id: newProfissionalId })
        .eq("id", reuniao?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reunioes"] });
      toast.success("Profissional atualizado com sucesso!");
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Erro ao atualizar:", error);
      toast.error("Erro ao atualizar profissional");
    },
  });

  const handleSave = () => {
    updateMutation.mutate(profissionalId || null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Editar Profissional
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Reunião: <strong>{reuniao?.titulo}</strong>
          </p>

          <div className="space-y-2">
            <Label htmlFor="profissional">Profissional</Label>
            <Select value={profissionalId} onValueChange={setProfissionalId}>
              <SelectTrigger id="profissional">
                <SelectValue placeholder="Selecione um profissional" />
              </SelectTrigger>
              <SelectContent>
                {profissionais?.map((prof) => (
                  <SelectItem key={prof.id} value={prof.id}>
                    {prof.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
