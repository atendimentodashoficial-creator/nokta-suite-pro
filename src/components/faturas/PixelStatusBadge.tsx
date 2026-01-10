import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, Send, CheckCircle, AlertCircle, Loader2, Megaphone } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

type PixelStatus = "pendente" | "formulario_enviado" | "dados_completos" | "evento_enviado";

interface PixelStatusBadgeProps {
  faturaId: string;
  clienteId: string;
  clienteTelefone: string;
  clienteOrigem?: string | null;
  pixelStatus?: PixelStatus | null;
  compact?: boolean;
}

export function PixelStatusBadge({
  faturaId,
  clienteId,
  clienteTelefone,
  clienteOrigem,
  pixelStatus,
  compact = false,
}: PixelStatusBadgeProps) {
  const [sendingForm, setSendingForm] = useState(false);
  const [sendingEvent, setSendingEvent] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const status = pixelStatus || "pendente";

  // Fetch the custom message from meta_pixel_config
  const { data: pixelConfig } = useQuery({
    queryKey: ["meta-pixel-config", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("meta_pixel_config")
        .select("mensagem_formulario")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const sendFormMessage = async () => {
    setSendingForm(true);
    try {
      // Get the form URL
      const formUrl = `${window.location.origin}/conversao/${faturaId}`;
      
      // Use custom message or default
      const customMessage = pixelConfig?.mensagem_formulario || 
        "Olá! Para finalizar seu cadastro, precisamos de algumas informações adicionais. Por favor, preencha o formulário abaixo:";
      const message = `${customMessage}\n\n${formUrl}`;
      
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Não autenticado");

      // Get the lead's instancia_nome to find the correct instance
      const { data: leadData } = await supabase
        .from("leads")
        .select("instancia_nome, origem")
        .eq("id", clienteId)
        .single();

      const leadInstanciaNome = leadData?.instancia_nome;
      const isDisparos = clienteOrigem?.toLowerCase() === "disparos" || leadData?.origem?.toLowerCase() === "disparos";

      // If lead has instancia_nome, find the matching instance
      let instanceConfig = null;
      if (leadInstanciaNome) {
        // First check in disparos_instancias
        const { data: disparosInstance } = await supabase
          .from("disparos_instancias")
          .select("id, base_url, api_key")
          .eq("user_id", user?.id)
          .eq("nome", leadInstanciaNome)
          .eq("is_active", true)
          .maybeSingle();

        if (disparosInstance) {
          instanceConfig = {
            type: "disparos",
            baseUrl: disparosInstance.base_url,
            apiKey: disparosInstance.api_key,
          };
        } else {
          // Check if it matches the main WhatsApp instance name
          const { data: mainConfig } = await supabase
            .from("uazapi_config")
            .select("base_url, api_key, instance_name")
            .eq("user_id", user?.id)
            .eq("is_active", true)
            .maybeSingle();

          if (mainConfig && mainConfig.instance_name === leadInstanciaNome) {
            instanceConfig = {
              type: "whatsapp",
              baseUrl: mainConfig.base_url,
              apiKey: mainConfig.api_key,
            };
          }
        }
      }

      // If we found a specific instance, send directly
      if (instanceConfig) {
        const sendResponse = await fetch(`${instanceConfig.baseUrl}/message/sendText`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: instanceConfig.apiKey,
          },
          body: JSON.stringify({
            number: clienteTelefone,
            text: message,
          }),
        });

        if (!sendResponse.ok) {
          const errorData = await sendResponse.json().catch(() => ({}));
          throw new Error(errorData.error || `Erro ${sendResponse.status}`);
        }
      } else {
        // Fallback to edge function based on origem
        const functionName = isDisparos ? "disparos-send-message" : "uazapi-send-message";
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.session.access_token}`,
            },
            body: JSON.stringify({
              number: clienteTelefone,
              text: message,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Erro ${response.status}`);
        }
      }

      // Update fatura status
      const { error: updateError } = await supabase
        .from("faturas")
        .update({
          pixel_status: "formulario_enviado",
          pixel_form_sent_at: new Date().toISOString(),
        })
        .eq("id", faturaId);

      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      toast.success("Formulário enviado para o cliente!");
    } catch (error: any) {
      console.error("Error sending form:", error);
      toast.error(error.message || "Erro ao enviar formulário");
    } finally {
      setSendingForm(false);
    }
  };

  const sendPixelEvent = async () => {
    setSendingEvent(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke("meta-conversions-api", {
        body: {
          event_name: "Purchase",
          lead_id: clienteId,
          fatura_id: faturaId,
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (response.error) throw response.error;
      if (!response.data?.success) throw new Error(response.data?.error || "Erro ao enviar evento");

      // Update fatura status
      const { error: updateError } = await supabase
        .from("faturas")
        .update({
          pixel_status: "evento_enviado",
          pixel_event_sent_at: new Date().toISOString(),
        })
        .eq("id", faturaId);

      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      toast.success("Evento enviado para o Meta Pixel!");
    } catch (error: any) {
      console.error("Error sending pixel event:", error);
      toast.error(error.message || "Erro ao enviar evento para o Pixel");
    } finally {
      setSendingEvent(false);
    }
  };

  const getStatusConfig = () => {
    switch (status) {
      case "pendente":
        return {
          icon: Clock,
          label: "Aguardando dados",
          color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
          description: "Cliente precisa preencher o formulário",
        };
      case "formulario_enviado":
        return {
          icon: Send,
          label: "Formulário enviado",
          color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
          description: "Aguardando cliente preencher",
        };
      case "dados_completos":
        return {
          icon: CheckCircle,
          label: "Pronto para enviar",
          color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
          description: "Dados completos, pode enviar ao Pixel",
        };
      case "evento_enviado":
        return {
          icon: Megaphone,
          label: "Enviado ao Pixel",
          color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
          description: "Evento de conversão já foi enviado",
        };
      default:
        return {
          icon: AlertCircle,
          label: "Desconhecido",
          color: "bg-gray-100 text-gray-700",
          description: "Status desconhecido",
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className={`${config.color} cursor-help`}>
              <Icon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{config.description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Badge className={config.color}>
          <Icon className="h-3 w-3 mr-1" />
          {config.label}
        </Badge>
      </div>
      
      <div className="flex gap-2">
        {(status === "pendente" || status === "formulario_enviado") && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={sendFormMessage}
                  disabled={sendingForm}
                  className="text-xs"
                >
                  {sendingForm ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-3 w-3 mr-1" />
                      {status === "formulario_enviado" ? "Reenviar" : "Enviar"} formulário
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Envia mensagem no WhatsApp com link do formulário</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {status === "dados_completos" && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={sendPixelEvent}
                  disabled={sendingEvent}
                  className="text-xs bg-purple-600 hover:bg-purple-700"
                >
                  {sendingEvent ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Megaphone className="h-3 w-3 mr-1" />
                      Enviar ao Pixel
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Envia evento Purchase para o Meta Pixel</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
