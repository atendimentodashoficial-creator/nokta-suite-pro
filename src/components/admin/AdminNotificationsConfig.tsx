import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bell, MessageSquare, Wallet, FileBarChart, Loader2, Save, ChevronDown, ChevronUp, Edit3, Calendar, Phone, Users, Zap } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  campaign_reports_enabled: boolean;
  campaign_report_message: string;
  campaign_report_period: string;
  keyword_enabled: boolean;
  keyword_balance: string;
  keyword_report: string;
}

interface AdminNotificationsConfigProps {
  users: User[];
}

export function AdminNotificationsConfig({ users }: AdminNotificationsConfigProps) {
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, NotificationConfig>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [initialLoading, setInitialLoading] = useState(true);

  // Carregar todas as configs ao montar o componente
  useEffect(() => {
    const loadAllConfigs = async () => {
      setInitialLoading(true);
      for (const user of users) {
        await loadConfig(user.id);
      }
      setInitialLoading(false);
    };
    if (users.length > 0) {
      loadAllConfigs();
    }
  }, [users]);

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

      setConfigs((prev) => ({
        ...prev,
        [userId]: data.config || {
          user_id: userId,
          admin_instancia_id: null,
          destination_type: "number",
          destination_value: null,
          low_balance_enabled: true,
          low_balance_threshold: 100,
          low_balance_message: "Atenção! O saldo da sua conta de anúncios está baixo (R$ {saldo}). Recomendamos adicionar mais créditos para manter suas campanhas ativas.",
          campaign_reports_enabled: true,
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
          keyword_enabled: false,
          keyword_balance: "saldo",
          keyword_report: "relatorio",
        },
      }));
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
      const adminToken = localStorage.getItem("admin_token");
      const config = configs[userId];

      const { error } = await supabase.functions.invoke("admin-manage-users", {
          body: {
            action: "update_notification_config",
            userId,
            destinationType: config.destination_type,
            destinationValue: config.destination_value,
            lowBalanceEnabled: config.low_balance_enabled,
            lowBalanceThreshold: config.low_balance_threshold,
            lowBalanceMessage: config.low_balance_message,
            campaignReportsEnabled: config.campaign_reports_enabled,
            campaignReportMessage: config.campaign_report_message,
            campaignReportPeriod: config.campaign_report_period,
            keywordEnabled: config.keyword_enabled,
            keywordBalance: config.keyword_balance,
            keywordReport: config.keyword_report,
          },
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (error) throw error;

      toast.success("Configuração salva com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar configuração:", error);
      toast.error("Erro ao salvar configuração");
    } finally {
      setSaving((prev) => ({ ...prev, [userId]: false }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Configurações de Avisos por Cliente</CardTitle>
            <CardDescription>
              Configure a instância WhatsApp e preferências de avisos para cada cliente
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {users.map((user) => {
          const displayName = user.user_metadata?.full_name || user.email;
          const isExpanded = expandedUser === user.id;
          const config = configs[user.id];
          const isLoading = loading[user.id];
          const isSaving = saving[user.id];

          return (
            <Collapsible key={user.id} open={isExpanded} onOpenChange={() => handleToggleUser(user.id)}>
              <div className="flex items-center gap-2">
                {/* Switch fora do card - carrega config ao montar se necessário */}
                <div 
                  className="flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Carregar config se ainda não foi carregada
                    if (!config) {
                      loadConfig(user.id);
                    }
                  }}
                >
                  <Switch
                    checked={config ? (config.low_balance_enabled || config.campaign_reports_enabled) : false}
                    onCheckedChange={(checked) => {
                      if (config) {
                        updateConfig(user.id, "low_balance_enabled", checked);
                        updateConfig(user.id, "campaign_reports_enabled", checked);
                      }
                    }}
                    disabled={!config}
                  />
                </div>

                <CollapsibleTrigger asChild className="flex-1">
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{displayName}</p>
                        {config?.destination_value ? (
                          <p className="text-xs text-muted-foreground">
                            {config.destination_type === "group" ? "Grupo" : "Número"}: {config.destination_value}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Destino não configurado</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {config && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          config.low_balance_enabled || config.campaign_reports_enabled 
                            ? "bg-green-500/20 text-green-600" 
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {config.low_balance_enabled || config.campaign_reports_enabled ? "Ativo" : "Inativo"}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent>
                <div className="mt-2 p-4 border rounded-lg bg-muted/30 space-y-4 ml-10">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : config ? (
                    <>

                      {/* Destino dos Avisos */}
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
                        <div className="space-y-4 pl-4 border-l-2 border-amber-500/30">
                          <div className="space-y-2">
                            <Label htmlFor={`threshold-${user.id}`}>Limite de Saldo (R$)</Label>
                            <Input
                              id={`threshold-${user.id}`}
                              type="number"
                              value={config.low_balance_threshold}
                              onChange={(e) =>
                                updateConfig(user.id, "low_balance_threshold", parseFloat(e.target.value) || 0)
                              }
                              className="w-32"
                            />
                            <p className="text-xs text-muted-foreground">
                              Aviso será enviado quando o saldo ficar abaixo deste valor
                            </p>
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
                        <div className="space-y-4 pl-4 border-l-2 border-blue-500/30">
                          {/* Período do Relatório */}
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <Calendar className="h-3 w-3" />
                              Período do Relatório
                            </Label>
                            <Select
                              value={config.campaign_report_period || "7"}
                              onValueChange={(value) =>
                                updateConfig(user.id, "campaign_report_period", value)
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
                              Período das métricas do Meta Ads no relatório
                            </p>
                          </div>

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
                          onCheckedChange={(checked) =>
                            updateConfig(user.id, "keyword_enabled", checked)
                          }
                        />
                      </div>

                      {config.keyword_enabled && (
                        <div className="space-y-4 pl-4 border-l-2 border-purple-500/30">
                          <div className="grid grid-cols-2 gap-4">
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
                              <p className="text-xs text-muted-foreground">
                                Ao enviar essa palavra, retorna o saldo atual
                              </p>
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
                              <p className="text-xs text-muted-foreground">
                                Ao enviar essa palavra, retorna o relatório de campanhas
                              </p>
                            </div>
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
