import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, Trash2, Search, CheckCircle2, Calendar } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

// Orphan cleanup options
interface CleanupOptions {
  leadsSoftDeleted: boolean;
  leadsDuplicados: boolean;
  agendamentosOrfaos: boolean;
  chatsOrfaos: boolean;
  mensagensOrfas: boolean;
}

// Full reset options
interface ResetOptions {
  leads: boolean;
  agendamentos: boolean;
  faturas: boolean;
  chatsWhatsApp: boolean;
  chatsDisparos: boolean;
  campanhasDisparos: boolean;
  listasExtrator: boolean;
  historico: boolean;
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

interface ResetResult {
  leads: number;
  agendamentos: number;
  faturas: number;
  chatsWhatsApp: number;
  chatsDisparos: number;
  campanhasDisparos: number;
  listasExtrator: number;
  historico: number;
}

type PeriodOption = "7d" | "30d" | "90d" | "1y" | "max";

const periodOptions: { value: PeriodOption; label: string }[] = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "1y", label: "Último ano" },
  { value: "max", label: "Tudo (Máximo)" },
];

const defaultCleanupOptions: CleanupOptions = {
  leadsSoftDeleted: true,
  leadsDuplicados: true,
  agendamentosOrfaos: true,
  chatsOrfaos: true,
  mensagensOrfas: true,
};

const defaultResetOptions: ResetOptions = {
  leads: false,
  agendamentos: false,
  faturas: false,
  chatsWhatsApp: false,
  chatsDisparos: false,
  campanhasDisparos: false,
  listasExtrator: false,
  historico: false,
};

