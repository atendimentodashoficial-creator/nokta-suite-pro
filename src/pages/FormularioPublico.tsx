import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, AlertCircle, ChevronRight, ChevronLeft } from "lucide-react";
import { z } from "zod";
import { CountryCodeSelect } from "@/components/whatsapp/CountryCodeSelect";
import { formatPhoneByCountry, getPhonePlaceholder, stripCountryCode } from "@/utils/phoneFormat";

interface EtapaConfig {
  id: string;
  ordem: number;
  titulo: string;
  descricao: string | null;
  tipo: string;
  obrigatorio: boolean;
  ativo: boolean;
  configuracao: {
    opcoes?: string[];
    campos?: { id: string; label: string; tipo: string; obrigatorio: boolean }[];
  };
}

interface TemplateConfig {
  id: string;
  user_id: string;
  nome: string;
  status: string;
  cor_primaria: string;
  pagina_obrigado_titulo: string | null;
  pagina_obrigado_mensagem: string | null;
  pagina_obrigado_cta_texto: string | null;
  pagina_obrigado_cta_link: string | null;
  formularios_etapas: EtapaConfig[];
}

const phoneSchema = z.string().regex(/^[\d\s\-\+\(\)]+$/, "Telefone inválido").min(8, "Telefone muito curto");
const emailSchema = z.string().email("Email inválido");

