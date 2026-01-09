import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { z } from "zod";

interface FormConfig {
  id: string;
  user_id: string;
  nome: string;
  titulo_pagina: string;
  subtitulo_pagina: string | null;
  texto_botao: string;
  mensagem_sucesso: string;
  campos: string[];
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

  const [formData, setFormData] = useState({
    nome: "",
    telefone: "",
    email: "",
  });

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
        .eq("ativo", true)
        .single();

      if (error || !data) {
        setError("Formulário não encontrado ou inativo");
        setLoading(false);
        return;
      }

      // Parse campos from JSONB
      const campos = Array.isArray(data.campos) ? data.campos : JSON.parse(data.campos as string);
      
      setConfig({
        ...data,
        campos: campos as string[],
      });
      setLoading(false);
    }

    loadForm();
  }, [formId]);

  const validateField = (field: string, value: string): string | null => {
    try {
      if (field === "nome") {
        nameSchema.parse(value);
      } else if (field === "telefone") {
        phoneSchema.parse(value);
      } else if (field === "email") {
        emailSchema.parse(value);
      }
      return null;
    } catch (err) {
      if (err instanceof z.ZodError) {
        return err.errors[0]?.message || "Valor inválido";
      }
      return "Valor inválido";
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when typing
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const handleBlur = (field: string) => {
    const value = formData[field as keyof typeof formData];
    if (value) {
      const error = validateField(field, value);
      if (error) {
        setFieldErrors(prev => ({ ...prev, [field]: error }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    // Validate all required fields
    const errors: Record<string, string> = {};
    
    for (const campo of config.campos) {
      const value = formData[campo as keyof typeof formData];
      if (!value?.trim()) {
        errors[campo] = "Campo obrigatório";
      } else {
        const fieldError = validateField(campo, value);
        if (fieldError) {
          errors[campo] = fieldError;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);

    try {
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

  const fieldLabels: Record<string, string> = {
    nome: "Nome",
    telefone: "Telefone",
    email: "Email",
  };

  const fieldPlaceholders: Record<string, string> = {
    nome: "Seu nome completo",
    telefone: "(00) 00000-0000",
    email: "seu@email.com",
  };

  const fieldTypes: Record<string, string> = {
    nome: "text",
    telefone: "tel",
    email: "email",
  };

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
            {config.campos.map((campo) => (
              <div key={campo} className="space-y-2">
                <Label htmlFor={campo}>{fieldLabels[campo] || campo}</Label>
                <Input
                  id={campo}
                  type={fieldTypes[campo] || "text"}
                  placeholder={fieldPlaceholders[campo] || ""}
                  value={formData[campo as keyof typeof formData] || ""}
                  onChange={(e) => handleChange(campo, e.target.value)}
                  onBlur={() => handleBlur(campo)}
                  className={fieldErrors[campo] ? "border-destructive" : ""}
                />
                {fieldErrors[campo] && (
                  <p className="text-xs text-destructive">{fieldErrors[campo]}</p>
                )}
              </div>
            ))}

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
