import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, Trash2, Search, CheckCircle2 } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

interface CleanupOptions {
  leadsSoftDeleted: boolean;
  leadsDuplicados: boolean;
  agendamentosOrfaos: boolean;
  chatsOrfaos: boolean;
  mensagensOrfas: boolean;
}

interface CleanupResult {
  leadsSoftDeleted: number;
  leadsDuplicados: number;
  agendamentosOrfaos: number;
  chatsWhatsAppOrfaos: number;
  chatsDisparosOrfaos: number;
  mensagensWhatsAppOrfas: number;
  mensagensDisparosOrfas: number;
}

const defaultOptions: CleanupOptions = {
  leadsSoftDeleted: true,
  leadsDuplicados: true,
  agendamentosOrfaos: true,
  chatsOrfaos: true,
  mensagensOrfas: true,
};

const optionLabels: Record<keyof CleanupOptions, { label: string; description: string }> = {
  leadsSoftDeleted: { 
    label: "Leads Excluídos", 
    description: "Leads que foram deletados mas ainda estão no banco (soft delete)" 
  },
  leadsDuplicados: { 
    label: "Leads Duplicados", 
    description: "Leads com mesmo telefone (mantém apenas o mais antigo)" 
  },
  agendamentosOrfaos: { 
    label: "Agendamentos Órfãos", 
    description: "Agendamentos 'realizado' sem fatura vinculada (invisíveis no app)" 
  },
  chatsOrfaos: { 
    label: "Chats Órfãos", 
    description: "Conversas sem lead correspondente ativo" 
  },
  mensagensOrfas: { 
    label: "Mensagens Órfãs", 
    description: "Mensagens de chats que não existem mais" 
  },
};