const cleanupLabels: Record<keyof CleanupOptions, { label: string; description: string }> = {
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

const resetLabels: Record<keyof ResetOptions, { label: string; description: string }> = {
  leads: { 
    label: "Leads", 
    description: "Todos os leads cadastrados no período selecionado" 
  },
  agendamentos: { 
    label: "Agendamentos", 
    description: "Todos os agendamentos no período selecionado" 
  },
  faturas: { 
    label: "Faturas", 
    description: "Todas as faturas e vendas no período selecionado" 
  },
  chatsWhatsApp: { 
    label: "Chats WhatsApp", 
    description: "Conversas e mensagens do WhatsApp no período" 
  },
  chatsDisparos: { 
    label: "Chats Disparos", 
    description: "Conversas e mensagens de Disparos no período" 
  },
  campanhasDisparos: { 
    label: "Campanhas de Disparos", 
    description: "Campanhas e contatos de disparos no período" 
  },
  listasExtrator: { 
    label: "Listas do Extrator", 
    description: "Listas salvas do extrator no período" 
  },
  historico: { 
    label: "Histórico de Leads", 
    description: "Histórico de alterações de status dos leads" 
  },
};

export function ResetDataConfig() {
  const [activeTab, setActiveTab] = useState<"orphan" | "reset">("orphan");
  const [period, setPeriod] = useState<PeriodOption>("max");
  
  // Orphan cleanup state
  const [cleanupOptions, setCleanupOptions] = useState<CleanupOptions>(defaultCleanupOptions);
  const [scanResult, setScanResult] = useState<CleanupResult | null>(null);
  
  // Full reset state
  const [resetOptions, setResetOptions] = useState<ResetOptions>(defaultResetOptions);
  const [resetScanResult, setResetScanResult] = useState<ResetResult | null>(null);
  const [confirmText, setConfirmText] = useState("");
  
  // UI state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  
  const queryClient = useQueryClient();

  const cleanupSelectedCount = Object.values(cleanupOptions).filter(Boolean).length;
  const resetSelectedCount = Object.values(resetOptions).filter(Boolean).length;

  const handleCleanupOptionChange = (key: keyof CleanupOptions, checked: boolean) => {
    setCleanupOptions(prev => ({ ...prev, [key]: checked }));
    setScanResult(null);
  };

  const handleResetOptionChange = (key: keyof ResetOptions, checked: boolean) => {
    setResetOptions(prev => ({ ...prev, [key]: checked }));
    setResetScanResult(null);
  };

  const handleSelectAllCleanup = () => {
    const allSelected = Object.values(cleanupOptions).every(Boolean);
    const newValue = !allSelected;
    setCleanupOptions({
      leadsSoftDeleted: newValue,
      leadsDuplicados: newValue,
      agendamentosOrfaos: newValue,
      chatsOrfaos: newValue,
      mensagensOrfas: newValue,
    });
    setScanResult(null);
  };

  const handleSelectAllReset = () => {
    const allSelected = Object.values(resetOptions).every(Boolean);
    const newValue = !allSelected;
    setResetOptions({
      leads: newValue,
      agendamentos: newValue,
      faturas: newValue,
      chatsWhatsApp: newValue,
      chatsDisparos: newValue,
      campanhasDisparos: newValue,
      listasExtrator: newValue,
      historico: newValue,
    });
    setResetScanResult(null);
  };

  const handleScan = async () => {
    setIsScanning(true);
    setScanResult(null);
    setResetScanResult(null);
    
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      const response = await supabase.functions.invoke("cleanup-orphan-data", {
        body: { 
          mode: activeTab,
          options: activeTab === "orphan" ? cleanupOptions : resetOptions,
          period,
          dryRun: true 
        },
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

      if (activeTab === "orphan") {
        setScanResult(response.data.result);
      } else {
        setResetScanResult(response.data.result);
      }
      
      const total = Object.values(response.data.result).reduce((a: number, b: number) => a + b, 0);
      if (total === 0) {
        toast.success(activeTab === "orphan" 
          ? "Nenhum dado órfão encontrado! Seu banco está limpo."
          : "Nenhum registro encontrado no período selecionado.");
      } else {
        toast.info(`Encontrados ${total} registros para ${activeTab === "orphan" ? "limpeza" : "remoção"}`);
      }
    } catch (error: any) {
      console.error("Scan error:", error);
      toast.error(error.message || "Erro ao escanear dados");
    } finally {
      setIsScanning(false);
    }
  };

  const handleExecute = async () => {
    if (activeTab === "reset" && confirmText !== "RESETAR") {
      toast.error("Digite RESETAR para confirmar");
      return;
    }

    setIsCleaning(true);
    
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      const response = await supabase.functions.invoke("cleanup-orphan-data", {
        body: { 
          mode: activeTab,
          options: activeTab === "orphan" ? cleanupOptions : resetOptions,
          period,
          dryRun: false 
        },
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Erro ao executar limpeza");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      const total = Object.values(response.data.result).reduce((a: number, b: number) => a + b, 0);
      toast.success(`${total} registros removidos com sucesso!`);
      
      queryClient.invalidateQueries();
      
      setScanResult(null);
      setResetScanResult(null);
      setConfirmText("");
      setShowConfirmDialog(false);
    } catch (error: any) {
      console.error("Cleanup error:", error);
      toast.error(error.message || "Erro ao executar limpeza");
    } finally {
      setIsCleaning(false);
    }
  };

  const totalOrphans = scanResult 
    ? Object.values(scanResult).reduce((a, b) => a + b, 0) 
    : 0;

  const totalReset = resetScanResult 
    ? Object.values(resetScanResult).reduce((a, b) => a + b, 0) 
    : 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Limpeza de Dados
          </CardTitle>
          <CardDescription>
            Escolha entre limpar dados órfãos (invisíveis) ou fazer um reset completo de categorias específicas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs value={activeTab} onValueChange={(v) => {
            setActiveTab(v as "orphan" | "reset");
            setScanResult(null);
            setResetScanResult(null);
          }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="orphan">Dados Órfãos</TabsTrigger>
              <TabsTrigger value="reset">Reset Completo</TabsTrigger>
            </TabsList>

            <TabsContent value="orphan" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Remove apenas registros que <strong>não são visíveis</strong> no app (duplicados, soft-deleted, órfãos).
                Dados ativos nas abas do app não serão afetados.
              </p>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {cleanupSelectedCount} categoria(s) selecionada(s)
                </span>
                <Button variant="ghost" size="sm" onClick={handleSelectAllCleanup}>
                  {Object.values(cleanupOptions).every(Boolean) ? "Desmarcar todos" : "Selecionar todos"}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(Object.keys(cleanupLabels) as Array<keyof CleanupOptions>).map((key) => (
                  <div
                    key={key}
                    className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                      cleanupOptions[key] ? "border-primary/50 bg-primary/5" : "border-border"
                    }`}
                  >
                    <Checkbox
                      id={`cleanup-${key}`}
                      checked={cleanupOptions[key]}
                      onCheckedChange={(checked) => handleCleanupOptionChange(key, checked as boolean)}
                    />
                    <div className="space-y-0.5 flex-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`cleanup-${key}`} className="cursor-pointer font-medium">
                          {cleanupLabels[key].label}
                        </Label>
                        {scanResult && (
                          <Badge variant={getCleanupResultCount(scanResult, key) > 0 ? "destructive" : "secondary"} className="text-xs">
                            {getCleanupResultCount(scanResult, key)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {cleanupLabels[key].description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {scanResult && totalOrphans > 0 && (
                <ScanResultAlert 
                  type="warning" 
                  total={totalOrphans} 
                  items={[
                    { count: scanResult.leadsSoftDeleted, label: "lead(s) excluído(s)" },
                    { count: scanResult.leadsDuplicados, label: "lead(s) duplicado(s)" },
                    { count: scanResult.agendamentosOrfaos, label: "agendamento(s) órfão(s)" },
                    { count: scanResult.chatsWhatsAppOrfaos, label: "chat(s) WhatsApp órfão(s)" },
                    { count: scanResult.chatsDisparosOrfaos, label: "chat(s) Disparos órfão(s)" },
                    { count: scanResult.mensagensWhatsAppOrfas, label: "mensagem(ns) WhatsApp órfã(s)" },
                    { count: scanResult.mensagensDisparosOrfas, label: "mensagem(ns) Disparos órfã(s)" },
                  ]}
                />
              )}

              {scanResult && totalOrphans === 0 && (
                <ScanResultAlert type="success" message="Nenhum dado órfão encontrado! Seu banco está limpo." />
              )}
            </TabsContent>

            <TabsContent value="reset" className="space-y-4 mt-4">
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-medium text-sm">
                    Atenção: Esta ação remove dados visíveis e ativos do app!
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Período:</Label>
                </div>
                <Select value={period} onValueChange={(v) => {
                  setPeriod(v as PeriodOption);
                  setResetScanResult(null);
                }}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {periodOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {resetSelectedCount} categoria(s) selecionada(s)
                </span>
                <Button variant="ghost" size="sm" onClick={handleSelectAllReset}>
                  {Object.values(resetOptions).every(Boolean) ? "Desmarcar todos" : "Selecionar todos"}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(Object.keys(resetLabels) as Array<keyof ResetOptions>).map((key) => (
                  <div
                    key={key}
                    className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                      resetOptions[key] ? "border-destructive/50 bg-destructive/5" : "border-border"
                    }`}
                  >
                    <Checkbox
                      id={`reset-${key}`}
                      checked={resetOptions[key]}
                      onCheckedChange={(checked) => handleResetOptionChange(key, checked as boolean)}
                    />
                    <div className="space-y-0.5 flex-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`reset-${key}`} className="cursor-pointer font-medium">
                          {resetLabels[key].label}
                        </Label>
                        {resetScanResult && (
                          <Badge variant={resetScanResult[key] > 0 ? "destructive" : "secondary"} className="text-xs">
                            {resetScanResult[key]}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {resetLabels[key].description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {resetScanResult && totalReset > 0 && (
                <ScanResultAlert 
                  type="destructive" 
                  total={totalReset} 
                  items={[
                    { count: resetScanResult.leads, label: "lead(s)" },
                    { count: resetScanResult.agendamentos, label: "agendamento(s)" },
                    { count: resetScanResult.faturas, label: "fatura(s)" },
                    { count: resetScanResult.chatsWhatsApp, label: "chat(s) WhatsApp" },
                    { count: resetScanResult.chatsDisparos, label: "chat(s) Disparos" },
                    { count: resetScanResult.campanhasDisparos, label: "campanha(s) de disparos" },
                    { count: resetScanResult.listasExtrator, label: "lista(s) do extrator" },
                    { count: resetScanResult.historico, label: "registro(s) de histórico" },
                  ]}
                />
              )}

              {resetScanResult && totalReset === 0 && (
                <ScanResultAlert type="success" message="Nenhum registro encontrado no período selecionado." />
              )}
            </TabsContent>
          </Tabs>

          <div className="pt-4 border-t flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              disabled={(activeTab === "orphan" ? cleanupSelectedCount : resetSelectedCount) === 0 || isScanning}
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
                  Escanear {activeTab === "orphan" ? "Órfãos" : "Dados"}
                </>
              )}
            </Button>
            
            <Button
              variant="destructive"
              disabled={
                (activeTab === "orphan" && (!scanResult || totalOrphans === 0)) ||
                (activeTab === "reset" && (!resetScanResult || totalReset === 0))
              }
              onClick={() => setShowConfirmDialog(true)}
              className="flex-1 sm:flex-none"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {activeTab === "orphan" 
                ? `Limpar ${totalOrphans > 0 ? `(${totalOrphans})` : ""}` 
                : `Resetar ${totalReset > 0 ? `(${totalReset})` : ""}`
              }
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={(open) => {
        setShowConfirmDialog(open);
        if (!open) setConfirmText("");
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${activeTab === "reset" ? "text-destructive" : "text-amber-500"}`} />
              {activeTab === "orphan" ? "Confirmar Limpeza" : "Confirmar Reset"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Você está prestes a remover <strong>{activeTab === "orphan" ? totalOrphans : totalReset}</strong> registro(s).
                </p>
                {activeTab === "orphan" ? (
                  <p className="text-sm text-muted-foreground">
                    Esses registros não são visíveis no app e não afetam as funcionalidades.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-destructive font-medium">
                      ⚠️ Esta ação irá remover dados VISÍVEIS e ATIVOS do app. Esta ação é IRREVERSÍVEL!
                    </p>
                    <div>
                      <Label htmlFor="confirm-input" className="text-sm">
                        Digite <strong>RESETAR</strong> para confirmar:
                      </Label>
                      <Input
                        id="confirm-input"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                        placeholder="RESETAR"
                        className="mt-2"
                      />
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCleaning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExecute}
              disabled={isCleaning || (activeTab === "reset" && confirmText !== "RESETAR")}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCleaning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {activeTab === "orphan" ? "Limpando..." : "Resetando..."}
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  {activeTab === "orphan" ? "Confirmar Limpeza" : "Confirmar Reset"}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Helper components
function ScanResultAlert({ 
  type, 
  total, 
  items, 
  message 
}: { 
  type: "warning" | "destructive" | "success";
  total?: number;
  items?: { count: number; label: string }[];
  message?: string;
}) {
  const colors = {
    warning: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
    destructive: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300",
    success: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300",
  };

  if (type === "success" && message) {
    return (
      <div className={`p-4 rounded-lg border ${colors.success}`}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-medium">{message}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-lg border ${colors[type]}`}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5" />
        <span className="font-medium">
          {total} registro(s) encontrado(s)
        </span>
      </div>
      {items && items.length > 0 && (
        <ul className="mt-2 text-sm opacity-80 space-y-1">
          {items.filter(i => i.count > 0).map((item, idx) => (
            <li key={idx}>• {item.count} {item.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Helper to get result count for cleanup options
function getCleanupResultCount(result: CleanupResult, key: keyof CleanupOptions): number {
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
