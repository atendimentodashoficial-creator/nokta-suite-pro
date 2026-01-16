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

interface MediaItem {
  url: string;
  titulo: string;
  subtitulo: string;
}

interface TemplateConfig {
  id: string;
  user_id: string;
  nome: string;
  status: string;
  layout_tipo: string;
  cor_primaria: string;
  background_color: string | null;
  card_color: string | null;
  font_family: string | null;
  text_color: string | null;
  button_text_color: string | null;
  border_radius: string | null;
  progress_background_color: string | null;
  card_border_color: string | null;
  back_button_color: string | null;
  back_button_text_color: string | null;
  answer_text_color: string | null;
  error_text_color: string | null;
  logo_url: string | null;
  pagina_obrigado_titulo: string | null;
  pagina_obrigado_mensagem: string | null;
  pagina_obrigado_cta_texto: string | null;
  pagina_obrigado_cta_link: string | null;
  pagina_obrigado_video_url: string | null;
  pagina_obrigado_video_titulo: string | null;
  pagina_obrigado_video_subtitulo: string | null;
  pagina_obrigado_video_posicao: string | null;
  pagina_obrigado_imagem_url: string | null;
  pagina_obrigado_imagens: unknown;
  pagina_obrigado_videos: unknown;
  imagens_layout: string | null;
  fonte_tamanho_titulo?: string | null;
  fonte_tamanho_subtitulo?: string | null;
  fonte_tamanho_perguntas?: string | null;
  fonte_tamanho_campos?: string | null;
  fonte_tamanho_respostas?: string | null;
  fonte_tamanho_botoes?: string | null;
  formularios_etapas: EtapaConfig[];
}

