import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Save, ExternalLink, TestTube, Send, CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";
import { useMetaPixelConfig, useSaveMetaPixelConfig, useSendConversionEvent, useConversionEvents } from "@/hooks/useMetaPixel";
import { MetaIcon } from "@/components/icons/MetaIcon";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function MetaPixelConfig() {
  const { data: config, isLoading } = useMetaPixelConfig();
  const saveConfig = useSaveMetaPixelConfig();
  const sendEvent = useSendConversionEvent();
  const { data: conversionEvents, isLoading: eventsLoading, refetch: refetchEvents } = useConversionEvents();

  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
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
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <MetaIcon className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <CardTitle>Meta Pixel (Conversions API)</CardTitle>
            <CardDescription>
              Configure a integração com o Meta Pixel para rastrear conversões
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Configuração básica */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pixel_id">Pixel ID</Label>
            <Input
              id="pixel_id"
              placeholder="Ex: 1234567890123456"
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Encontre seu Pixel ID no Gerenciador de Eventos do Meta
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="access_token">Access Token (Conversions API)</Label>
            <Input
              id="access_token"
              type="password"
              placeholder="Token de acesso da Conversions API"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Gere o token no Meta Business Suite → Gerenciador de Eventos → Configurações
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="test_event_code">Código de Teste (Opcional)</Label>
            <div className="flex gap-2">
              <Input
                id="test_event_code"
                placeholder="TEST12345"
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
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TestTube className="h-3 w-3" />
              Use para testar eventos sem afetar dados reais
            </p>
          </div>
        </div>

        {/* Eventos ativos */}
        <div className="space-y-4">
          <Label className="text-base font-semibold">Eventos Automáticos</Label>
          <p className="text-sm text-muted-foreground">
            Escolha quais eventos devem ser enviados automaticamente ao Pixel
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">Lead</p>
                <p className="text-sm text-muted-foreground">Quando um novo lead é criado</p>
              </div>
              <Switch
                checked={eventosAtivos.lead}
                onCheckedChange={() => toggleEvento("lead")}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">InitiateCheckout</p>
                <p className="text-sm text-muted-foreground">Quando um agendamento é confirmado</p>
              </div>
              <Switch
                checked={eventosAtivos.initiate_checkout}
                onCheckedChange={() => toggleEvento("initiate_checkout")}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">Purchase</p>
                <p className="text-sm text-muted-foreground">Quando uma fatura é paga</p>
              </div>
              <Switch
                checked={eventosAtivos.purchase}
                onCheckedChange={() => toggleEvento("purchase")}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">CompleteRegistration</p>
                <p className="text-sm text-muted-foreground">Quando um lead vira cliente</p>
              </div>
              <Switch
                checked={eventosAtivos.complete_registration}
                onCheckedChange={() => toggleEvento("complete_registration")}
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
                  <Label className="text-base font-semibold flex items-center gap-2">
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
        {config && (
          <>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-semibold">Histórico de Eventos</Label>
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
                    {conversionEvents.map((event) => (
                      <div
                        key={event.id}
                        className="p-3 border rounded-lg space-y-2 bg-muted/30"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant={event.status === 'success' ? 'default' : event.status === 'error' ? 'destructive' : 'secondary'}>
                              {event.event_name}
                            </Badge>
                            {event.status === 'success' ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : event.status === 'error' ? (
                              <XCircle className="h-4 w-4 text-red-500" />
                            ) : (
                              <Clock className="h-4 w-4 text-yellow-500" />
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(event.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {event.value && (
                            <div>
                              <span className="text-muted-foreground">Valor:</span>{" "}
                              <span className="font-medium">R$ {event.value}</span>
                            </div>
                          )}
                          {event.utm_source && (
                            <div>
                              <span className="text-muted-foreground">Origem:</span>{" "}
                              <span className="font-medium">{event.utm_source}</span>
                            </div>
                          )}
                          {event.utm_campaign && (
                            <div>
                              <span className="text-muted-foreground">Campanha:</span>{" "}
                              <span className="font-medium">{event.utm_campaign}</span>
                            </div>
                          )}
                          {event.fbclid && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">FBCLID:</span>{" "}
                              <span className="font-mono text-xs">{event.fbclid.slice(0, 20)}...</span>
                            </div>
                          )}
                        </div>

                        {event.response && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                              Ver resposta do Meta
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                              {JSON.stringify(event.response, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
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
          </>
        )}

        {/* Links úteis */}
        <div className="pt-4 border-t">
          <p className="text-sm font-medium mb-2">Links Úteis</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open("https://business.facebook.com/events_manager", "_blank")}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Gerenciador de Eventos
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open("https://developers.facebook.com/docs/marketing-api/conversions-api/", "_blank")}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Documentação API
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
