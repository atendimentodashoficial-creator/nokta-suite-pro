import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Save, ExternalLink, TestTube, Send, CheckCircle2, XCircle, Clock, RefreshCw, Trash2 } from "lucide-react";
import { useMetaPixelConfig, useSaveMetaPixelConfig, useSendConversionEvent, useConversionEvents, useDeleteConversionEvent } from "@/hooks/useMetaPixel";
import { MetaIcon } from "@/components/icons/MetaIcon";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function MetaPixelConfig() {
  const { data: config, isLoading } = useMetaPixelConfig();
  const saveConfig = useSaveMetaPixelConfig();
  const sendEvent = useSendConversionEvent();
  const deleteEvent = useDeleteConversionEvent();
  const { data: conversionEvents, isLoading: eventsLoading, refetch: refetchEvents } = useConversionEvents();

  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [mensagemFormulario, setMensagemFormulario] = useState(
    "Olá! Para finalizar seu cadastro, precisamos de algumas informações adicionais. Por favor, preencha o formulário abaixo:"
  );
  const [eventosAtivos, setEventosAtivos] = useState({
    lead: true,
    initiate_checkout: true,
    purchase: true,
    complete_registration: true,
  });
  const [testEventType, setTestEventType] = useState<"Lead" | "InitiateCheckout" | "Purchase" | "CompleteRegistration">("Lead");
  const [isSendingTest, setIsSendingTest] = useState(false);

  const handleSendTestEvent = async () => {
    if (!config) return;
    
    setIsSendingTest(true);
    try {
      await sendEvent.mutateAsync({
        event_name: testEventType,
        value: testEventType === "Purchase" ? 100 : undefined,
        currency: testEventType === "Purchase" ? "BRL" : undefined,
        customer_name: "Teste Lovable",
        customer_phone: "5511999999999",
        external_id: `test_${Date.now()}`,
      });
      refetchEvents();
    } finally {
      setIsSendingTest(false);
    }
  };

  useEffect(() => {
    if (config) {
      setPixelId(config.pixel_id || "");
      setAccessToken(config.access_token || "");
      setTestEventCode(config.test_event_code || "");
      setMensagemFormulario(
        config.mensagem_formulario || 
        "Olá! Para finalizar seu cadastro, precisamos de algumas informações adicionais. Por favor, preencha o formulário abaixo:"
      );
      setEventosAtivos(config.eventos_ativos || {
        lead: true,
        initiate_checkout: true,
        purchase: true,
        complete_registration: true,
      });
    }
  }, [config]);

  const handleSave = () => {
    saveConfig.mutate({
      pixel_id: pixelId,
      access_token: accessToken,
      test_event_code: testEventCode,
      mensagem_formulario: mensagemFormulario,
      eventos_ativos: eventosAtivos,
    });
  };

  const toggleEvento = (evento: keyof typeof eventosAtivos) => {
    setEventosAtivos((prev) => ({
      ...prev,
      [evento]: !prev[evento],
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Configuração básica */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pixel_id">Pixel ID</Label>
            <Input
              id="pixel_id"
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="access_token">Access Token (Conversions API)</Label>
            <Input
              id="access_token"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="test_event_code">Código de Teste (Opcional)</Label>
            <div className="flex gap-2">
              <Input
                id="test_event_code"
                value={testEventCode}
                onChange={(e) => setTestEventCode(e.target.value)}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => window.open("https://business.facebook.com/events_manager", "_blank")}
                title="Abrir Gerenciador de Eventos"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Mensagem do formulário de conversão */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mensagem_formulario">
              Mensagem do Formulário de Conversão
            </Label>
            <textarea
              id="mensagem_formulario"
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={mensagemFormulario}
              onChange={(e) => setMensagemFormulario(e.target.value)}
            />
          </div>
        </div>

        {/* Eventos ativos */}
        <div className="space-y-4">
          <Label>Eventos Automáticos</Label>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">Lead</p>
                <p className="text-sm text-muted-foreground">Automático quando um novo lead é criado via formulário</p>
              </div>
              <Switch
                checked={eventosAtivos.lead}
                onCheckedChange={() => toggleEvento("lead")}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">CompleteRegistration</p>
                <p className="text-sm text-muted-foreground">Automático quando um agendamento é confirmado (lead qualificado)</p>
              </div>
              <Switch
                checked={eventosAtivos.complete_registration}
                onCheckedChange={() => toggleEvento("complete_registration")}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">Purchase</p>
                <p className="text-sm text-muted-foreground">Automático quando uma fatura é fechada/paga</p>
              </div>
              <Switch
                checked={eventosAtivos.purchase}
                onCheckedChange={() => toggleEvento("purchase")}
              />
            </div>
          </div>
        </div>

        {/* Botão de salvar */}
        <Button
          onClick={handleSave}
          disabled={!pixelId || !accessToken || saveConfig.isPending}
          className="w-full"
        >
          {saveConfig.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Salvar Configuração
            </>
          )}
        </Button>

        {/* Seção de Teste */}
        {config && (
          <>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="flex items-center gap-2">
                    <TestTube className="h-4 w-4" />
                    Testar Envio de Evento
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Envie um evento de teste para verificar a configuração
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <select
                  value={testEventType}
                  onChange={(e) => setTestEventType(e.target.value as typeof testEventType)}
                  className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="Lead">Lead</option>
                  <option value="InitiateCheckout">InitiateCheckout</option>
                  <option value="Purchase">Purchase (R$ 100)</option>
                  <option value="CompleteRegistration">CompleteRegistration</option>
                </select>
                <Button
                  onClick={handleSendTestEvent}
                  disabled={isSendingTest}
                  variant="secondary"
                >
                  {isSendingTest ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Enviar Teste
                    </>
                  )}
                </Button>
              </div>

              {testEventCode && (
                <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-md">
                  💡 Com o código de teste "{testEventCode}" ativo, o evento aparecerá na aba "Eventos de Teste" do Gerenciador de Eventos do Meta
                </p>
              )}
            </div>
          </>
        )}

        {/* Histórico de Eventos */}
        <Separator />
        <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Histórico de Eventos</Label>
                  <p className="text-sm text-muted-foreground">
                    Últimos eventos enviados para o Meta Pixel
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchEvents()}
                  disabled={eventsLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${eventsLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              <ScrollArea className="h-[300px] rounded-md border">
                {eventsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : conversionEvents && conversionEvents.length > 0 ? (
                  <div className="p-4 space-y-3">
                    {conversionEvents.map((event) => {
                      const response = event.response as { events_received?: number; messages?: string[]; error?: { message?: string } } | null;
                      const isSuccess = event.status === 'sent' && response?.events_received && response.events_received > 0;
                      const isError = event.status === 'error' || (response?.error);
                      
                      return (
                        <div
                          key={event.id}
                          className="p-3 border rounded-lg space-y-2 bg-muted/30"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={isSuccess ? 'default' : isError ? 'destructive' : 'secondary'}>
                                {event.event_name}
                              </Badge>
                              {isSuccess ? (
                                <div className="flex items-center gap-1 text-green-600">
                                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                                  <span className="text-xs font-medium">Recebido</span>
                                </div>
                              ) : isError ? (
                                <div className="flex items-center gap-1 text-red-600">
                                  <XCircle className="h-4 w-4 shrink-0" />
                                  <span className="text-xs font-medium">Erro</span>
                                </div>
                              ) : (
                                <Clock className="h-4 w-4 text-yellow-500 shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                <span className="sm:hidden">{format(new Date(event.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                                <span className="hidden sm:inline">{format(new Date(event.created_at), "HH:mm dd/MM", { locale: ptBR })}</span>
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => deleteEvent.mutate(event.id)}
                                disabled={deleteEvent.isPending}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          {/* Dados enviados */}
                          <div className="p-2 bg-background rounded border overflow-hidden">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Dados do Evento:</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                              <div>
                                <span className="text-muted-foreground">Evento:</span>{" "}
                                <span className="font-medium">{event.event_name}</span>
                              </div>
                              {event.value && (
                                <div>
                                  <span className="text-muted-foreground">Valor:</span>{" "}
                                  <span className="font-medium">R$ {Number(event.value).toFixed(2)}</span>
                                </div>
                              )}
                              {event.lead_id && (
                                <div className="col-span-1 sm:col-span-2 break-all">
                                  <span className="text-muted-foreground">Lead ID:</span>{" "}
                                  <span className="font-mono text-xs">{event.lead_id.slice(0, 8)}...</span>
                                </div>
                              )}
                              {event.utm_source && (
                                <div className="break-all">
                                  <span className="text-muted-foreground">UTM Source:</span>{" "}
                                  <span className="font-medium">{event.utm_source}</span>
                                </div>
                              )}
                              {event.utm_campaign && (
                                <div className="break-all">
                                  <span className="text-muted-foreground">UTM Campaign:</span>{" "}
                                  <span className="font-medium truncate">{event.utm_campaign}</span>
                                </div>
                              )}
                              {event.fbclid && (
                                <div className="col-span-1 sm:col-span-2 break-all">
                                  <span className="text-muted-foreground">FBCLID:</span>{" "}
                                  <span className="font-mono text-xs">{event.fbclid.slice(0, 20)}...</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {(event as any).customer_data_sent && (
                            <div className="p-2 bg-background rounded border overflow-hidden">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Dados do Cliente Enviados:</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                                {(event as any).customer_data_sent?.values?.phone && (
                                  <div>
                                    <span className="text-green-600">✓</span>{" "}
                                    <span className="text-muted-foreground">Telefone:</span>{" "}
                                    <span className="font-medium">{(event as any).customer_data_sent.values.phone}</span>
                                  </div>
                                )}
                                {(event as any).customer_data_sent?.values?.email && (
                                  <div>
                                    <span className="text-green-600">✓</span>{" "}
                                    <span className="text-muted-foreground">Email:</span>{" "}
                                    <span className="font-medium">{(event as any).customer_data_sent.values.email}</span>
                                  </div>
                                )}
                                {(event as any).customer_data_sent?.values?.name && (
                                  <div className="col-span-1 sm:col-span-2 break-all">
                                    <span className="text-green-600">✓</span>{" "}
                                    <span className="text-muted-foreground">Nome:</span>{" "}
                                    <span className="font-medium">{(event as any).customer_data_sent.values.name}</span>
                                  </div>
                                )}
                                {(event as any).customer_data_sent?.values?.gender && (
                                  <div>
                                    <span className="text-green-600">✓</span>{" "}
                                    <span className="text-muted-foreground">Gênero:</span>{" "}
                                    <span className="font-medium">{(event as any).customer_data_sent.values.gender}</span>
                                  </div>
                                )}
                                {(event as any).customer_data_sent?.values?.date_of_birth && (
                                  <div>
                                    <span className="text-green-600">✓</span>{" "}
                                    <span className="text-muted-foreground">Data Nasc.:</span>{" "}
                                    <span className="font-medium">{(event as any).customer_data_sent.values.date_of_birth}</span>
                                  </div>
                                )}
                                {(event as any).customer_data_sent?.values?.city && (
                                  <div>
                                    <span className="text-green-600">✓</span>{" "}
                                    <span className="text-muted-foreground">Cidade:</span>{" "}
                                    <span className="font-medium">{(event as any).customer_data_sent.values.city}</span>
                                  </div>
                                )}
                                {(event as any).customer_data_sent?.values?.state && (
                                  <div>
                                    <span className="text-green-600">✓</span>{" "}
                                    <span className="text-muted-foreground">Estado:</span>{" "}
                                    <span className="font-medium">{(event as any).customer_data_sent.values.state}</span>
                                  </div>
                                )}
                                {(event as any).customer_data_sent?.values?.zip && (
                                  <div>
                                    <span className="text-green-600">✓</span>{" "}
                                    <span className="text-muted-foreground">CEP:</span>{" "}
                                    <span className="font-medium">{(event as any).customer_data_sent.values.zip}</span>
                                  </div>
                                )}
                                {(event as any).customer_data_sent?.country && (
                                  <div>
                                    <span className="text-green-600">✓</span>{" "}
                                    <span className="text-muted-foreground">País:</span>{" "}
                                    <span className="font-medium">BR</span>
                                  </div>
                                )}
                                {(event as any).customer_data_sent?.external_id && (
                                  <div>
                                    <span className="text-green-600">✓</span>{" "}
                                    <span className="text-muted-foreground">External ID</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Resposta do Meta */}
                          <div className="p-2 bg-background rounded border overflow-hidden">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Resposta do Meta:</p>
                            {isSuccess ? (
                              <div className="text-xs text-green-600">
                                ✓ {response?.events_received} evento(s) recebido(s) com sucesso
                                {response?.messages && response.messages.length > 0 && (
                                  <p className="text-yellow-600 mt-1">⚠️ {response.messages.join(", ")}</p>
                                )}
                              </div>
                            ) : isError ? (
                              <div className="text-xs text-red-600">
                                ✗ {response?.error?.message || "Erro ao enviar evento"}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">Processando...</div>
                            )}
                          </div>

                          {event.response && (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                Ver resposta completa (JSON)
                              </summary>
                              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                                {JSON.stringify(event.response, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Clock className="h-8 w-8 mb-2" />
                    <p>Nenhum evento enviado ainda</p>
                    <p className="text-xs">Envie um evento de teste acima</p>
                  </div>
                )}
              </ScrollArea>
            </div>

    </div>
  );
}
