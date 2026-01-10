import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle, Loader2 } from "lucide-react";

interface FormData {
  genero: string;
  data_nascimento: string;
  cep: string;
  cidade: string;
  estado: string;
  endereco: string;
}

export default function FormularioConversao() {
  const { faturaId } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [clienteNome, setClienteNome] = useState("");
  const [formData, setFormData] = useState<FormData>({
    genero: "",
    data_nascimento: "",
    cep: "",
    cidade: "",
    estado: "",
    endereco: "",
  });

  useEffect(() => {
    const loadData = async () => {
      if (!faturaId) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("conversao-form", {
          body: { action: "get", faturaId },
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Erro ao carregar dados");

        const fatura = data.fatura as any;
        const lead = data.lead as any;

        if (lead) {
          setClienteNome(lead.nome || "");
          setFormData({
            genero: lead.genero || "",
            data_nascimento: lead.data_nascimento || "",
            cep: lead.cep || "",
            cidade: lead.cidade || "",
            estado: lead.estado || "",
            endereco: lead.endereco || "",
          });
        }

        // Check if already completed
        if (fatura?.pixel_status === "dados_completos" || fatura?.pixel_status === "evento_enviado") {
          setSubmitted(true);
        }
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [faturaId]);

  const handleCepBlur = async () => {
    const cep = formData.cep.replace(/\D/g, "");
    if (cep.length !== 8) return;

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          cidade: data.localidade || prev.cidade,
          estado: data.uf || prev.estado,
          endereco: data.logradouro || prev.endereco,
        }));
      }
    } catch (err) {
      console.error("Error fetching CEP:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faturaId) return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("conversao-form", {
        body: {
          action: "submit",
          faturaId,
          ...formData,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao enviar dados");

      setSubmitted(true);
      toast.success("Dados enviados com sucesso!");
    } catch (err) {
      console.error("Error submitting:", err);
      toast.error("Erro ao enviar dados. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Obrigado, {clienteNome}!</h2>
            <p className="text-muted-foreground">
              Seus dados foram enviados com sucesso. Você já pode fechar esta página.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Complete seus dados</CardTitle>
          <CardDescription>
            Olá{clienteNome ? `, ${clienteNome}` : ""}! Para finalizar seu cadastro, precisamos de algumas informações adicionais.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="genero">Gênero</Label>
              <Select
                value={formData.genero}
                onValueChange={(value) => setFormData(prev => ({ ...prev, genero: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="feminino">Feminino</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="data_nascimento">Data de Nascimento</Label>
              <Input
                id="data_nascimento"
                type="date"
                value={formData.data_nascimento}
                onChange={(e) => setFormData(prev => ({ ...prev, data_nascimento: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cep">CEP</Label>
              <Input
                id="cep"
                placeholder="00000-000"
                value={formData.cep}
                onChange={(e) => setFormData(prev => ({ ...prev, cep: e.target.value }))}
                onBlur={handleCepBlur}
                maxLength={9}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cidade">Cidade</Label>
                <Input
                  id="cidade"
                  placeholder="Sua cidade"
                  value={formData.cidade}
                  onChange={(e) => setFormData(prev => ({ ...prev, cidade: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estado">Estado</Label>
                <Input
                  id="estado"
                  placeholder="UF"
                  value={formData.estado}
                  onChange={(e) => setFormData(prev => ({ ...prev, estado: e.target.value }))}
                  maxLength={2}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="endereco">Endereço</Label>
              <Input
                id="endereco"
                placeholder="Rua, número, bairro"
                value={formData.endereco}
                onChange={(e) => setFormData(prev => ({ ...prev, endereco: e.target.value }))}
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar dados"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
