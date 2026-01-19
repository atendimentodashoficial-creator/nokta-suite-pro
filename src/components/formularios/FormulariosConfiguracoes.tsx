import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useFormulariosConfig, useSaveFormulariosConfig } from "@/hooks/useFormularios";
import { Skeleton } from "@/components/ui/skeleton";

export default function FormulariosConfiguracoes() {
  const { data: config, isLoading } = useFormulariosConfig();
  const saveConfig = useSaveFormulariosConfig();

  // Google Ads
  const [googleAdsConversionId, setGoogleAdsConversionId] = useState("");
  const [googleAdsConversionLabel, setGoogleAdsConversionLabel] = useState("");
  const [googleAdsEnabled, setGoogleAdsEnabled] = useState(false);

  // Meta Pixel & Conversions API
  const [metaPixelId, setMetaPixelId] = useState("");
  const [metaPixelEvento, setMetaPixelEvento] = useState("Lead");
  const [metaPixelEnabled, setMetaPixelEnabled] = useState(false);
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaTestEventCode, setMetaTestEventCode] = useState("");

  // GA4
  const [ga4MeasurementId, setGa4MeasurementId] = useState("");
  const [ga4Evento, setGa4Evento] = useState("form_submission");
  const [ga4Enabled, setGa4Enabled] = useState(false);

  // Scripts customizados
  const [scriptsCustomizados, setScriptsCustomizados] = useState("");

  // Notificações
  const [emailNotificacao, setEmailNotificacao] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  // Comportamento
  const [timeoutMinutos, setTimeoutMinutos] = useState(30);

  useEffect(() => {
    if (config) {
      setGoogleAdsConversionId(config.google_ads_conversion_id || "");
      setGoogleAdsConversionLabel(config.google_ads_conversion_label || "");
      setGoogleAdsEnabled(config.google_ads_enabled || false);
      setMetaPixelId(config.meta_pixel_id || "");
      setMetaPixelEvento(config.meta_pixel_evento || "Lead");
      setMetaPixelEnabled(config.meta_pixel_enabled || false);
      setMetaAccessToken(config.meta_access_token || "");
      setMetaTestEventCode(config.meta_test_event_code || "");
      setGa4MeasurementId(config.ga4_measurement_id || "");
      setGa4Evento(config.ga4_evento || "form_submission");
      setGa4Enabled(config.ga4_enabled || false);
      setScriptsCustomizados(config.scripts_customizados || "");
      setEmailNotificacao(config.email_notificacao || "");
      setWebhookUrl(config.webhook_url || "");
      setTimeoutMinutos(config.timeout_minutos || 30);
    }
  }, [config]);

  const handleSave = () => {
    saveConfig.mutate({
      google_ads_conversion_id: googleAdsConversionId || null,
      google_ads_conversion_label: googleAdsConversionLabel || null,
      google_ads_enabled: googleAdsEnabled,
      meta_pixel_id: metaPixelId || null,
      meta_pixel_evento: metaPixelEvento || "Lead",
      meta_pixel_enabled: metaPixelEnabled,
      meta_access_token: metaAccessToken || null,
      meta_test_event_code: metaTestEventCode || null,
      ga4_measurement_id: ga4MeasurementId || null,
      ga4_evento: ga4Evento || "form_submission",
      ga4_enabled: ga4Enabled,
      scripts_customizados: scriptsCustomizados || null,
      email_notificacao: emailNotificacao || null,
      webhook_url: webhookUrl || null,
      timeout_minutos: timeoutMinutos,
    });
  };

  if (isLoading) {
    return <Skeleton className="h-[600px] w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Configurações Gerais</h2>
        <Button onClick={handleSave} disabled={saveConfig.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {saveConfig.isPending ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>

      {/* Pixels e Tags */}
      <Card>
        <CardHeader>
          <CardTitle>Pixels e Tags de Conversão</CardTitle>
          <CardDescription>
            Configure os pixels para rastrear conversões quando um lead completar o formulário
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Google Ads */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Google Ads</h4>
                <p className="text-sm text-muted-foreground">Conversion Tag do Google Ads</p>
              </div>
              <Switch
                checked={googleAdsEnabled}
                onCheckedChange={setGoogleAdsEnabled}
              />
            </div>
            {googleAdsEnabled && (
              <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
                <div className="space-y-2">
                  <Label>Conversion ID</Label>
                  <Input
                    value={googleAdsConversionId}
                    onChange={(e) => setGoogleAdsConversionId(e.target.value)}
                    placeholder="AW-XXXXXXXXX"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Conversion Label</Label>
                  <Input
                    value={googleAdsConversionLabel}
                    onChange={(e) => setGoogleAdsConversionLabel(e.target.value)}
                    placeholder="XXXXXXXXXXX"
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Meta Pixel & Conversions API */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Meta Pixel & API de Conversões</h4>
                <p className="text-sm text-muted-foreground">Rastreie conversões nas plataformas Meta (Facebook/Instagram)</p>
              </div>
              <Switch
                checked={metaPixelEnabled}
                onCheckedChange={setMetaPixelEnabled}
              />
            </div>
            {metaPixelEnabled && (
              <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Pixel ID</Label>
                    <Input
                      value={metaPixelId}
                      onChange={(e) => setMetaPixelId(e.target.value)}
                      placeholder="XXXXXXXXXXXXXXX"
                    />
                    <p className="text-xs text-muted-foreground">
                      ID do seu Pixel encontrado no Gerenciador de Eventos
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Evento de Conversão</Label>
                    <Input
                      value={metaPixelEvento}
                      onChange={(e) => setMetaPixelEvento(e.target.value)}
                      placeholder="Lead"
                    />
                    <p className="text-xs text-muted-foreground">
                      Nome do evento (Lead, CompleteRegistration, etc.)
                    </p>
                  </div>
                </div>
                
                <Separator className="my-2" />
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Access Token (API de Conversões)</Label>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Recomendado</span>
                  </div>
                  <Input
                    type="password"
                    value={metaAccessToken}
                    onChange={(e) => setMetaAccessToken(e.target.value)}
                    placeholder="EAAxxxxxxx..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Token de acesso para enviar eventos server-side via API de Conversões. 
                    Obtenha no <a href="https://business.facebook.com/events_manager" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Gerenciador de Eventos</a> → Configurações → Gerar Token de Acesso
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Código de Evento de Teste (Opcional)</Label>
                  <Input
                    value={metaTestEventCode}
                    onChange={(e) => setMetaTestEventCode(e.target.value)}
                    placeholder="TEST12345"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use para testar eventos na ferramenta de Eventos de Teste do Meta
                  </p>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* GA4 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Google Analytics 4</h4>
                <p className="text-sm text-muted-foreground">Envie eventos para o GA4</p>
              </div>
              <Switch
                checked={ga4Enabled}
                onCheckedChange={setGa4Enabled}
              />
            </div>
            {ga4Enabled && (
              <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
                <div className="space-y-2">
                  <Label>Measurement ID</Label>
                  <Input
                    value={ga4MeasurementId}
                    onChange={(e) => setGa4MeasurementId(e.target.value)}
                    placeholder="G-XXXXXXXXXX"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome do Evento</Label>
                  <Input
                    value={ga4Evento}
                    onChange={(e) => setGa4Evento(e.target.value)}
                    placeholder="form_submission"
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Scripts Customizados */}
          <div className="space-y-2">
            <Label>Scripts Customizados</Label>
            <p className="text-sm text-muted-foreground">
              Adicione qualquer script adicional (GA4, LinkedIn, TikTok, etc.)
            </p>
            <Textarea
              value={scriptsCustomizados}
              onChange={(e) => setScriptsCustomizados(e.target.value)}
              placeholder="<!-- Cole seu código aqui -->"
              rows={5}
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Notificações */}
      <Card>
        <CardHeader>
          <CardTitle>Notificações</CardTitle>
          <CardDescription>
            Configure como você deseja ser notificado sobre novos leads
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email para Notificação</Label>
            <Input
              type="email"
              value={emailNotificacao}
              onChange={(e) => setEmailNotificacao(e.target.value)}
              placeholder="seuemail@exemplo.com"
            />
            <p className="text-xs text-muted-foreground">
              Receba um email toda vez que um novo lead for capturado
            </p>
          </div>

          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://..."
            />
            <p className="text-xs text-muted-foreground">
              Envie os dados do lead para um webhook (Zapier, Make, n8n, etc.)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Comportamento */}
      <Card>
        <CardHeader>
          <CardTitle>Configurações de Comportamento</CardTitle>
          <CardDescription>
            Defina como o sistema deve tratar as sessões
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Timeout da Sessão (minutos)</Label>
            <Input
              type="number"
              min={5}
              max={120}
              value={timeoutMinutos}
              onChange={(e) => setTimeoutMinutos(parseInt(e.target.value) || 30)}
            />
            <p className="text-xs text-muted-foreground">
              Após este tempo sem atividade, a sessão será marcada como abandonada
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
