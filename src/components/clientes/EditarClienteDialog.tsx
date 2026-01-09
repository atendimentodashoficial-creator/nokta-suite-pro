import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatPhoneByCountry, getPhonePlaceholder } from "@/utils/phoneFormat";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Lead } from "@/hooks/useLeads";
import { CountryCodeSelect, countries } from "@/components/whatsapp/CountryCodeSelect";

const clienteSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório").max(100),
  telefone: z.string().min(1, "Telefone é obrigatório").max(20),
  email: z.string().email("Email inválido").max(255).optional().or(z.literal("")),
});

type ClienteFormData = z.infer<typeof clienteSchema>;

interface EditarClienteDialogProps {
  cliente: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditarClienteDialog({
  cliente,
  open,
  onOpenChange,
}: EditarClienteDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Extract country code from existing phone number
  const extractCountryCode = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    // Check common country codes
    for (const country of countries) {
      if (digits.startsWith(country.dialCode)) {
        return country.dialCode;
      }
    }
    return "55"; // Default to Brazil
  };
  
  const extractPhoneWithoutCountry = (phone: string, countryCode: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith(countryCode)) {
      return digits.slice(countryCode.length);
    }
    return digits;
  };
  
  const [countryCode, setCountryCode] = useState(() => extractCountryCode(cliente.telefone));

  const form = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      nome: cliente.nome,
      telefone: extractPhoneWithoutCountry(cliente.telefone, extractCountryCode(cliente.telefone)),
      email: cliente.email || "",
    },
  });
  
  // Update form when cliente changes
  useEffect(() => {
    const code = extractCountryCode(cliente.telefone);
    setCountryCode(code);
    form.reset({
      nome: cliente.nome,
      telefone: extractPhoneWithoutCountry(cliente.telefone, code),
      email: cliente.email || "",
    });
  }, [cliente, form]);

  const updateCliente = useMutation({
    mutationFn: async (data: ClienteFormData) => {
      // Build full phone with country code
      const fullPhone = `${countryCode}${data.telefone.replace(/\D/g, '')}`;
      
      // Update lead
      const { error } = await supabase
        .from("leads")
        .update({
          nome: data.nome,
          telefone: fullPhone,
          email: data.email || null,
        })
        .eq("id", cliente.id);

      if (error) throw error;

      // Atualizar nome em todos os registros relacionados
      const getLast8Digits = (phone: string) => phone.replace(/\D/g, '').slice(-8);
      const clienteLast8 = getLast8Digits(cliente.telefone);
      
      // 1. Atualizar todos os leads com o mesmo telefone (últimos 8 dígitos)
      const { data: allLeads } = await supabase
        .from("leads")
        .select("id, telefone")
        .neq("id", cliente.id);
      
      if (allLeads) {
        const matchingLeads = allLeads.filter(
          lead => getLast8Digits(lead.telefone) === clienteLast8
        );
        
        for (const lead of matchingLeads) {
          await supabase
            .from("leads")
            .update({ nome: data.nome })
            .eq("id", lead.id);
        }
      }
      
      // 2. Atualizar WhatsApp chats
      const { data: whatsappChats } = await supabase
        .from("whatsapp_chats")
        .select("id, normalized_number");

      if (whatsappChats) {
        const matchingWhatsappChats = whatsappChats.filter(
          chat => getLast8Digits(chat.normalized_number) === clienteLast8
        );

        for (const chat of matchingWhatsappChats) {
          await supabase
            .from("whatsapp_chats")
            .update({ contact_name: data.nome })
            .eq("id", chat.id);
        }
      }
      
      // 3. Atualizar Disparos chats
      const { data: disparosChats } = await supabase
        .from("disparos_chats")
        .select("id, normalized_number");

      if (disparosChats) {
        const matchingDisparosChats = disparosChats.filter(
          chat => getLast8Digits(chat.normalized_number) === clienteLast8
        );

        for (const chat of matchingDisparosChats) {
          await supabase
            .from("disparos_chats")
            .update({ contact_name: data.nome })
            .eq("id", chat.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-chats"] });
      queryClient.invalidateQueries({ queryKey: ["disparos-chats"] });
      toast.success("Cliente atualizado com sucesso!");
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Erro ao atualizar cliente:", error);
      toast.error("Erro ao atualizar cliente");
    },
  });

  const onSubmit = async (data: ClienteFormData) => {
    setIsSubmitting(true);
    try {
      await updateCliente.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Cliente</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Nome do cliente" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="telefone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone *</FormLabel>
                  <FormControl>
                    <CountryCodeSelect 
                      value={countryCode} 
                      onChange={setCountryCode}
                      phoneValue={formatPhoneByCountry(field.value, countryCode)}
                      onPhoneChange={(val) => field.onChange(val.replace(/\D/g, ''))}
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
                    <Input {...field} type="email" placeholder="email@exemplo.com" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