// Helper to extract YouTube/Vimeo embed URL
const getVideoEmbedUrl = (url: string): string | null => {
  if (!url) return null;
  
  // YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }
  
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }
  
  return null;
};

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
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date>(new Date());
  const stepStartTime = useRef<Date>(new Date());
  const abandonWarmupDone = useRef(false);

  // Etapas ativas ordenadas; a navegação usa o índice (1..N), não o campo `ordem`
  // Isso evita "tela branca" caso existam ordens duplicadas/gaps.
  const etapas = (config?.formularios_etapas || [])
    .filter((e) => e.ativo)
    .sort((a, b) => a.ordem - b.ordem);
  const totalSteps = etapas.length;
  const currentEtapa = etapas[currentStep - 1];
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
        const newSessionId = crypto.randomUUID();
        const newSessionToken = crypto.randomUUID();

        setSessionToken(newSessionToken);
        const urlParams = new URLSearchParams(window.location.search);

        // Importante: não usamos `.select()` aqui.
        // Em navegadores anônimos/sem login, o INSERT pode ser permitido por RLS,
        // mas o RETURNING/SELECT pode ser bloqueado — e aí não recebemos o id.
        // Gerando o UUID no client, conseguimos rastrear a sessão sem depender de SELECT.
        const { error: sessionError } = await supabase
          .from("formularios_sessoes")
          .insert({
            id: newSessionId,
            // IMPORTANT: template_id must be the real UUID (data.id). The URL may be using slug.
            template_id: data.id,
            user_id: data.user_id,
            session_token: newSessionToken,
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
          });

        if (sessionError) {
          console.error("Erro ao criar sessão do formulário:", sessionError);
        } else {
          setSessionId(newSessionId);
        }
      }
    }

    loadForm();
  }, [templateId, isPreview]);

  // Handle session abandonment (unload/hidden)
  // Nota: browsers “novos” (guia anônima / celular) podem falhar no abandono se a 1ª chamada
  // para a função acontecer apenas no unload (por causa do preflight/CORS). Fazemos um “warmup”
  // assim que a sessão é criada para garantir que o abandono funcione em seguida.
  useEffect(() => {
    if (!sessionId || !sessionToken || isPreview) return;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const url = `${supabaseUrl}/functions/v1/formulario-abandono`;

    // Warmup: dispara uma chamada leve enquanto a página ainda está ativa
    // (evita depender da 1ª requisição acontecer durante o fechamento/"pagehide").
    if (!abandonWarmupDone.current) {
      abandonWarmupDone.current = true;
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ action: "ping" }),
      }).catch(() => {});
    }

    const markAsAbandoned = () => {
      if (submitted) return;

      const body = JSON.stringify({
        session_id: sessionId,
        session_token: sessionToken,
        etapa_atual: currentStep,
        dados_parciais: formData,
      });

      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body,
        keepalive: true,
      }).catch(() => {});
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && !submitted) {
        markAsAbandoned();
      }
    };

    const handleBeforeUnload = () => {
      markAsAbandoned();
    };

    // visibilitychange é mais confiável no mobile
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
    };
  }, [sessionId, sessionToken, currentStep, formData, submitted, isPreview]);


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

  const handleSubmitSinglePage = async () => {
    if (!config) return;

    // Validate all fields
    const newErrors: Record<string, string> = {};
    for (const etapa of etapas) {
      const value = formData[etapa.id];
      if (etapa.obrigatorio) {
        if (etapa.tipo === "multipla_escolha") {
          if (!value || (Array.isArray(value) && value.length === 0)) {
            newErrors[etapa.id] = "Selecione pelo menos uma opção";
          }
        } else if (etapa.tipo === "multiplos_campos") {
          // Validate each field in multiplos_campos
          const campos = etapa.configuracao?.campos || [];
          campos.forEach(campo => {
            if (campo.obrigatorio) {
              const campoValue = formData[campo.id] as string;
              if (!campoValue || !campoValue.trim()) {
                newErrors[campo.id] = "Campo obrigatório";
              }
            }
          });
        } else if (!value || (typeof value === "string" && !value.trim())) {
          newErrors[etapa.id] = "Campo obrigatório";
        }
      }
      // Email validation
      if (etapa.tipo === "email" && value) {
        try {
          z.string().email().parse(value);
        } catch {
          newErrors[etapa.id] = "E-mail inválido";
        }
      }
      // Validate email fields inside multiplos_campos
      if (etapa.tipo === "multiplos_campos") {
        const campos = etapa.configuracao?.campos || [];
        campos.forEach(campo => {
          if (campo.tipo === "email") {
            const campoValue = formData[campo.id] as string;
            if (campoValue && campoValue.trim()) {
              try {
                z.string().email().parse(campoValue);
              } catch {
                newErrors[campo.id] = "E-mail inválido";
              }
            }
          }
        });
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      setError("Preencha todos os campos obrigatórios");
      return;
    }

    // Submit
    setSubmitting(true);
    setError(null);

    try {
      const tempoTotal = Math.floor((Date.now() - (startTime ? new Date(startTime).getTime() : Date.now())) / 1000);

      let nome: string | null = null;
      let email: string | null = null;
      let telefone: string | null = null;

      etapas.forEach((etapa) => {
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

  const renderField = (etapa: EtapaConfig, customStyles?: { cardColor?: string; textColor?: string; borderColor?: string; answerColor?: string; errorColor?: string; fieldsSize?: string; answersSize?: string }) => {
    const { tipo, id, titulo, descricao, configuracao, obrigatorio } = etapa;
    const value = formData[id];
    const errorStyle = customStyles?.errorColor ? { color: customStyles.errorColor } : {};

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
            {fieldErrors[id] && <p className="text-xs" style={errorStyle}>{fieldErrors[id]}</p>}
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
            {fieldErrors[id] && <p className="text-xs" style={errorStyle}>{fieldErrors[id]}</p>}
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
            {fieldErrors[id] && <p className="text-xs" style={errorStyle}>{fieldErrors[id]}</p>}
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
            {fieldErrors[id] && <p className="text-xs" style={errorStyle}>{fieldErrors[id]}</p>}
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
            {fieldErrors[id] && <p className="text-xs" style={errorStyle}>{fieldErrors[id]}</p>}
          </div>
        );

      case "opcoes":
        const opcoes = configuracao?.opcoes || [];
        const selectedValue = (value as string) || "";
        return (
          <div className="space-y-3">
            {opcoes.map((opcao, idx) => {
              const isSelected = selectedValue === opcao;
              return (
                <div 
                  key={idx} 
                  className="flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-opacity hover:opacity-80 bg-white"
                  style={{ 
                    border: `1px solid ${customStyles?.borderColor || "rgba(255,255,255,0.2)"}`,
                  }}
                  onClick={() => handleChange(id, opcao)}
                >
                  <Checkbox 
                    id={`${id}-${idx}`} 
                    checked={isSelected}
                    onCheckedChange={() => handleChange(id, opcao)}
                  />
                  <Label htmlFor={`${id}-${idx}`} className="flex-1 cursor-pointer" style={{ color: customStyles?.answerColor || "#1f2937", fontSize: customStyles?.fieldsSize || "14px" }}>
                    {opcao}
                  </Label>
                </div>
              );
            })}
            {fieldErrors[id] && <p className="text-xs" style={errorStyle}>{fieldErrors[id]}</p>}
          </div>
        );

      case "multipla_escolha":
        const opcoesMultipla = configuracao?.opcoes || [];
        const selectedValues = (value as string[]) || [];
        return (
          <div className="space-y-3">
            {opcoesMultipla.map((opcao, idx) => {
              const isChecked = selectedValues.includes(opcao);
              return (
                <div 
                  key={idx} 
                  className="flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-opacity hover:opacity-80 bg-white"
                  style={{ 
                    border: `1px solid ${customStyles?.borderColor || "rgba(255,255,255,0.2)"}`,
                  }}
                  onClick={() => {
                    const newValues = isChecked 
                      ? selectedValues.filter(v => v !== opcao)
                      : [...selectedValues, opcao];
                    handleChange(id, newValues);
                  }}
                >
                  <Checkbox 
                    id={`${id}-${idx}`} 
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                      const newValues = checked 
                        ? [...selectedValues, opcao]
                        : selectedValues.filter(v => v !== opcao);
                      handleChange(id, newValues);
                    }}
                  />
                  <Label htmlFor={`${id}-${idx}`} className="flex-1 cursor-pointer" style={{ color: customStyles?.answerColor || "#1f2937", fontSize: customStyles?.fieldsSize || "14px" }}>
                    {opcao}
                  </Label>
                </div>
              );
            })}
            {fieldErrors[id] && <p className="text-xs" style={errorStyle}>{fieldErrors[id]}</p>}
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
                {fieldErrors[campo.id] && <p className="text-xs" style={errorStyle}>{fieldErrors[campo.id]}</p>}
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
    const bgColor = config.background_color || "#ffffff";
    const cardColor = config.card_color || "#ffffff";
    const fontFamily = config.font_family || "Inter";
    const textColor = config.text_color || "#1f2937";
    const buttonTextColor = config.button_text_color || "#ffffff";
    const borderRadiusValue = config.border_radius || "12";
    const cardBorderColor = config.card_border_color || "transparent";
    
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4"
        style={{ 
          backgroundColor: bgColor,
          fontFamily: `${fontFamily}, sans-serif`,
        }}
      >
        <Card 
          className="w-full max-w-md"
          style={{ 
            backgroundColor: cardColor,
            borderRadius: `${borderRadiusValue}px`,
            color: textColor,
            border: cardBorderColor && cardBorderColor !== "transparent" ? `1px solid ${cardBorderColor}` : undefined,
          }}
        >
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            {/* Video section component */}
            {(() => {
              // Get arrays from config
              const imagens: MediaItem[] = Array.isArray(config.pagina_obrigado_imagens) ? config.pagina_obrigado_imagens : [];
              const videosArr: MediaItem[] = Array.isArray(config.pagina_obrigado_videos) ? config.pagina_obrigado_videos : [];
              const imagensLayout = config.imagens_layout || "horizontal";
              
              const mediaSection = (
                <div className="w-full space-y-4">
                  {/* Multiple Images - displayed based on layout setting */}
                  {imagens.filter(img => img.url).length > 0 && (
                    imagensLayout === "horizontal" ? (
                      <div className="flex flex-col items-center space-y-3">
                        {/* Single title/subtitle for all images */}
                        {imagens[0]?.titulo && (
                          <h3 className="text-sm md:text-base font-semibold text-center" style={{ color: textColor }}>
                            {imagens[0].titulo}
                          </h3>
                        )}
                        {imagens[0]?.subtitulo && (
                          <p className="text-xs text-center" style={{ color: textColor, opacity: 0.7 }}>
                            {imagens[0].subtitulo}
                          </p>
                        )}
                        <div className="flex flex-wrap justify-center gap-4">
                          {imagens.filter(img => img.url).map((img, idx) => (
                            <img 
                              key={`img-${idx}`}
                              src={img.url} 
                              alt={img.titulo || `Imagem ${idx + 1}`} 
                              className="h-24 md:h-32 w-auto max-w-[120px] md:max-w-[150px] object-contain rounded-lg" 
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {imagens.filter(img => img.url).map((img, idx) => (
                          <div key={`img-${idx}`} className="flex flex-col items-center space-y-2 w-full">
                            {img.titulo && (
                              <h3 className="text-sm md:text-base font-semibold text-center" style={{ color: textColor }}>
                                {img.titulo}
                              </h3>
                            )}
                            {img.subtitulo && (
                              <p className="text-xs text-center" style={{ color: textColor, opacity: 0.7 }}>
                                {img.subtitulo}
                              </p>
                            )}
                            <img 
                              src={img.url} 
                              alt={img.titulo || `Imagem ${idx + 1}`} 
                              className="max-w-full h-auto max-h-48 object-contain rounded-lg mx-auto" 
                            />
                          </div>
                        ))}
                      </div>
                    )
                  )}
                  
                  {/* Multiple Videos */}
                  {videosArr.filter(vid => vid.url && getVideoEmbedUrl(vid.url)).map((vid, idx) => (
                    <div key={`vid-${idx}`} className="space-y-2">
                      {vid.titulo && (
                        <h3 className="text-xl md:text-2xl font-semibold text-center" style={{ color: textColor }}>
                          {vid.titulo}
                        </h3>
                      )}
                      {vid.subtitulo && (
                        <p className="text-sm text-center" style={{ color: textColor, opacity: 0.7 }}>
                          {vid.subtitulo}
                        </p>
                      )}
                      <div className="w-full aspect-video rounded-lg overflow-hidden">
                        <iframe
                          src={getVideoEmbedUrl(vid.url)!}
                          className="w-full h-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          title={vid.titulo || `Video ${idx + 1}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
              
              const hasMedia = imagens.filter(i => i.url).length > 0 || videosArr.filter(v => v.url).length > 0;
              const videoPosicao = config.pagina_obrigado_video_posicao || "abaixo";
              const mediaAcima = videoPosicao === "acima";

              return (
                <>
                  {/* Media acima do obrigado */}
                  {mediaAcima && hasMedia && mediaSection}
                  
                  {/* Título com check ao lado */}
                  <div className="flex items-center justify-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: primaryColor + "20" }}
                    >
                      <CheckCircle2 className="h-5 w-5" style={{ color: primaryColor }} />
                    </div>
                    <h2 className="text-2xl md:text-3xl font-bold" style={{ color: textColor }}>
                      {config.pagina_obrigado_titulo || "Obrigado!"}
                    </h2>
                  </div>
                  
                  <p className="text-center" style={{ color: textColor, opacity: 0.7 }}>
                    {config.pagina_obrigado_mensagem || "Recebemos suas informações."}
                  </p>

                  {/* Media abaixo do obrigado */}
                  {!mediaAcima && hasMedia && mediaSection}

                  {config.pagina_obrigado_cta_texto && config.pagina_obrigado_cta_link && (
                    <Button
                      className="mt-4"
                      style={{ 
                        backgroundColor: primaryColor, 
                        color: buttonTextColor,
                        borderRadius: `${parseInt(borderRadiusValue) / 2}px`,
                        fontSize: config.fonte_tamanho_botoes || "16px",
                      }}
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
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!config) return null;

  // Evita "tela branca" quando o template está sem etapas ativas ou o índice saiu do range.
  if (totalSteps === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-2">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="text-lg font-medium">Formulário sem etapas</p>
            <p className="text-sm text-muted-foreground">
              Ative pelo menos 1 etapa para publicar este formulário.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentEtapa) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="text-lg font-medium">Etapa não encontrada</p>
            <p className="text-sm text-muted-foreground">
              Parece haver um problema na ordem das etapas. Vamos voltar para a primeira etapa.
            </p>
            <Button variant="outline" onClick={() => setCurrentStep(1)}>
              Voltar ao início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const primaryColor = config.cor_primaria || "#8B5CF6";
  const bgColor = config.background_color || "#ffffff";
  const cardColor = config.card_color || "#ffffff";
  const fontFamily = config.font_family || "Inter";
  const textColor = config.text_color || "#1f2937";
  const buttonTextColor = config.button_text_color || "#ffffff";
  const borderRadiusValue = config.border_radius || "12";
  const progressBgColor = config.progress_background_color || "#e5e5e5";
  const cardBorderColor = config.card_border_color || "transparent";
  const backButtonColor = config.back_button_color || "#6b7280";
  const backButtonTextColor = config.back_button_text_color || "#ffffff";
  const answerTextColor = config.answer_text_color || "#1f2937";
  const errorTextColor = config.error_text_color || "#ef4444";
  const baseQuestionSize = parseInt(config.fonte_tamanho_perguntas || "16") || 16;
  const fieldsSize = config.fonte_tamanho_campos || "14px";
  const answersSize = config.fonte_tamanho_respostas || "14px";
  const buttonsSize = config.fonte_tamanho_botoes || "16px";

  const isSinglePage = config.layout_tipo === "single_page";
  // Multi-step uses +2px for question titles
  const questionTitleSize = isSinglePage ? `${baseQuestionSize}px` : `${baseQuestionSize + 2}px`;

  // Single page layout
  if (isSinglePage) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4"
        style={{ 
          backgroundColor: bgColor,
          fontFamily: `${fontFamily}, sans-serif`,
        }}
      >
        <Card 
          className="w-full max-w-md [&_input]:text-[var(--answer-color)] [&_textarea]:text-[var(--answer-color)] [&_select]:text-[var(--answer-color)]"
          style={{ 
            backgroundColor: cardColor,
            borderRadius: `${borderRadiusValue}px`,
            color: textColor,
            border: cardBorderColor && cardBorderColor !== "transparent" ? `1px solid ${cardBorderColor}` : undefined,
            "--answer-color": answerTextColor,
          } as React.CSSProperties}
        >
          <CardHeader className="space-y-4">
            {config.logo_url && (
              <div className="flex justify-center pt-2">
                <img 
                  src={config.logo_url} 
                  alt="Logo" 
                  className="h-16 w-auto max-w-48 object-contain"
                />
              </div>
            )}
            {isPreview && (
              <div className="text-xs text-muted-foreground px-3 py-1.5 bg-yellow-500/10 rounded-lg text-center">
                Modo Preview
              </div>
            )}
            {config.nome && (
              <div className="text-center pt-2">
                <CardTitle className="text-xl" style={{ color: textColor }}>{config.nome}</CardTitle>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-8">
            {etapas.map((etapa) => (
              <div key={etapa.id} className="space-y-3">
                <div>
                  <Label className="font-medium" style={{ color: textColor, fontSize: questionTitleSize }}>
                    {etapa.titulo}
                    {etapa.obrigatorio && <span style={{ color: errorTextColor }} className="ml-1">*</span>}
                  </Label>
                  {etapa.descricao && (
                    <p className="text-sm mt-1" style={{ color: textColor, opacity: 0.7 }}>{etapa.descricao}</p>
                  )}
                </div>
                {renderField(etapa, { 
                  cardColor: cardColor, 
                  textColor: textColor,
                  borderColor: cardBorderColor !== "transparent" ? cardBorderColor : "rgba(255,255,255,0.2)",
                  answerColor: answerTextColor,
                  errorColor: errorTextColor,
                  fieldsSize: fieldsSize,
                  answersSize: answersSize,
                })}
              </div>
            ))}

            {error && <p className="text-sm text-center" style={{ color: errorTextColor }}>{error}</p>}

            <Button
              type="button"
              onClick={handleSubmitSinglePage}
              disabled={submitting}
              className="w-full"
              style={{ 
                backgroundColor: primaryColor, 
                color: buttonTextColor,
                borderRadius: `${parseInt(borderRadiusValue) / 2}px`,
                fontSize: buttonsSize,
              }}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Enviar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Multi-step layout (default)
  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{ 
        backgroundColor: bgColor,
        fontFamily: `${fontFamily}, sans-serif`,
      }}
    >
        <Card 
          className="w-full max-w-md [&_input]:text-[var(--answer-color)] [&_textarea]:text-[var(--answer-color)] [&_select]:text-[var(--answer-color)]"
          style={{ 
            backgroundColor: cardColor,
            borderRadius: `${borderRadiusValue}px`,
            color: textColor,
            border: cardBorderColor && cardBorderColor !== "transparent" ? `1px solid ${cardBorderColor}` : undefined,
            "--answer-color": answerTextColor,
          } as React.CSSProperties}
        >
        <CardHeader className="space-y-4">
          {config.logo_url && (
            <div className="flex justify-center pt-2">
              <img 
                src={config.logo_url} 
                alt="Logo" 
                className="h-16 w-auto max-w-48 object-contain"
              />
            </div>
          )}
          {isPreview && (
            <div className="text-xs text-muted-foreground px-3 py-1.5 bg-yellow-500/10 rounded-lg text-center">
              Modo Preview
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm" style={{ color: textColor, opacity: 0.7 }}>
              <span>Etapa {currentStep} de {totalSteps}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress 
              value={progress} 
              className="h-2" 
              style={{ 
                "--progress-color": primaryColor,
                "--progress-background": progressBgColor,
              } as React.CSSProperties} 
            />
          </div>
          <div className="text-left pt-2">
            <CardTitle style={{ color: textColor, fontSize: questionTitleSize }}>{currentEtapa.titulo}</CardTitle>
            {currentEtapa.descricao && (
              <CardDescription className="mt-2" style={{ color: textColor, opacity: 0.7 }}>{currentEtapa.descricao}</CardDescription>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {renderField(currentEtapa, { 
            cardColor: cardColor, 
            textColor: textColor,
            borderColor: cardBorderColor !== "transparent" ? cardBorderColor : "rgba(255,255,255,0.2)",
            answerColor: answerTextColor,
            errorColor: errorTextColor,
          })}

          {error && <p className="text-sm text-center" style={{ color: errorTextColor }}>{error}</p>}

          <div className="flex gap-3">
            {currentStep > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={handlePrev}
                className="flex-1"
                style={{ 
                  backgroundColor: backButtonColor, 
                  color: backButtonTextColor,
                  borderColor: backButtonColor,
                  borderRadius: `${parseInt(borderRadiusValue) / 2}px`,
                  fontSize: buttonsSize,
                }}
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
              style={{ 
                backgroundColor: primaryColor, 
                color: buttonTextColor,
                borderRadius: `${parseInt(borderRadiusValue) / 2}px`,
                fontSize: buttonsSize,
              }}
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
