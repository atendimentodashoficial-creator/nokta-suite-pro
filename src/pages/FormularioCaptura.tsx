import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { z } from "zod";
import { CountryCodeSelect } from "@/components/whatsapp/CountryCodeSelect";
import { formatPhoneByCountry, getPhonePlaceholder, stripCountryCode } from "@/utils/phoneFormat";

interface CampoPersonalizado {
  id: string;
  label: string;
  tipo: "text" | "tel" | "email" | "textarea" | "multipla_escolha" | "sim_nao" | string;
  obrigatorio: boolean;
  opcoes?: string[]; // Para múltipla escolha
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
  botao_sucesso_texto: string | null;
  botao_sucesso_url: string | null;
}

type FormValue = string | string[];

const phoneSchema = z
  .string()
  .regex(/^[\d\s\-\+\(\)]+$/, "Telefone inválido")
  .min(8, "Telefone muito curto");
const emailSchema = z.string().email("Email inválido");
const nameSchema = z.string().min(2, "Nome muito curto").max(100, "Nome muito longo");

const normalizeTipo = (tipo: string): string => {
  const t = (tipo || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s-]+/g, "_")
    .replace(/\//g, "_");

  // Compat: alguns cadastros antigos podem ter variações
  if (t.includes("multipla") || t.includes("opcoes") || t.includes("escolha")) return "multipla_escolha";
  if (t.includes("sim") && t.includes("nao")) return "sim_nao";
  return t;
};

const valueToString = (v: FormValue | undefined): string => {
  if (Array.isArray(v)) return v.join(", ");
  return v || "";
};

const isEmptyValue = (v: FormValue | undefined): boolean => {
  if (Array.isArray(v)) return v.length === 0;
  return !v?.trim();
};

