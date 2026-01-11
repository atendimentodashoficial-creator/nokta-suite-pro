import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface ResetOptions {
  leads: boolean;
  agendamentos: boolean;
  faturas: boolean;
  chatsWhatsApp: boolean;
  chatsDisparos: boolean;
  historicoMensagens: boolean;
  campanhasDisparos: boolean;
  listasExtrator: boolean;
}

const defaultOptions: ResetOptions = {
  leads: false,
  agendamentos: false,
  faturas: false,
  chatsWhatsApp: false,
  chatsDisparos: false,
  historicoMensagens: false,
  campanhasDisparos: false,
  listasExtrator: false,
};

const optionLabels: Record<keyof ResetOptions, { label: string; description: string }> = {
  leads: { label: "Leads", description: "Todos os leads e histórico de status" },
  agendamentos: { label: "Agendamentos", description: "Todos os agendamentos e avisos enviados" },
  faturas: { label: "Faturas", description: "Todas as faturas, upsells e vínculos" },
  chatsWhatsApp: { label: "Chats WhatsApp", description: "Conversas e mensagens do WhatsApp principal" },
  chatsDisparos: { label: "Chats Disparos", description: "Conversas e mensagens da aba Disparos" },
  historicoMensagens: { label: "Histórico Instagram", description: "Mensagens e interações do Instagram" },
  campanhasDisparos: { label: "Campanhas de Disparos", description: "Campanhas de massa e contatos" },
  listasExtrator: { label: "Listas do Extrator", description: "Listas salvas do extrator de contatos" },
};

export function ResetDataConfig() {
  const [options, setOptions] = useState<ResetOptions>(defaultOptions);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const queryClient = useQueryClient();

  const selectedCount = Object.values(options).filter(Boolean).length;
  const hasSelection = selectedCount > 0;

  const handleOptionChange = (key: keyof ResetOptions, checked: boolean) => {
    setOptions(prev => ({ ...prev, [key]: checked }));
  };

  const handleSelectAll = () => {
    const allSelected = Object.values(options).every(Boolean);
    const newValue = !allSelected;
    setOptions({
      leads: newValue,
      agendamentos: newValue,
      faturas: newValue,
      chatsWhatsApp: newValue,
      chatsDisparos: newValue,
      historicoMensagens: newValue,
      campanhasDisparos: newValue,
      listasExtrator: newValue,
    });
  };

  const handleReset = async () => {
    if (confirmText !== "RESETAR") {
      toast.error("Digite 'RESETAR' para confirmar");
      return;
    }

    setIsResetting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      const response = await supabase.functions.invoke("reset-user-data", {
        body: { options },
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Erro ao resetar dados");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast.success("Dados resetados com sucesso!");
      
      // Invalidate all queries to refresh data
      queryClient.invalidateQueries();
      
      // Reset form
      setOptions(defaultOptions);
      setConfirmText("");
      setShowConfirmDialog(false);
    } catch (error: any) {
      console.error("Reset error:", error);
      toast.error(error.message || "Erro ao resetar dados");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Resetar Dados
          </CardTitle>
          <CardDescription>
            Apague dados selecionados da sua conta. Esta ação é irreversível.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedCount} item(s) selecionado(s)
            </span>
            <Button variant="ghost" size="sm" onClick={handleSelectAll}>
              {Object.values(options).every(Boolean) ? "Desmarcar todos" : "Selecionar todos"}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.keys(optionLabels) as Array<keyof ResetOptions>).map((key) => (
              <div
                key={key}
                className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                  options[key] ? "border-destructive/50 bg-destructive/5" : "border-border"
                }`}
              >
                <Checkbox
                  id={key}
                  checked={options[key]}
                  onCheckedChange={(checked) => handleOptionChange(key, checked as boolean)}
                />
                <div className="space-y-0.5">
                  <Label htmlFor={key} className="cursor-pointer font-medium">
                    {optionLabels[key].label}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {optionLabels[key].description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t">
            <Button
              variant="destructive"
              disabled={!hasSelection}
              onClick={() => setShowConfirmDialog(true)}
              className="w-full md:w-auto"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Resetar Dados Selecionados
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Confirmar Reset de Dados
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                Você está prestes a apagar permanentemente os seguintes dados:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {(Object.keys(options) as Array<keyof ResetOptions>)
                  .filter((key) => options[key])
                  .map((key) => (
                    <li key={key} className="text-destructive">
                      {optionLabels[key].label}
                    </li>
                  ))}
              </ul>
              <p className="font-semibold text-destructive">
                Esta ação é IRREVERSÍVEL. Todos os dados selecionados serão permanentemente apagados.
              </p>
              <div className="space-y-2">
                <Label htmlFor="confirm-reset">
                  Digite <span className="font-mono font-bold">RESETAR</span> para confirmar:
                </Label>
                <Input
                  id="confirm-reset"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder="RESETAR"
                  className="font-mono"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              disabled={confirmText !== "RESETAR" || isResetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isResetting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Resetando...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Confirmar Reset
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
