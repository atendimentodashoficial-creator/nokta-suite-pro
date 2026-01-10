import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, Send, CheckCircle, AlertCircle, Loader2, Megaphone } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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
  
  const status = pixelStatus || "pendente";

  const sendFormMessage = async () => {
    setSendingForm(true);
    try {
      // Get the form URL
      const formUrl = `${window.location.origin}/conversao/${faturaId}`;
      
      // Send WhatsApp message
      const message = `Olá! Para finalizar seu cadastro, precisamos de algumas informações adicionais. Por favor, preencha o formulário abaixo:\n\n${formUrl}`;
      
      // Determine which config to use based on origem
      const isDisparos = clienteOrigem?.toLowerCase() === "disparos";
      
      const { data: session } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke(
        isDisparos ? "disparos-send-message" : "uazapi-send-message",
        {
          body: {
            phone: clienteTelefone,
            message,
          },
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
          },
        }
      );

      if (response.error) throw response.error;

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
    } catch (error) {
      console.error("Error sending form:", error);
      toast.error("Erro ao enviar formulário");
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
