import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bell, MessageSquare, Wallet, FileBarChart, Loader2, Save, ChevronDown, ChevronUp, Edit3, Calendar, Phone, Users, Zap, DollarSign, RefreshCw, Smartphone } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface AdminInstance {
  id: string;
  nome: string;
  base_url: string;
  is_active: boolean;
}

interface User {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string;
  };
}

interface NotificationConfig {
  user_id: string;
  admin_instancia_id: string | null;
  destination_type: string;
  destination_value: string | null;
  low_balance_enabled: boolean;
  low_balance_threshold: number;
  low_balance_message: string;
  low_balance_cooldown_hours: number;
  campaign_reports_enabled: boolean;
  campaign_report_message: string;
  campaign_report_period: string;
  report_day_of_week: number;
  report_time: string;
  keyword_enabled: boolean;
  keyword_balance: string;
  keyword_report: string;
  keyword_balance_message: string;
  keyword_report_message: string;
  keyword_report_period: string;
  keyword_cooldown_hours: number;
}

interface AdminNotificationsConfigProps {
  users: User[];
  isActive?: boolean; // Se a aba está ativa/visível
  instancesRefreshTrigger?: number; // Increment to trigger instances reload
}

interface BalanceInfo {
  balance: number | null;
  loading: boolean;
  error?: string;
}

