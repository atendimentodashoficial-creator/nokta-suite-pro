import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { normalizePhone, getLast8Digits, formatPhoneByCountry, getPhonePlaceholder, stripCountryCode } from "@/utils/phoneFormat";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { CountryCodeSelect } from "@/components/whatsapp/CountryCodeSelect";

export function LeadForm() {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [countryCode, setCountryCode] = useState("55");
  const [email, setEmail] = useState("");
  
  const queryClient = useQueryClient();

  const createLead = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const fullPhone = `${countryCode}${normalizePhone(telefone)}`;
      const last8Digits = getLast8Digits(telefone);

      // Buscar cliente existente pelos últimos 8 dígitos (server-side)
      const { data: matchingLeads } = await supabase
        .from("leads")
        .select("id, nome, email, telefone")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .like("telefone", `%${last8Digits}`)
        .limit(1);

      const clienteExistente = matchingLeads?.[0] || null;

      // Se já existe, não criar novo, apenas atualizar se necessário
      if (clienteExistente) {
        const { data, error } = await supabase
          .from("leads")
          .update({
            nome,
            email: email || null,
          })
          .eq("id", clienteExistente.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      }

      // Se não existe, criar novo lead
      const { data, error } = await supabase
        .from("leads")
        .insert({
          user_id: user.id,
          nome,
          telefone: fullPhone,
          email: email || null,
          procedimento_nome: "",
          status: "lead",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead cadastrado com sucesso!");
      setOpen(false);
      setNome("");
      setTelefone("");
      setCountryCode("55");
      setEmail("");
    },
    onError: (error) => {
      toast.error("Erro ao cadastrar lead");
      console.error(error);
    },
  });

  const handleTelefoneBlur = async () => {
    const last8Digits = getLast8Digits(telefone);
    if (!last8Digits || last8Digits.length < 8) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Buscar cliente existente pelos últimos 8 dígitos (server-side)
      const { data: matchingLeads } = await supabase
        .from("leads")
        .select("nome, email, telefone")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .like("telefone", `%${last8Digits}`)
        .limit(1);

      const clienteExistente = matchingLeads?.[0] || null;

      if (clienteExistente) {
        setNome(clienteExistente.nome);
        if (clienteExistente.email) {
          setEmail(clienteExistente.email);
        }
        toast.info("Cliente encontrado! Dados preenchidos automaticamente.");
      }
    } catch (error) {
      // Silenciosamente ignora se não encontrar cliente
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !telefone.trim()) {
      toast.error("Nome e telefone são obrigatórios");
      return;
    }
    createLead.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1 sm:mr-2" />
          <span className="text-xs sm:text-sm">Novo Lead</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone</Label>
            <CountryCodeSelect 
              value={countryCode} 
              onChange={setCountryCode}
              phoneValue={formatPhoneByCountry(telefone, countryCode)}
              onPhoneChange={(val) => setTelefone(stripCountryCode(val, countryCode))}
              onPhoneBlur={handleTelefoneBlur}
              placeholder={getPhonePlaceholder(countryCode)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={createLead.isPending}>
              {createLead.isPending ? "Cadastrando..." : "Cadastrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}