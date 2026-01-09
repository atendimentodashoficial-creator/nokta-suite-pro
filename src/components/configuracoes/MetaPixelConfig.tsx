import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, ExternalLink, TestTube } from "lucide-react";
import { useMetaPixelConfig, useSaveMetaPixelConfig } from "@/hooks/useMetaPixel";
import { MetaIcon } from "@/components/icons/MetaIcon";

export function MetaPixelConfig() {
  const { data: config, isLoading } = useMetaPixelConfig();
  const saveConfig = useSaveMetaPixelConfig();

  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [eventosAtivos, setEventosAtivos] = useState({
    lead: true,
    initiate_checkout: true,
    purchase: true,
    complete_registration: true,
  });

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