export default function FormularioCaptura() {
  const { formId, formSlug } = useParams<{ formId?: string; formSlug?: string }>();
  const [searchParams] = useSearchParams();
  const trackingId = searchParams.get("t");
  const instagramUserId = searchParams.get("ig");

  const [config, setConfig] = useState<FormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<Record<string, FormValue>>({});
  const [countryCode, setCountryCode] = useState("55");

  useEffect(() => {
    const generateSlug = (nome: string) => {
      return nome
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .replace(/-+/g, "-") // Remove multiple hyphens
        .trim();
    };

    async function loadForm() {
      // If neither formId nor formSlug is provided
      if (!formId && !formSlug) {
        setError("Formulário não encontrado");
        setLoading(false);
        return;
      }

      if (formId) {
        // Search by ID
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

        processFormData(data);
      } else if (formSlug) {
        // Search by slug - fetch all forms and find the one matching the slug
        const { data: allForms, error } = await supabase
          .from("instagram_formularios")
          .select("*");

        if (error) {
          setError("Erro ao carregar formulário");
          setLoading(false);
          return;
        }

        // Find form where generated slug matches the URL slug
        const matchingForm = allForms?.find(form => generateSlug(form.nome) === formSlug);

        if (!matchingForm) {
          setError("Formulário não encontrado");
          setLoading(false);
          return;
        }

        processFormData(matchingForm);
      }
    }

    function processFormData(data: any) {
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
  }, [formId, formSlug]);

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

    return normalizeTipo(String(campo.tipo));
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

  const validateField = (campo: string | CampoPersonalizado, value: FormValue): string | null => {
    const id = getCampoId(campo);
    const valueStr = valueToString(value);

    try {
      if (id === "nome") {
        nameSchema.parse(valueStr);
      } else if (id === "telefone") {
        phoneSchema.parse(valueStr);
      } else if (id === "email") {
        emailSchema.parse(valueStr);
      } else if (typeof campo !== "string" && campo.obrigatorio && isEmptyValue(value)) {
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

  const handleChange = (campoId: string, value: FormValue) => {
    // For phone field, strip country code if present and format
    if (campoId === "telefone") {
      const stripped = stripCountryCode(String(value ?? ""), countryCode);
      const formattedPhone = formatPhoneByCountry(stripped, countryCode);
      setFormData((prev) => ({ ...prev, [campoId]: formattedPhone }));
    } else {
      setFormData((prev) => ({ ...prev, [campoId]: value }));
    }

    if (fieldErrors[campoId]) {
      setFieldErrors((prev) => ({ ...prev, [campoId]: "" }));
    }
  };

  const handleBlur = (campo: string | CampoPersonalizado) => {
    const id = getCampoId(campo);
    const value = formData[id];
    if (!isEmptyValue(value)) {
      const error = validateField(campo, value);
      if (error) {
        setFieldErrors((prev) => ({ ...prev, [id]: error }));
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

      if (isEmptyValue(value)) {
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
          dadosExtras[campo.label] = valueToString(formData[id]);
        }
      }

      const { error } = await supabase.from("instagram_formularios_respostas").insert({
        formulario_id: config.id,
        user_id: config.user_id,
        instagram_user_id: instagramUserId || null,
        tracking_id: trackingId || null,
        nome: valueToString(formData.nome) || null,
        telefone: formData.telefone ? `${countryCode}${valueToString(formData.telefone).replace(/\D/g, "")}` : null,
        email: valueToString(formData.email) || null,
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
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <CheckCircle2 className="h-16 w-16" style={{ color: config.cor_primaria }} />
            <p className="text-lg font-medium text-center">{config.mensagem_sucesso}</p>

            {config.botao_sucesso_texto && config.botao_sucesso_url && (
              <Button
                className="mt-4"
                style={{ backgroundColor: config.cor_primaria }}
                onClick={() => {
                  let url = config.botao_sucesso_url!;
                  if (!url.startsWith("http://") && !url.startsWith("https://")) {
                    url = "https://" + url;
                  }
                  window.open(url, "_blank");
                }}
              >
                {config.botao_sucesso_texto}
              </Button>
            )}
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
            <img src={config.imagem_url} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{config.titulo_pagina}</CardTitle>
          {config.subtitulo_pagina && <CardDescription>{config.subtitulo_pagina}</CardDescription>}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {config.campos.map((campo) => {
              const id = getCampoId(campo);
              const tipo = getCampoTipo(campo);
              const isCustomField = typeof campo !== "string";
              const opcoes = isCustomField && "opcoes" in campo ? campo.opcoes : undefined;

              return (
                <div key={id} className="space-y-2">
                  <Label htmlFor={id}>{getCampoLabel(campo)}</Label>

                  {tipo === "textarea" ? (
                    <Textarea
                      id={id}
                      placeholder={getCampoPlaceholder(campo)}
                      value={valueToString(formData[id])}
                      onChange={(e) => handleChange(id, e.target.value)}
                      onBlur={() => handleBlur(campo)}
                      className={fieldErrors[id] ? "border-destructive" : ""}
                      rows={3}
                    />
                  ) : tipo === "multipla_escolha" ? (
                    <div className="space-y-1">
                      {(opcoes || []).length > 0 ? (
                        (opcoes || []).map((opcao, idx) => {
                          const selected = Array.isArray(formData[id])
                            ? (formData[id] as string[]).includes(opcao)
                            : false;

                          return (
                            <label
                              key={idx}
                              className="flex items-center gap-3 py-1.5 cursor-pointer"
                            >
                              <Checkbox
                                checked={selected}
                                onCheckedChange={(checked) => {
                                  const current = Array.isArray(formData[id]) ? (formData[id] as string[]) : [];
                                  const next = checked
                                    ? Array.from(new Set([...current, opcao]))
                                    : current.filter((v) => v !== opcao);
                                  handleChange(id, next);
                                }}
                                style={{
                                  borderColor: config.cor_primaria,
                                  backgroundColor: selected ? config.cor_primaria : undefined,
                                }}
                                className="border-2"
                              />
                              <span className="text-sm">{opcao}</span>
                            </label>
                          );
                        })
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Este campo de múltipla escolha está sem opções configuradas.
                        </div>
                      )}
                    </div>
                  ) : tipo === "sim_nao" ? (
                    <div className="space-y-1">
                      {(opcoes && opcoes.length >= 2 ? opcoes : ["Sim", "Não"]).map((opcao) => {
                        const selected = valueToString(formData[id]) === opcao;
                        return (
                          <label
                            key={opcao}
                            className="flex items-center gap-3 py-1.5 cursor-pointer"
                          >
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) => {
                                handleChange(id, checked ? opcao : "");
                              }}
                              style={{
                                borderColor: config.cor_primaria,
                                backgroundColor: selected ? config.cor_primaria : undefined,
                              }}
                              className="border-2"
                            />
                            <span className="text-sm">{opcao}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : id === "telefone" ? (
                    <CountryCodeSelect
                      value={countryCode}
                      onChange={setCountryCode}
                      phoneValue={valueToString(formData[id])}
                      onPhoneChange={(value) => handleChange(id, value)}
                      onPhoneBlur={() => handleBlur(campo)}
                      placeholder={getPhonePlaceholder(countryCode)}
                    />
                  ) : (
                    <Input
                      id={id}
                      type={tipo}
                      autoComplete={
                        id === "nome" ? "name" : 
                        id === "email" ? "email" : 
                        tipo === "tel" ? "tel" : undefined
                      }
                      placeholder={getCampoPlaceholder(campo)}
                      value={valueToString(formData[id])}
                      onChange={(e) => handleChange(id, e.target.value)}
                      onBlur={() => handleBlur(campo)}
                      className={fieldErrors[id] ? "border-destructive" : ""}
                    />
                  )}

                  {fieldErrors[id] && <p className="text-xs text-destructive">{fieldErrors[id]}</p>}
                </div>
              );
            })}

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
              style={{ backgroundColor: config.cor_primaria }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {config.texto_botao}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
