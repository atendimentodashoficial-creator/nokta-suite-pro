import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { z } from "zod";

interface CampoPersonalizado {
  id: string;
  label: string;
  tipo: "text" | "tel" | "email" | "textarea";
  obrigatorio: boolean;
}

interface FormConfig {
  id: string;
  user_id: string;
  nome: string;
  titulo_pagina: string;
  subtitulo_pagina: string | null;
  texto_botao: string;
  mensagem_sucesso: string;
  campos: (string | CampoPersonalizado)[];
  cor_primaria: string;
  imagem_url: string | null;
}

const phoneSchema = z.string().regex(/^[\d\s\-\+\(\)]+$/, "Telefone inválido").min(8, "Telefone muito curto");
const emailSchema = z.string().email("Email inválido");
const nameSchema = z.string().min(2, "Nome muito curto").max(100, "Nome muito longo");

export default function FormularioCaptura() {
  const { formId } = useParams<{ formId: string }>();
  const [searchParams] = useSearchParams();
  const trackingId = searchParams.get("t");
  const instagramUserId = searchParams.get("ig");

  const [config, setConfig] = useState<FormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadForm() {
      if (!formId) {
        setError("Formulário não encontrado");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("instagram_formularios")
        .select("*")
        .eq("id", formId)
        .maybeSingle();

      if (error || !data) {
        setError("Formulário não encontrado");
        setLoading(false);
        return;
      }

      if (data.ativo === false) {
        setError("Formulário inativo");
        setLoading(false);
        return;
      }

      // Parse campos from JSONB - can be strings or objects
      const rawCampos = Array.isArray(data.campos) ? data.campos : JSON.parse(data.campos as string);
      const campos: (string | CampoPersonalizado)[] = rawCampos.map((c: string | object) => {
        if (typeof c === "string") {
          // Try to parse as JSON (for custom fields stored as JSON strings)
          try {
            const parsed = JSON.parse(c);
            if (parsed.id && parsed.label) {
              return parsed as CampoPersonalizado;
            }
          } catch {
            // Not JSON, it's a standard field id
          }
          return c;
        }
        return c as CampoPersonalizado;
      });
      
      setConfig({
        ...data,
        campos,
      });
      setLoading(false);
    }

    loadForm();
  }, [formId]);

  const getCampoId = (campo: string | CampoPersonalizado): string => {
    return typeof campo === "string" ? campo : campo.id;
  };

  const getCampoLabel = (campo: string | CampoPersonalizado): string => {
    if (typeof campo === "string") {
      const labels: Record<string, string> = {
        nome: "Nome",
        telefone: "Telefone",
        email: "Email",
      };
      return labels[campo] || campo;
    }
    return campo.label;
  };

  const getCampoTipo = (campo: string | CampoPersonalizado): string => {
    if (typeof campo === "string") {
      const tipos: Record<string, string> = {
        nome: "text",
        telefone: "tel",
        email: "email",
      };
      return tipos[campo] || "text";
    }
    return campo.tipo;
  };

  const getCampoPlaceholder = (campo: string | CampoPersonalizado): string => {
    if (typeof campo === "string") {
      const placeholders: Record<string, string> = {
        nome: "Seu nome completo",
        telefone: "(00) 00000-0000",
        email: "seu@email.com",
      };
      return placeholders[campo] || "";
    }
    return "";
  };

  const validateField = (campo: string | CampoPersonalizado, value: string): string | null => {
    const id = getCampoId(campo);
    
    try {
      if (id === "nome") {
        nameSchema.parse(value);
      } else if (id === "telefone") {
        phoneSchema.parse(value);
      } else if (id === "email") {
        emailSchema.parse(value);
      } else if (typeof campo !== "string" && campo.obrigatorio && !value.trim()) {
        return "Campo obrigatório";
      }
      return null;
    } catch (err) {
      if (err instanceof z.ZodError) {
        return err.errors[0]?.message || "Valor inválido";
      }
      return "Valor inválido";
    }
  };

  const handleChange = (campoId: string, value: string) => {
    setFormData(prev => ({ ...prev, [campoId]: value }));
    
    if (fieldErrors[campoId]) {
      setFieldErrors(prev => ({ ...prev, [campoId]: "" }));
    }
  };

  const handleBlur = (campo: string | CampoPersonalizado) => {
    const id = getCampoId(campo);
    const value = formData[id];
    if (value) {
      const error = validateField(campo, value);
      if (error) {
        setFieldErrors(prev => ({ ...prev, [id]: error }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    // Validate all required fields
    const errors: Record<string, string> = {};
    
    for (const campo of config.campos) {
      const id = getCampoId(campo);
      const value = formData[id];
      
      if (!value?.trim()) {
        errors[id] = "Campo obrigatório";
      } else {
        const fieldError = validateField(campo, value);
        if (fieldError) {
          errors[id] = fieldError;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);

    try {
      // Separate standard fields from custom fields
      const dadosExtras: Record<string, string> = {};
      
      for (const campo of config.campos) {
        if (typeof campo !== "string") {
          const id = getCampoId(campo);
          dadosExtras[campo.label] = formData[id] || "";
        }
      }

      const { error } = await supabase
        .from("instagram_formularios_respostas")
        .insert({
          formulario_id: config.id,
          user_id: config.user_id,
          instagram_user_id: instagramUserId || null,
          tracking_id: trackingId || null,
          nome: formData.nome || null,
          telefone: formData.telefone || null,
          email: formData.email || null,
          dados_extras: Object.keys(dadosExtras).length > 0 ? dadosExtras : null,
        });

      if (error) throw error;

      setSubmitted(true);
    } catch (err) {
      console.error("Erro ao enviar formulário:", err);
      setError("Erro ao enviar dados. Tente novamente.");
    } finally {
      setSubmitting(false);
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 
              className="h-16 w-16 mb-4" 
              style={{ color: config.cor_primaria }} 
            />
            <p className="text-lg font-medium text-center">{config.mensagem_sucesso}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        {config.imagem_url && (
          <div className="w-full h-40 overflow-hidden rounded-t-lg">
            <img 
              src={config.imagem_url} 
              alt="" 
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{config.titulo_pagina}</CardTitle>
          {config.subtitulo_pagina && (
            <CardDescription>{config.subtitulo_pagina}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {config.campos.map((campo) => {
              const id = getCampoId(campo);
              const tipo = getCampoTipo(campo);
              
              return (
                <div key={id} className="space-y-2">
                  <Label htmlFor={id}>{getCampoLabel(campo)}</Label>
                  {tipo === "textarea" ? (
                    <Textarea
                      id={id}
                      placeholder={getCampoPlaceholder(campo)}
                      value={formData[id] || ""}
                      onChange={(e) => handleChange(id, e.target.value)}
                      onBlur={() => handleBlur(campo)}
                      className={fieldErrors[id] ? "border-destructive" : ""}
                      rows={3}
                    />
                  ) : (
                    <Input
                      id={id}
                      type={tipo}
                      placeholder={getCampoPlaceholder(campo)}
                      value={formData[id] || ""}
                      onChange={(e) => handleChange(id, e.target.value)}
                      onBlur={() => handleBlur(campo)}
                      className={fieldErrors[id] ? "border-destructive" : ""}
                    />
                  )}
                  {fieldErrors[id] && (
                    <p className="text-xs text-destructive">{fieldErrors[id]}</p>
                  )}
                </div>
              );
            })}

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={submitting}
              style={{ backgroundColor: config.cor_primaria }}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {config.texto_botao}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
