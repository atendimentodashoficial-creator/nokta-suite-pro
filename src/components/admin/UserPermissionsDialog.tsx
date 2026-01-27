import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ALL_FEATURES } from "@/hooks/useUserFeatureAccess";

interface UserPermission {
  feature_key: string;
  enabled: boolean;
}

interface UserPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

export function UserPermissionsDialog({ open, onOpenChange, userId, userName }: UserPermissionsDialogProps) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Carregar permissões atuais do usuário
  useEffect(() => {
    if (open && userId) {
      loadPermissions();
    }
  }, [open, userId]);

  const loadPermissions = async () => {
    setIsLoading(true);
    try {
      const adminToken = localStorage.getItem('admin_token');
      const { data, error } = await supabase.functions.invoke('admin-manage-users', {
        body: {
          action: 'get_permissions',
          userId
        },
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });

      if (error) throw error;

      // Inicializar features com seus valores padrão
      const initialPermissions: Record<string, boolean> = {};
      ALL_FEATURES.forEach(f => {
        initialPermissions[f.key] = f.defaultEnabled;
      });

      // Aplicar permissões existentes
      if (data?.permissions) {
        data.permissions.forEach((p: UserPermission) => {
          initialPermissions[p.feature_key] = p.enabled;
        });
      }

      setPermissions(initialPermissions);
    } catch (error) {
      console.error('Erro ao carregar permissões:', error);
      toast.error('Erro ao carregar permissões');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePermission = (featureKey: string) => {
    setPermissions(prev => ({
      ...prev,
      [featureKey]: !prev[featureKey]
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const adminToken = localStorage.getItem('admin_token');
      
      // Converter para array de permissões
      const permissionsArray = Object.entries(permissions).map(([feature_key, enabled]) => ({
        feature_key,
        enabled
      }));

      const { error } = await supabase.functions.invoke('admin-manage-users', {
        body: {
          action: 'update_permissions',
          userId,
          permissions: permissionsArray
        },
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });

      if (error) throw error;

      toast.success('Permissões atualizadas com sucesso!');
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao salvar permissões:', error);
      toast.error('Erro ao salvar permissões');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectAll = () => {
    const allEnabled: Record<string, boolean> = {};
    ALL_FEATURES.forEach(f => {
      allEnabled[f.key] = true;
    });
    setPermissions(allEnabled);
  };

  const handleDeselectAll = () => {
    const allDisabled: Record<string, boolean> = {};
    ALL_FEATURES.forEach(f => {
      allDisabled[f.key] = false;
    });
    setPermissions(allDisabled);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Permissões de Acesso</DialogTitle>
          <DialogDescription>
            Configure quais abas o usuário <strong>{userName}</strong> pode acessar
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-4">
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                Marcar Todos
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                Desmarcar Todos
              </Button>
            </div>

            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {ALL_FEATURES.map((feature) => (
                  <div key={feature.key} className="flex items-center justify-between">
                    <Label htmlFor={feature.key} className="flex-1 cursor-pointer">
                      {feature.label}
                    </Label>
                    <Switch
                      id={feature.key}
                      checked={permissions[feature.key] ?? feature.defaultEnabled}
                      onCheckedChange={() => handleTogglePermission(feature.key)}
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar'
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