export function AdminNotificationsConfig({ users, isActive = true, instancesRefreshTrigger = 0 }: AdminNotificationsConfigProps) {
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, NotificationConfig>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [balances, setBalances] = useState<Record<string, BalanceInfo>>({});
  const [hasLoadedBalances, setHasLoadedBalances] = useState(false);

  const [adminInstances, setAdminInstances] = useState<AdminInstance[]>([]);

  const loadAdminInstances = async () => {
    const adminToken = localStorage.getItem("admin_token");
    if (!adminToken) {
      setAdminInstances([]);
      return;
    }

    const { data, error } = await supabase.functions.invoke("admin-manage-users", {
      body: { action: "list_notification_instances" },
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (error) throw error;
    const instances: AdminInstance[] = (data?.instances || [])
      .filter((i: AdminInstance) => i?.is_active)
      .sort((a: AdminInstance, b: AdminInstance) => a.nome.localeCompare(b.nome));

    setAdminInstances(instances);
  };

  // Evita fazer upsert de defaults repetidamente para o mesmo usuário
  const ensuredConfigRef = useRef<Record<string, boolean>>({});

  const buildDefaultConfig = (userId: string): NotificationConfig => ({
    user_id: userId,
    admin_instancia_id: null,
    destination_type: "number",
    destination_value: null,
    low_balance_enabled: false,
    low_balance_threshold: 100,
    low_balance_message:
      "Atenção! O saldo da sua conta de anúncios está baixo (R$ {saldo}). Recomendamos adicionar mais créditos para manter suas campanhas ativas.",
    low_balance_cooldown_hours: 24,
    campaign_reports_enabled: false,
    campaign_report_message: `📊 Resultado dos últimos {periodo_dias} dias de anúncios no Meta Ads:

{data_inicio} - {data_fim}

🔹*Valor Gasto:* _R$ {gasto}_

🔹*Total de Leads:* _{conversas}_

🔹*Custo por Lead:* _R$ {custo_conversa}_

🔹*Total de Cliques:* _{cliques}_

🔹*Custo por Clique:* _R$ {cpc}_

🔹*Impressões:* _{impressoes}_

🔹*Alcance:* _{alcance}_`,
    campaign_report_period: "7",
    report_day_of_week: 1,
    report_time: "09:00",
    keyword_enabled: false,
    keyword_balance: "saldo",
    keyword_report: "relatorio",
    keyword_balance_message: `💰 *Saldo Meta Ads*

{saldo_detalhado}`,
    keyword_report_message: `📊 *Relatório de Campanhas*

Período: {data_inicio} a {data_fim}

🔹 *Gasto:* R$ {gasto}
🔹 *Leads:* {conversas}
🔹 *Custo por Lead:* R$ {custo_conversa}
🔹 *Cliques:* {cliques}
🔹 *Impressões:* {impressoes}`,
    keyword_report_period: "7",
    keyword_cooldown_hours: 1,
  });

  const upsertNotificationConfig = async (userId: string, config: NotificationConfig) => {
    const adminToken = localStorage.getItem("admin_token");
    const { error } = await supabase.functions.invoke("admin-manage-users", {
      body: {
        action: "update_notification_config",
        userId,
        adminInstanciaId: config.admin_instancia_id,
        destinationType: config.destination_type,
        destinationValue: config.destination_value,
        lowBalanceEnabled: config.low_balance_enabled,
        lowBalanceThreshold: config.low_balance_threshold,
        lowBalanceMessage: config.low_balance_message,
        lowBalanceCooldownHours: config.low_balance_cooldown_hours,
        campaignReportsEnabled: config.campaign_reports_enabled,
        campaignReportMessage: config.campaign_report_message,
        campaignReportPeriod: config.campaign_report_period,
        reportDayOfWeek: config.report_day_of_week,
        reportTime: config.report_time,
        keywordEnabled: config.keyword_enabled,
        keywordBalance: config.keyword_balance,
        keywordReport: config.keyword_report,
        keywordBalanceMessage: config.keyword_balance_message,
        keywordReportMessage: config.keyword_report_message,
        keywordReportPeriod: config.keyword_report_period,
        keywordCooldownHours: config.keyword_cooldown_hours,
      },
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (error) throw error;
  };

  const autoSavePatch = async (userId: string, patch: Partial<NotificationConfig>) => {
    const current = configs[userId];
    if (!current) return;
    const next: NotificationConfig = { ...current, ...patch };

    // Atualiza UI imediatamente
    setConfigs((prev) => ({ ...prev, [userId]: next }));

    // Persiste no backend para o webhook conseguir achar a config
    setSaving((prev) => ({ ...prev, [userId]: true }));
    try {
      await upsertNotificationConfig(userId, next);
    } catch (err) {
      console.error("Erro ao salvar automaticamente configuração:", err);
      toast.error("Não foi possível salvar automaticamente. Clique em 'Salvar Configurações'.");
    } finally {
      setSaving((prev) => ({ ...prev, [userId]: false }));
    }
  };

  // Carregar instâncias admin e configs ao montar
  useEffect(() => {
    const loadInitialData = async () => {
      setInitialLoading(true);

      // Carregar instâncias admin (via função de backend para não depender de sessão do usuário)
      try {
        await loadAdminInstances();
      } catch (err) {
        console.error("Erro ao carregar instâncias admin:", err);
        setAdminInstances([]);
        toast.error("Não foi possível carregar as instâncias do admin");
      }
      
      // Carregar configs de usuários
      for (const user of users) {
        await loadConfig(user.id);
      }
      setInitialLoading(false);
    };
    if (users.length > 0) {
      loadInitialData();
    }
  }, [users]);

  // Recarregar instâncias admin quando o trigger mudar (nova instância criada)
  useEffect(() => {
    if (instancesRefreshTrigger > 0) {
      const reloadInstances = async () => {
        try {
          await loadAdminInstances();
        } catch (err) {
          console.error("Erro ao recarregar instâncias admin:", err);
          setAdminInstances([]);
          toast.error("Não foi possível recarregar as instâncias do admin");
        }
      };
      reloadInstances();
    }
  }, [instancesRefreshTrigger]);

  // Carregar saldos apenas quando a aba estiver ativa (e apenas uma vez)
  useEffect(() => {
    if (isActive && !hasLoadedBalances && users.length > 0) {
      setHasLoadedBalances(true);
      users.forEach(user => fetchUserBalance(user.id));
    }
  }, [isActive, hasLoadedBalances, users]);

  const fetchUserBalance = async (userId: string) => {
    setBalances(prev => ({
      ...prev,
      [userId]: { balance: null, loading: true }
    }));

    try {
      const adminToken = localStorage.getItem("admin_token");
      
      // Fetch the user's Meta Ads account balance
      const { data, error } = await supabase.functions.invoke("facebook-ads-api", {
        body: { 
          action: "get_account_balance",
          userId: userId
        },
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (error) throw error;

      // Check if there's an error message in the response (e.g., no account configured)
      if (data?.error) {
        let errorMessage = "Sem conta";
        if (data.error.includes("não configurado") || data.error.includes("não configurada")) {
          errorMessage = "Sem config";
        } else if (data.error.includes("permission") || data.error.includes("OAuthException")) {
          errorMessage = "Sem permissão";
        }
        
        setBalances(prev => ({
          ...prev,
          [userId]: { 
            balance: null, 
            loading: false,
            error: errorMessage
          }
        }));
        return;
      }

      setBalances(prev => ({
        ...prev,
        [userId]: { 
          balance: data?.balance ?? null, 
          loading: false 
        }
      }));
    } catch (error) {
      console.error("Erro ao buscar saldo:", error);
      setBalances(prev => ({
        ...prev,
        [userId]: { balance: null, loading: false, error: "Erro" }
      }));
    }
  };

  const loadConfig = async (userId: string) => {
    if (configs[userId]) return; // Já carregado

    setLoading((prev) => ({ ...prev, [userId]: true }));
    try {
      const adminToken = localStorage.getItem("admin_token");
      const { data, error } = await supabase.functions.invoke("admin-manage-users", {
        body: { action: "get_notification_config", userId },
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (error) throw error;

      const nextConfig: NotificationConfig = data.config || buildDefaultConfig(userId);

      setConfigs((prev) => ({
        ...prev,
        [userId]: nextConfig,
      }));

      // Se ainda não existe registro no banco, cria automaticamente (default) para o webhook não falhar.
      if (!data.config && !ensuredConfigRef.current[userId]) {
        ensuredConfigRef.current[userId] = true;
        try {
          await upsertNotificationConfig(userId, nextConfig);
        } catch (err) {
          console.error("Erro ao criar config default no backend:", err);
          // Silencioso: o botão Salvar continua disponível
        }
      }
    } catch (error) {
      console.error("Erro ao carregar configuração:", error);
      toast.error("Erro ao carregar configuração");
    } finally {
      setLoading((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleToggleUser = (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
    } else {
      setExpandedUser(userId);
      loadConfig(userId);
    }
  };

  const updateConfig = (userId: string, field: keyof NotificationConfig, value: any) => {
    setConfigs((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: value,
      },
    }));
  };

  const saveConfig = async (userId: string) => {
    setSaving((prev) => ({ ...prev, [userId]: true }));
    try {
      const config = configs[userId];

      await upsertNotificationConfig(userId, config);

      toast.success("Configuração salva com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar configuração:", error);
      toast.error("Erro ao salvar configuração");
    } finally {
      setSaving((prev) => ({ ...prev, [userId]: false }));
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-3 sm:p-6">
        <div className="flex items-start gap-2">
          <Bell className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm sm:text-2xl leading-tight">Configurações de Avisos</CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-0.5">
              Configure avisos para cada cliente
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 p-3 sm:p-6 pt-0">
        {users.map((user) => {
          const displayName = user.user_metadata?.full_name || user.email;
          const isExpanded = expandedUser === user.id;
          const config = configs[user.id];
          const isLoading = loading[user.id];
          const isSaving = saving[user.id];
          const balanceInfo = balances[user.id];

          return (
            <Collapsible key={user.id} open={isExpanded} onOpenChange={() => handleToggleUser(user.id)}>
              <div className="flex items-center gap-2 overflow-hidden">
                {/* Switch externo */}
                <div 
                  className="flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!config) loadConfig(user.id);
                  }}
                >
                  <Switch
                    checked={config ? (config.low_balance_enabled || config.campaign_reports_enabled) : false}
                    onCheckedChange={(checked) => {
                      if (config) {
                        autoSavePatch(user.id, {
                          low_balance_enabled: checked,
                          campaign_reports_enabled: checked,
                        });
                      }
                    }}
                    disabled={!config}
                    className="scale-90"
                  />
                </div>

                <CollapsibleTrigger asChild className="flex-1 min-w-0">
                  <div className="flex items-center justify-between p-2 sm:p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors overflow-hidden">
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <p className="font-medium text-xs sm:text-sm truncate">{displayName}</p>
                        {config?.destination_value ? (
                          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                            {config.destination_type === "group" ? "Grupo" : ""}{config.destination_value}
                          </p>
                        ) : (
                          <p className="text-[10px] sm:text-xs text-muted-foreground">Sem destino</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 ml-1">
                      {/* Saldo Atual - simplificado no mobile */}
                      <div className="hidden sm:flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-muted-foreground" />
                        {balanceInfo?.loading ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        ) : balanceInfo?.error ? (
                          <span className="text-[10px] text-muted-foreground">{balanceInfo.error}</span>
                        ) : balanceInfo?.balance !== null && balanceInfo?.balance !== undefined ? (
                          <span className={`text-[10px] font-medium ${
                            config && balanceInfo.balance < config.low_balance_threshold ? "text-red-500" : "text-green-600"
                          }`}>
                            R$ {balanceInfo.balance.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">--</span>
                        )}
                      </div>

                      {/* Status Badge - compacto */}
                      {config && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          config.low_balance_enabled || config.campaign_reports_enabled 
                            ? "bg-green-500/20 text-green-600" 
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {config.low_balance_enabled || config.campaign_reports_enabled ? "On" : "Off"}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent>
                <div className="mt-2 p-2 sm:p-4 border rounded-lg bg-muted/30 space-y-3 overflow-hidden">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : config ? (
                    <>
                      {/* Instância WhatsApp Admin para envio */}
                      <div className="space-y-2 p-2 sm:p-3 rounded-lg border bg-background">
                        <Label className="flex items-center gap-2 font-medium">
                          <Smartphone className="h-4 w-4" />
                          Instância WhatsApp para Envio
                        </Label>
                        
                        {adminInstances.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Nenhuma instância admin configurada. Configure uma instância na seção "Instância WhatsApp do Admin".
                          </p>
                        ) : (
                          <>
                            <Select
                              value={config.admin_instancia_id || ""}
                              onValueChange={(value) => autoSavePatch(user.id, { admin_instancia_id: value || null })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione uma instância" />
                              </SelectTrigger>
                              <SelectContent>
                                {adminInstances.map((inst) => (
                                  <SelectItem key={inst.id} value={inst.id}>
                                    {inst.nome}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Os avisos e respostas de palavra-chave serão enviados por esta instância
                            </p>
                          </>
                        )}
                      </div>

                      <div className="space-y-3 p-3 rounded-lg border bg-background">
                        <Label className="flex items-center gap-2 font-medium">
                          <MessageSquare className="h-4 w-4" />
                          Destino dos Avisos
                        </Label>
                        
                        <RadioGroup
                          value={config.destination_type || "number"}
                          onValueChange={(value) => updateConfig(user.id, "destination_type", value)}
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="number" id={`number-${user.id}`} />
                            <Label htmlFor={`number-${user.id}`} className="flex items-center gap-1 cursor-pointer">
                              <Phone className="h-3 w-3" />
                              Número
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="group" id={`group-${user.id}`} />
                            <Label htmlFor={`group-${user.id}`} className="flex items-center gap-1 cursor-pointer">
                              <Users className="h-3 w-3" />
                              Grupo
                            </Label>
                          </div>
                        </RadioGroup>

                        <Input
                          placeholder={config.destination_type === "group" ? "ID do grupo (ex: 5511999999999-1234567890@g.us)" : "Número com DDD (ex: 5511999999999)"}
                          value={config.destination_value || ""}
                          onChange={(e) => updateConfig(user.id, "destination_value", e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {config.destination_type === "group" 
                            ? "Cole o ID do grupo WhatsApp onde os avisos serão enviados"
                            : "Informe o número de telefone com código do país (55) e DDD"}
                        </p>
                      </div>

                      {/* Aviso de Saldo Baixo */}
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
                        <div className="flex items-center gap-3">
                          <Wallet className="h-5 w-5 text-amber-500" />
                          <div>
                            <Label className="font-medium">Aviso de Saldo Baixo</Label>
                            <p className="text-xs text-muted-foreground">
                              Notificar quando o saldo de anúncios estiver baixo
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={config.low_balance_enabled}
                          onCheckedChange={(checked) =>
                            updateConfig(user.id, "low_balance_enabled", checked)
                          }
                        />
                      </div>

                      {config.low_balance_enabled && (
                        <div className="space-y-4 pl-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor={`threshold-${user.id}`}>Limite de Saldo (R$)</Label>
                              <Input
                                id={`threshold-${user.id}`}
                                type="number"
                                value={config.low_balance_threshold}
                                onChange={(e) =>
                                  updateConfig(user.id, "low_balance_threshold", parseFloat(e.target.value) || 0)
                                }
                                className="w-full"
                              />
                              <p className="text-xs text-muted-foreground">
                                Aviso será enviado quando o saldo ficar abaixo deste valor
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`low-balance-cooldown-${user.id}`}>Intervalo entre Avisos (horas)</Label>
                              <Input
                                id={`low-balance-cooldown-${user.id}`}
                                type="number"
                                min="1"
                                value={config.low_balance_cooldown_hours ?? 24}
                                onChange={(e) =>
                                  updateConfig(user.id, "low_balance_cooldown_hours", parseInt(e.target.value) || 24)
                                }
                                className="w-full"
                              />
                              <p className="text-xs text-muted-foreground">
                                Evita enviar avisos repetidos em pouco tempo
                              </p>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor={`low-balance-msg-${user.id}`} className="flex items-center gap-2">
                              <Edit3 className="h-3 w-3" />
                              Mensagem do Aviso
                            </Label>
                            <Textarea
                              id={`low-balance-msg-${user.id}`}
                              value={config.low_balance_message || ""}
                              onChange={(e) =>
                                updateConfig(user.id, "low_balance_message", e.target.value)
                              }
                              rows={4}
                              placeholder="Mensagem de aviso de saldo baixo..."
                            />
                            <p className="text-xs text-muted-foreground">
                              Variáveis disponíveis: {"{saldo}"} - valor atual do saldo
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Relatórios de Campanha */}
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
                        <div className="flex items-center gap-3">
                          <FileBarChart className="h-5 w-5 text-blue-500" />
                          <div>
                            <Label className="font-medium">Relatórios de Campanha</Label>
                            <p className="text-xs text-muted-foreground">
                              Enviar relatórios periódicos de campanhas de disparo
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={config.campaign_reports_enabled}
                          onCheckedChange={(checked) =>
                            updateConfig(user.id, "campaign_reports_enabled", checked)
                          }
                        />
                      </div>

                      {config.campaign_reports_enabled && (
                        <div className="space-y-4 pl-4">
                          {/* Agendamento do Relatório */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                            <div className="space-y-2">
                              <Label className="flex items-center gap-2 text-sm">
                                <Calendar className="h-3.5 w-3.5" />
                                Dia da Semana
                              </Label>
                              <Select
                                value={String(config.report_day_of_week ?? 1)}
                                onValueChange={(value) =>
                                  updateConfig(user.id, "report_day_of_week", parseInt(value))
                                }
                              >
                                <SelectTrigger className="h-10">
                                  <SelectValue placeholder="Selecione o dia" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">Domingo</SelectItem>
                                  <SelectItem value="1">Segunda-feira</SelectItem>
                                  <SelectItem value="2">Terça-feira</SelectItem>
                                  <SelectItem value="3">Quarta-feira</SelectItem>
                                  <SelectItem value="4">Quinta-feira</SelectItem>
                                  <SelectItem value="5">Sexta-feira</SelectItem>
                                  <SelectItem value="6">Sábado</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`report-time-${user.id}`} className="text-sm">Horário de Envio</Label>
                              <Input
                                id={`report-time-${user.id}`}
                                type="time"
                                value={config.report_time || "09:00"}
                                onChange={(e) =>
                                  updateConfig(user.id, "report_time", e.target.value)
                                }
                                className="h-10"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm">Período dos Dados</Label>
                              <Select
                                value={config.campaign_report_period || "7"}
                                onValueChange={(value) =>
                                  updateConfig(user.id, "campaign_report_period", value)
                                }
                              >
                                <SelectTrigger className="h-10">
                                  <SelectValue placeholder="Período" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1">Hoje</SelectItem>
                                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                                  <SelectItem value="14">Últimos 14 dias</SelectItem>
                                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                                  <SelectItem value="60">Últimos 60 dias</SelectItem>
                                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            O relatório será enviado automaticamente no dia e horário selecionados
                          </p>

                          {/* Mensagem do Relatório */}
                          <div className="space-y-2">
                            <Label htmlFor={`campaign-report-msg-${user.id}`} className="flex items-center gap-2">
                              <Edit3 className="h-3 w-3" />
                              Mensagem do Relatório
                            </Label>
                            <Textarea
                              id={`campaign-report-msg-${user.id}`}
                              value={config.campaign_report_message || ""}
                              onChange={(e) =>
                                updateConfig(user.id, "campaign_report_message", e.target.value)
                              }
                              rows={8}
                              placeholder="Mensagem do relatório de campanha..."
                            />
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground font-medium">Variáveis de Período:</p>
                              <p className="text-xs text-muted-foreground">
                                {"{periodo_dias}"}, {"{data_inicio}"}, {"{data_fim}"}
                              </p>
                              <p className="text-xs text-muted-foreground font-medium mt-2">Variáveis Meta Ads:</p>
                              <p className="text-xs text-muted-foreground">
                                {"{conversas}"}, {"{gasto}"}, {"{impressoes}"}, {"{cliques}"}, {"{alcance}"}, {"{cpc}"}, {"{cpm}"}, {"{ctr}"}, {"{custo_conversa}"}
                              </p>
                              <p className="text-xs text-muted-foreground font-medium mt-2">Variáveis de Disparo:</p>
                              <p className="text-xs text-muted-foreground">
                                {"{nome_campanha}"}, {"{enviados}"}, {"{falhas}"}, {"{status}"}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Gatilhos por Palavra-Chave */}
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
                        <div className="flex items-center gap-3">
                          <Zap className="h-5 w-5 text-purple-500" />
                          <div>
                            <Label className="font-medium">Gatilhos por Palavra-Chave</Label>
                            <p className="text-xs text-muted-foreground">
                              Responder automaticamente quando enviarem palavras específicas
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={config.keyword_enabled}
                          onCheckedChange={(checked) => autoSavePatch(user.id, { keyword_enabled: checked })}
                        />
                      </div>

                      {config.keyword_enabled && (
                        <div className="space-y-4 pl-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor={`keyword-balance-${user.id}`}>
                                Palavra para Saldo
                              </Label>
                              <Input
                                id={`keyword-balance-${user.id}`}
                                value={config.keyword_balance || ""}
                                onChange={(e) =>
                                  updateConfig(user.id, "keyword_balance", e.target.value.toLowerCase())
                                }
                                placeholder="Ex: saldo"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`keyword-report-${user.id}`}>
                                Palavra para Relatório
                              </Label>
                              <Input
                                id={`keyword-report-${user.id}`}
                                value={config.keyword_report || ""}
                                onChange={(e) =>
                                  updateConfig(user.id, "keyword_report", e.target.value.toLowerCase())
                                }
                                placeholder="Ex: relatorio"
                              />
                            </div>
                          </div>

                          {/* Mensagem personalizada para Saldo */}
                          <div className="space-y-2">
                            <Label htmlFor={`keyword-balance-msg-${user.id}`} className="flex items-center gap-2">
                              <Edit3 className="h-3 w-3" />
                              Mensagem de Resposta (Saldo)
                            </Label>
                            <Textarea
                              id={`keyword-balance-msg-${user.id}`}
                              value={config.keyword_balance_message || ""}
                              onChange={(e) =>
                                updateConfig(user.id, "keyword_balance_message", e.target.value)
                              }
                              rows={4}
                              placeholder="💰 *Saldo Meta Ads*..."
                            />
                            <p className="text-xs text-muted-foreground">
                              Variáveis: {"{saldo_detalhado}"} (lista de contas com saldo)
                            </p>
                          </div>

                          {/* Período do Relatório (Gatilho) */}
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <Calendar className="h-3 w-3" />
                              Período do Relatório (Gatilho)
                            </Label>
                            <Select
                              value={config.keyword_report_period || "7"}
                              onValueChange={(value) =>
                                updateConfig(user.id, "keyword_report_period", value)
                              }
                            >
                              <SelectTrigger className="w-48">
                                <SelectValue placeholder="Selecione o período" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">Hoje</SelectItem>
                                <SelectItem value="7">Últimos 7 dias</SelectItem>
                                <SelectItem value="14">Últimos 14 dias</SelectItem>
                                <SelectItem value="30">Últimos 30 dias</SelectItem>
                                <SelectItem value="60">Últimos 60 dias</SelectItem>
                                <SelectItem value="90">Últimos 90 dias</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Período das métricas quando a palavra-chave for ativada
                            </p>
                          </div>

                          {/* Mensagem personalizada para Relatório */}
                          <div className="space-y-2">
                            <Label htmlFor={`keyword-report-msg-${user.id}`} className="flex items-center gap-2">
                              <Edit3 className="h-3 w-3" />
                              Mensagem de Resposta (Relatório)
                            </Label>
                            <Textarea
                              id={`keyword-report-msg-${user.id}`}
                              value={config.keyword_report_message || ""}
                              onChange={(e) =>
                                updateConfig(user.id, "keyword_report_message", e.target.value)
                              }
                              rows={6}
                              placeholder="📊 *Relatório de Campanhas*..."
                            />
                            <p className="text-xs text-muted-foreground">
                              Variáveis: {"{periodo_dias}"}, {"{data_inicio}"}, {"{data_fim}"}, {"{gasto}"}, {"{conversas}"}, {"{custo_conversa}"}, {"{cliques}"}, {"{impressoes}"}, {"{alcance}"}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Botão Salvar */}
                      <Button
                        onClick={() => saveConfig(user.id)}
                        disabled={isSaving}
                        className="w-full"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Salvando...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Salvar Configurações
                          </>
                        )}
                      </Button>
                    </>
                  ) : null}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}

        {users.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum usuário encontrado
          </div>
        )}
      </CardContent>
    </Card>
  );
}
