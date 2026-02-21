import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone, getLast8Digits, formatPhoneByCountry, getPhonePlaceholder, stripCountryCode } from "@/utils/phoneFormat";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { CountryCodeSelect } from "@/components/whatsapp/CountryCodeSelect";

const clienteSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(100, "Nome deve ter no máximo 100 caracteres"),
  telefone: z.string().trim().min(1, "Telefone é obrigatório").max(20, "Telefone deve ter no máximo 20 caracteres"),
  email: z.string().trim().email("Email inválido").max(255, "Email deve ter no máximo 255 caracteres").optional().or(z.literal("")),
});

type ClienteFormData = z.infer<typeof clienteSchema>;

export function NovoClienteDialog() {
  const [open, setOpen] = useState(false);
  const [countryCode, setCountryCode] = useState("55");
  const queryClient = useQueryClient();

  const form = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      nome: "",
      telefone: "",
      email: "",
    },
  });

  const createCliente = useMutation({
    mutationFn: async (data: ClienteFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Build full phone number with country code
      const fullPhone = `${countryCode}${normalizePhone(data.telefone)}`;
      const last8Digits = getLast8Digits(data.telefone);

      // Buscar cliente existente pelos últimos 8 dígitos (server-side)
      const { data: matchingLeads } = await supabase
        .from("leads")
        .select("id, nome, email, telefone")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .like("telefone", `%${last8Digits}`)
        .limit(1);

      const clienteExistente = matchingLeads?.[0] || null;

      // Se já existe, não criar novo, apenas atualizar informações
      if (clienteExistente) {
        const { error } = await supabase
          .from("leads")
          .update({
            nome: data.nome,
            email: data.email || null,
            status: "cliente",
          })
          .eq("id", clienteExistente.id);

        if (error) throw error;
        return;
      }

      // Se não existe, criar novo cliente
      const { error } = await supabase
        .from("leads")
        .insert({
          user_id: user.id,
          nome: data.nome,
          telefone: fullPhone,
          email: data.email || null,
          procedimento_nome: "",
          observacoes: null,
          status: "cliente",
          origem_tipo: "Manual",
          origem_lead: false,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Cliente cadastrado com sucesso!");
      setOpen(false);
      form.reset();
      setCountryCode("55");
    },
    onError: (error) => {
      console.error("Erro ao cadastrar cliente:", error);
      toast.error("Erro ao cadastrar cliente");
    },
  });

  const handleTelefoneBlur = async () => {
    const telefoneValue = form.getValues("telefone");
    const last8Digits = getLast8Digits(telefoneValue);
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
        form.setValue("nome", clienteExistente.nome);
        if (clienteExistente.email) {
          form.setValue("email", clienteExistente.email);
        }
        toast.info("Cliente encontrado! Dados preenchidos automaticamente.");
      }
    } catch (error) {
      // Silenciosamente ignora se não encontrar cliente
    }
  };

  const onSubmit = async (data: ClienteFormData) => {
    await createCliente.mutateAsync(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1 sm:mr-2" />
          <span className="text-xs sm:text-sm">Novo Cliente</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Cliente</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome completo do cliente" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="telefone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <CountryCodeSelect 
                        value={countryCode} 
                        onChange={setCountryCode}
                        phoneValue={formatPhoneByCountry(field.value, countryCode)}
                        onPhoneChange={(val) => field.onChange(stripCountryCode(val, countryCode))}
                        onPhoneBlur={() => {
                          field.onBlur();
                          handleTelefoneBlur();
                        }}
                        placeholder={getPhonePlaceholder(countryCode)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@exemplo.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={createCliente.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createCliente.isPending}>
                {createCliente.isPending ? "Cadastrando..." : "Cadastrar Cliente"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}