export function ResetDataConfig() {
  const [options, setOptions] = useState<CleanupOptions>(defaultOptions);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [scanResult, setScanResult] = useState<CleanupResult | null>(null);
  const queryClient = useQueryClient();

  const selectedCount = Object.values(options).filter(Boolean).length;

  const handleOptionChange = (key: keyof CleanupOptions, checked: boolean) => {
    setOptions(prev => ({ ...prev, [key]: checked }));
    setScanResult(null); // Reset scan when options change
  };

  const handleSelectAll = () => {
    const allSelected = Object.values(options).every(Boolean);
    const newValue = !allSelected;
    setOptions({
      leadsSoftDeleted: newValue,
      leadsDuplicados: newValue,
      agendamentosOrfaos: newValue,
      chatsOrfaos: newValue,
      mensagensOrfas: newValue,
    });
    setScanResult(null);
  };

  const handleScan = async () => {
    setIsScanning(true);
    setScanResult(null);
    
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      const response = await supabase.functions.invoke("cleanup-orphan-data", {
        body: { options, dryRun: true },
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Erro ao escanear dados");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      setScanResult(response.data.result);
      
      const total = Object.values(response.data.result as CleanupResult).reduce((a, b) => a + b, 0);
      if (total === 0) {
        toast.success("Nenhum dado órfão encontrado! Seu banco está limpo.");
      } else {
        toast.info(`Encontrados ${total} registros órfãos para limpeza`);
      }
    } catch (error: any) {
      console.error("Scan error:", error);
      toast.error(error.message || "Erro ao escanear dados");
    } finally {
      setIsScanning(false);
    }
  };

  const handleCleanup = async () => {
    setIsCleaning(true);
    
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      const response = await supabase.functions.invoke("cleanup-orphan-data", {
        body: { options, dryRun: false },
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Erro ao limpar dados");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      const total = Object.values(response.data.result as CleanupResult).reduce((a, b) => a + b, 0);
      toast.success(`${total} registros órfãos removidos com sucesso!`);
      
      // Invalidate all queries to refresh data
      queryClient.invalidateQueries();
      
      setScanResult(null);
      setShowConfirmDialog(false);
    } catch (error: any) {
      console.error("Cleanup error:", error);
      toast.error(error.message || "Erro ao limpar dados");
    } finally {
      setIsCleaning(false);
    }
  };

  const totalOrphans = scanResult 
    ? Object.values(scanResult).reduce((a, b) => a + b, 0) 
    : 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Limpar Dados Órfãos
          </CardTitle>
          <CardDescription>
            Remove apenas registros que não são visíveis no app (duplicados, soft-deleted, órfãos).
            Dados ativos e visíveis nas abas do app <strong>não serão afetados</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedCount} categoria(s) selecionada(s)
            </span>
            <Button variant="ghost" size="sm" onClick={handleSelectAll}>
              {Object.values(options).every(Boolean) ? "Desmarcar todos" : "Selecionar todos"}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.keys(optionLabels) as Array<keyof CleanupOptions>).map((key) => (
              <div
                key={key}
                className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                  options[key] ? "border-primary/50 bg-primary/5" : "border-border"
                }`}
              >
                <Checkbox
                  id={key}
                  checked={options[key]}
                  onCheckedChange={(checked) => handleOptionChange(key, checked as boolean)}
                />
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={key} className="cursor-pointer font-medium">
                      {optionLabels[key].label}
                    </Label>
                    {scanResult && (
                      <Badge variant={getResultCount(scanResult, key) > 0 ? "destructive" : "secondary"} className="text-xs">
                        {getResultCount(scanResult, key)}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {optionLabels[key].description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {scanResult && totalOrphans > 0 && (
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-medium">
                  {totalOrphans} registro(s) órfão(s) encontrado(s)
                </span>
              </div>
              <ul className="mt-2 text-sm text-amber-600 dark:text-amber-400 space-y-1">
                {scanResult.leadsSoftDeleted > 0 && (
                  <li>• {scanResult.leadsSoftDeleted} lead(s) excluído(s)</li>
                )}
                {scanResult.leadsDuplicados > 0 && (
                  <li>• {scanResult.leadsDuplicados} lead(s) duplicado(s)</li>
                )}
                {scanResult.agendamentosOrfaos > 0 && (
                  <li>• {scanResult.agendamentosOrfaos} agendamento(s) órfão(s)</li>
                )}
                {scanResult.chatsWhatsAppOrfaos > 0 && (
                  <li>• {scanResult.chatsWhatsAppOrfaos} chat(s) WhatsApp órfão(s)</li>
                )}
                {scanResult.chatsDisparosOrfaos > 0 && (
                  <li>• {scanResult.chatsDisparosOrfaos} chat(s) Disparos órfão(s)</li>
                )}
                {scanResult.mensagensWhatsAppOrfas > 0 && (
                  <li>• {scanResult.mensagensWhatsAppOrfas} mensagem(ns) WhatsApp órfã(s)</li>
                )}
                {scanResult.mensagensDisparosOrfas > 0 && (
                  <li>• {scanResult.mensagensDisparosOrfas} mensagem(ns) Disparos órfã(s)</li>
                )}
              </ul>
            </div>
          )}

          {scanResult && totalOrphans === 0 && (
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">
                  Nenhum dado órfão encontrado! Seu banco está limpo.
                </span>
              </div>
            </div>
          )}

          <div className="pt-4 border-t flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              disabled={selectedCount === 0 || isScanning}
              onClick={handleScan}
              className="flex-1 sm:flex-none"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Escaneando...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Escanear Dados Órfãos
                </>
              )}
            </Button>
            
            <Button
              variant="destructive"
              disabled={!scanResult || totalOrphans === 0}
              onClick={() => setShowConfirmDialog(true)}
              className="flex-1 sm:flex-none"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Limpar {totalOrphans > 0 ? `(${totalOrphans})` : ""}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Confirmar Limpeza
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                Você está prestes a remover <strong>{totalOrphans}</strong> registro(s) órfão(s).
              </p>
              <p className="text-sm text-muted-foreground">
                Esses registros não são visíveis no app e não afetam as funcionalidades.
                A limpeza irá liberar espaço e melhorar a performance.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCleaning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCleanup}
              disabled={isCleaning}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCleaning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Limpando...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Confirmar Limpeza
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Helper to get result count for each option
function getResultCount(result: CleanupResult, key: keyof CleanupOptions): number {
  switch (key) {
    case "leadsSoftDeleted":
      return result.leadsSoftDeleted;
    case "leadsDuplicados":
      return result.leadsDuplicados;
    case "agendamentosOrfaos":
      return result.agendamentosOrfaos;
    case "chatsOrfaos":
      return result.chatsWhatsAppOrfaos + result.chatsDisparosOrfaos;
    case "mensagensOrfas":
      return result.mensagensWhatsAppOrfas + result.mensagensDisparosOrfas;
    default:
      return 0;
  }
}