export default function FormularioPublico() {
  const { templateId } = useParams<{ templateId: string }>();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get("preview") === "true";

  const [config, setConfig] = useState<TemplateConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<Record<string, string | string[]>>({});
  const [tempoPorEtapaState, setTempoPorEtapaState] = useState<Record<string, number>>({});
  const [countryCode, setCountryCode] = useState("55");
  const [currentStep, setCurrentStep] = useState(1);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date>(new Date());
  const stepStartTime = useRef<Date>(new Date());

  const etapas = config?.formularios_etapas?.filter(e => e.ativo).sort((a, b) => a.ordem - b.ordem) || [];
  const totalSteps = etapas.length;
  const currentEtapa = etapas.find(e => e.ordem === currentStep);
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  // Load form config
  useEffect(() => {
    async function loadForm() {
      if (!templateId) {
        setError("Formulário não encontrado");
        setLoading(false);
        return;
      }

      // Try to find by slug first, then by ID
      let query = supabase
        .from("formularios_templates")
        .select("*, formularios_etapas(*)");
      
      // Check if templateId looks like a UUID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateId);
      
      if (isUUID) {
        query = query.eq("id", templateId);
      } else {
        query = query.eq("slug", templateId);
      }
      
      const { data, error } = await query.maybeSingle();

      if (error || !data) {
        setError("Formulário não encontrado");
        setLoading(false);
        return;
      }

      if (data.status !== "ativo" && !isPreview) {
        setError("Formulário inativo");
        setLoading(false);
        return;
      }

      setConfig(data as TemplateConfig);
      setLoading(false);
      setStartTime(new Date());
      stepStartTime.current = new Date();

      // Create session if not preview
      if (!isPreview) {
        const sessionToken = crypto.randomUUID();
        const urlParams = new URLSearchParams(window.location.search);
        
        const { data: session, error: sessionError } = await supabase
          .from("formularios_sessoes")
          .insert({
            template_id: templateId,
            user_id: data.user_id,
            session_token: sessionToken,
            etapa_atual: 1,
            dados_parciais: {},
            tempo_por_etapa: {},
            utm_source: urlParams.get("utm_source"),
            utm_medium: urlParams.get("utm_medium"),
            utm_campaign: urlParams.get("utm_campaign"),
            utm_term: urlParams.get("utm_term"),
            utm_content: urlParams.get("utm_content"),
            fbclid: urlParams.get("fbclid"),
            gclid: urlParams.get("gclid"),
            ip_address: null,
            user_agent: navigator.userAgent,
          })
          .select()
          .single();

        if (!sessionError && session) {
          setSessionId(session.id);
        }
      }
    }

    loadForm();
  }, [templateId, isPreview]);

  // Handle session abandonment using sendBeacon for reliability
  useEffect(() => {
    if (!sessionId || isPreview) return;

    const markAsAbandoned = () => {
      if (submitted) return;
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      
      // Use edge function endpoint that accepts POST (sendBeacon only works with POST)
      const url = `${supabaseUrl}/functions/v1/formulario-abandono`;
      const body = JSON.stringify({
        session_id: sessionId,
        etapa_atual: currentStep,
        dados_parciais: formData,
      });
      
      // sendBeacon is most reliable for page unload
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !submitted) {
        markAsAbandoned();
      }
    };

    const handleBeforeUnload = () => {
      markAsAbandoned();
    };

    // visibilitychange is more reliable on mobile
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);
    
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
    };
  }, [sessionId, currentStep, formData, submitted, isPreview]);

  const validateField = (tipo: string, value: string, obrigatorio: boolean): string | null => {
    if (obrigatorio && !value?.trim()) {
      return "Campo obrigatório";
    }
    if (!value?.trim()) return null;

    try {
      if (tipo === "email") {
        emailSchema.parse(value);
      } else if (tipo === "telefone") {
        phoneSchema.parse(value);
      }
      return null;
    } catch (err) {
      if (err instanceof z.ZodError) {
        return err.errors[0]?.message || "Valor inválido";
      }
      return "Valor inválido";
    }
  };

  const validateCurrentStep = (): boolean => {
    if (!currentEtapa) return true;

    const errors: Record<string, string> = {};

    if (currentEtapa.tipo === "multiplos_campos") {
      const campos = currentEtapa.configuracao?.campos || [];
      campos.forEach(campo => {
        const value = formData[campo.id] as string || "";
        const error = validateField(campo.tipo, value, campo.obrigatorio);
        if (error) errors[campo.id] = error;
      });
    } else if (currentEtapa.tipo === "opcoes") {
      const value = formData[currentEtapa.id];
      if (currentEtapa.obrigatorio && (!value || (Array.isArray(value) && value.length === 0))) {
        errors[currentEtapa.id] = "Selecione uma opção";
      }
    } else {
      const value = formData[currentEtapa.id] as string || "";
      const error = validateField(currentEtapa.tipo, value, currentEtapa.obrigatorio);
      if (error) errors[currentEtapa.id] = error;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = async () => {
    if (!validateCurrentStep()) return;

    // Calculate time spent on this step
    const timeSpent = Math.round((new Date().getTime() - stepStartTime.current.getTime()) / 1000);
    
    if (currentStep < totalSteps) {
      // Update session progress
      if (sessionId && !isPreview) {
        const updatedTempo = { ...tempoPorEtapaState };
        updatedTempo[currentStep.toString()] = timeSpent;
        
        await supabase
          .from("formularios_sessoes")
          .update({ 
            etapa_atual: currentStep + 1,
            dados_parciais: formData,
            tempo_por_etapa: updatedTempo,
            last_activity_at: new Date().toISOString(),
          })
          .eq("id", sessionId);
        
        setTempoPorEtapaState(updatedTempo);
      }

      setCurrentStep(currentStep + 1);
      stepStartTime.current = new Date();
    } else {
      // Submit form
      handleSubmit();
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      stepStartTime.current = new Date();
    }
  };

  const handleSubmit = async () => {
    if (!config || isPreview) {
      if (isPreview) {
        setSubmitted(true);
      }
      return;
    }

    setSubmitting(true);

    try {
      const tempoTotal = Math.round((new Date().getTime() - startTime.getTime()) / 1000);

      // Extract nome, email, telefone from formData
      let nome = formData["nome"] as string || null;
      let email = formData["email"] as string || null;
      let telefone = formData["telefone"] as string || null;

      // Check in etapas for these fields
      etapas.forEach(etapa => {
        if (etapa.tipo === "texto" && etapa.titulo.toLowerCase().includes("nome") && !nome) {
          nome = formData[etapa.id] as string;
        }
        if (etapa.tipo === "email" && !email) {
          email = formData[etapa.id] as string;
        }
        if (etapa.tipo === "telefone" && !telefone) {
          const raw = formData[etapa.id] as string;
          telefone = raw ? `${countryCode}${raw.replace(/\D/g, "")}` : null;
        }
      });

      // Create lead
      const { error: leadError } = await supabase
        .from("formularios_leads")
        .insert({
          template_id: config.id,
          user_id: config.user_id,
          sessao_id: sessionId,
          nome,
          email,
          telefone,
          dados: formData,
          tempo_total_segundos: tempoTotal,
          status: "novo",
        });

      if (leadError) throw leadError;

      // Mark session as completed
      if (sessionId) {
        await supabase
          .from("formularios_sessoes")
          .update({ 
            completed_at: new Date().toISOString(),
            dados_parciais: formData,
          })
          .eq("id", sessionId);
      }

      setSubmitted(true);

      // TODO: Trigger pixels here based on config

    } catch (err) {
      console.error("Erro ao enviar formulário:", err);
      setError("Erro ao enviar dados. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (fieldId: string, value: string | string[], tipo?: string) => {
    if (tipo === "telefone") {
      const stripped = stripCountryCode(String(value), countryCode);
      const formatted = formatPhoneByCountry(stripped, countryCode);
      setFormData(prev => ({ ...prev, [fieldId]: formatted }));
    } else {
      setFormData(prev => ({ ...prev, [fieldId]: value }));
    }
    
    if (fieldErrors[fieldId]) {
      setFieldErrors(prev => ({ ...prev, [fieldId]: "" }));
    }
  };

  const renderField = (etapa: EtapaConfig) => {
    const { tipo, id, titulo, descricao, configuracao, obrigatorio } = etapa;
    const value = formData[id];

    switch (tipo) {
      case "texto":
        return (
          <div className="space-y-2">
            <Input
              id={id}
              placeholder={`Digite ${titulo.toLowerCase()}`}
              value={(value as string) || ""}
              onChange={(e) => handleChange(id, e.target.value)}
              className={fieldErrors[id] ? "border-destructive" : ""}
            />
            {fieldErrors[id] && <p className="text-xs text-destructive">{fieldErrors[id]}</p>}
          </div>
        );

      case "email":
        return (
          <div className="space-y-2">
            <Input
              id={id}
              type="email"
              placeholder="seu@email.com"
              value={(value as string) || ""}
              onChange={(e) => handleChange(id, e.target.value)}
              className={fieldErrors[id] ? "border-destructive" : ""}
            />
            {fieldErrors[id] && <p className="text-xs text-destructive">{fieldErrors[id]}</p>}
          </div>
        );

      case "telefone":
        return (
          <div className="space-y-2">
            <CountryCodeSelect
              value={countryCode}
              onChange={setCountryCode}
              phoneValue={(value as string) || ""}
              onPhoneChange={(v) => handleChange(id, v, "telefone")}
              placeholder={getPhonePlaceholder(countryCode)}
            />
            {fieldErrors[id] && <p className="text-xs text-destructive">{fieldErrors[id]}</p>}
          </div>
        );

      case "textarea":
        return (
          <div className="space-y-2">
            <Textarea
              id={id}
              placeholder={`Digite ${titulo.toLowerCase()}`}
              value={(value as string) || ""}
              onChange={(e) => handleChange(id, e.target.value)}
              rows={4}
              className={fieldErrors[id] ? "border-destructive" : ""}
            />
            {fieldErrors[id] && <p className="text-xs text-destructive">{fieldErrors[id]}</p>}
          </div>
        );

      case "numero":
        return (
          <div className="space-y-2">
            <Input
              id={id}
              type="number"
              placeholder="0"
              value={(value as string) || ""}
              onChange={(e) => handleChange(id, e.target.value)}
              className={fieldErrors[id] ? "border-destructive" : ""}
            />
            {fieldErrors[id] && <p className="text-xs text-destructive">{fieldErrors[id]}</p>}
          </div>
        );

      case "opcoes":
        const opcoes = configuracao?.opcoes || [];
        return (
          <div className="space-y-3">
            <RadioGroup
              value={(value as string) || ""}
              onValueChange={(v) => handleChange(id, v)}
            >
              {opcoes.map((opcao, idx) => (
                <div key={idx} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value={opcao} id={`${id}-${idx}`} />
                  <Label htmlFor={`${id}-${idx}`} className="flex-1 cursor-pointer">
                    {opcao}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {fieldErrors[id] && <p className="text-xs text-destructive">{fieldErrors[id]}</p>}
          </div>
        );

      case "multiplos_campos":
        const campos = configuracao?.campos || [];
        return (
          <div className="space-y-4">
            {campos.map((campo) => (
              <div key={campo.id} className="space-y-2">
                <Label htmlFor={campo.id}>
                  {campo.label}
                  {campo.obrigatorio && <span className="text-destructive ml-1">*</span>}
                </Label>
                {campo.tipo === "telefone" ? (
                  <CountryCodeSelect
                    value={countryCode}
                    onChange={setCountryCode}
                    phoneValue={(formData[campo.id] as string) || ""}
                    onPhoneChange={(v) => handleChange(campo.id, v, "telefone")}
                    placeholder={getPhonePlaceholder(countryCode)}
                  />
                ) : (
                  <Input
                    id={campo.id}
                    type={campo.tipo === "email" ? "email" : campo.tipo === "numero" ? "number" : "text"}
                    value={(formData[campo.id] as string) || ""}
                    onChange={(e) => handleChange(campo.id, e.target.value)}
                    className={fieldErrors[campo.id] ? "border-destructive" : ""}
                  />
                )}
                {fieldErrors[campo.id] && <p className="text-xs text-destructive">{fieldErrors[campo.id]}</p>}
              </div>
            ))}
          </div>
        );

      default:
        return (
          <Input
            id={id}
            value={(value as string) || ""}
            onChange={(e) => handleChange(id, e.target.value)}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-lg font-medium">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted && config) {
    const primaryColor = config.cor_primaria || "#8B5CF6";
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: primaryColor + "20" }}
            >
              <CheckCircle2 className="h-8 w-8" style={{ color: primaryColor }} />
            </div>
            <h2 className="text-xl font-bold text-center">
              {config.pagina_obrigado_titulo || "Obrigado!"}
            </h2>
            <p className="text-muted-foreground text-center">
              {config.pagina_obrigado_mensagem || "Recebemos suas informações."}
            </p>

            {config.pagina_obrigado_cta_texto && config.pagina_obrigado_cta_link && (
              <Button
                className="mt-4"
                style={{ backgroundColor: primaryColor }}
                onClick={() => {
                  let url = config.pagina_obrigado_cta_link!;
                  if (!url.startsWith("http://") && !url.startsWith("https://")) {
                    url = "https://" + url;
                  }
                  window.open(url, "_blank");
                }}
              >
                {config.pagina_obrigado_cta_texto}
              </Button>
            )}
            
            {isPreview && (
              <p className="text-xs text-muted-foreground mt-4 px-4 py-2 bg-yellow-500/10 rounded-lg">
                Modo Preview - Nenhum dado foi salvo
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!config || !currentEtapa) return null;

  const primaryColor = config.cor_primaria || "#8B5CF6";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          {isPreview && (
            <div className="text-xs text-muted-foreground px-3 py-1.5 bg-yellow-500/10 rounded-lg text-center">
              Modo Preview
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Etapa {currentStep} de {totalSteps}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" style={{ "--progress-color": primaryColor } as React.CSSProperties} />
          </div>
          <div className="text-center pt-2">
            <CardTitle className="text-xl">{currentEtapa.titulo}</CardTitle>
            {currentEtapa.descricao && (
              <CardDescription className="mt-2">{currentEtapa.descricao}</CardDescription>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {renderField(currentEtapa)}

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <div className="flex gap-3">
            {currentStep > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={handlePrev}
                className="flex-1"
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
            )}
            <Button
              type="button"
              onClick={handleNext}
              disabled={submitting}
              className="flex-1"
              style={{ backgroundColor: primaryColor }}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {currentStep === totalSteps ? "Enviar" : "Próximo"}
              {currentStep < totalSteps && <ChevronRight className="h-4 w-4 ml-2" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
