import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatPhoneByCountry, getPhonePlaceholder } from "@/utils/phoneFormat";
import { syncContactNameEverywhere, CONTACT_NAME_QUERY_KEYS } from "@/utils/syncContactName";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Lead } from "@/hooks/useLeads";
import { CountryCodeSelect, countries } from "@/components/whatsapp/CountryCodeSelect";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

const clienteSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório").max(100),
  telefone: z.string().min(1, "Telefone é obrigatório").max(20),
  email: z.string().email("Email inválido").max(255).optional().or(z.literal("")),
  // Campos adicionais para Meta Pixel
  genero: z.string().optional(),
  data_nascimento: z.string().optional(),
  cidade: z.string().max(100).optional(),
  estado: z.string().max(50).optional(),
  cep: z.string().max(20).optional(),
  endereco: z.string().max(255).optional(),
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
      genero: (cliente as any).genero || "",
      data_nascimento: (cliente as any).data_nascimento || "",
      cidade: (cliente as any).cidade || "",
      estado: (cliente as any).estado || "",
      cep: (cliente as any).cep || "",
      endereco: (cliente as any).endereco || "",
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
      genero: (cliente as any).genero || "",
      data_nascimento: (cliente as any).data_nascimento || "",
      cidade: (cliente as any).cidade || "",
      estado: (cliente as any).estado || "",
      cep: (cliente as any).cep || "",
      endereco: (cliente as any).endereco || "",
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
          genero: data.genero || null,
          data_nascimento: data.data_nascimento || null,
          cidade: data.cidade || null,
          estado: data.estado || null,
          cep: data.cep || null,
          endereco: data.endereco || null,
        })
        .eq("id", cliente.id);

      if (error) throw error;

      // Propagar nome para todas as tabelas relacionadas (leads, whatsapp_chats, disparos_chats)
      await syncContactNameEverywhere(cliente.telefone, data.nome, cliente.id);
    },
    onSuccess: () => {
      // Invalidar todas as queries relacionadas a contatos
      CONTACT_NAME_QUERY_KEYS.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
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
      <DialogContent className="sm:max-w-[550px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Editar Cliente</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Dados básicos */}
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
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
                    <FormLabel>Telefone</FormLabel>
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

              {/* Dados adicionais para Meta Pixel */}
              <Separator className="my-4" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Dados Adicionais</p>
                <p className="text-xs text-muted-foreground">
                  Esses dados melhoram a correspondência de conversões no Meta Ads
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="genero"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gênero</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="m">Masculino</SelectItem>
                          <SelectItem value="f">Feminino</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="data_nascimento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nascimento</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" className="h-10" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="endereco"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereço</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Rua, número, complemento" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="cidade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Cidade" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="estado"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="UF" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="AC">AC</SelectItem>
                          <SelectItem value="AL">AL</SelectItem>
                          <SelectItem value="AP">AP</SelectItem>
                          <SelectItem value="AM">AM</SelectItem>
                          <SelectItem value="BA">BA</SelectItem>
                          <SelectItem value="CE">CE</SelectItem>
                          <SelectItem value="DF">DF</SelectItem>
                          <SelectItem value="ES">ES</SelectItem>
                          <SelectItem value="GO">GO</SelectItem>
                          <SelectItem value="MA">MA</SelectItem>
                          <SelectItem value="MT">MT</SelectItem>
                          <SelectItem value="MS">MS</SelectItem>
                          <SelectItem value="MG">MG</SelectItem>
                          <SelectItem value="PA">PA</SelectItem>
                          <SelectItem value="PB">PB</SelectItem>
                          <SelectItem value="PR">PR</SelectItem>
                          <SelectItem value="PE">PE</SelectItem>
                          <SelectItem value="PI">PI</SelectItem>
                          <SelectItem value="RJ">RJ</SelectItem>
                          <SelectItem value="RN">RN</SelectItem>
                          <SelectItem value="RS">RS</SelectItem>
                          <SelectItem value="RO">RO</SelectItem>
                          <SelectItem value="RR">RR</SelectItem>
                          <SelectItem value="SC">SC</SelectItem>
                          <SelectItem value="SP">SP</SelectItem>
                          <SelectItem value="SE">SE</SelectItem>
                          <SelectItem value="TO">TO</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="cep"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CEP</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="00000-000" maxLength={9} />
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
