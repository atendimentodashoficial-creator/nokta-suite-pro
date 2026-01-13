import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface MetaPixelConfig {
  id: string;
  user_id: string;
  pixel_id: string;
  access_token: string;
  test_event_code: string | null;
  mensagem_formulario: string | null;
  eventos_ativos: {
    lead: boolean;
    initiate_checkout: boolean;
    purchase: boolean;
    complete_registration: boolean;
  };
  created_at: string;
  updated_at: string;
}

export interface ConversionEvent {
  event_name: "Lead" | "InitiateCheckout" | "Purchase" | "CompleteRegistration";
  lead_id?: string;
  fatura_id?: string;
  agendamento_id?: string;
  value?: number;
  currency?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_name?: string;
  utm_source?: string;
  utm_campaign?: string;
  fbclid?: string;
  external_id?: string;
}

export const useMetaPixelConfig = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["meta-pixel-config", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from("meta_pixel_config")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as MetaPixelConfig | null;
    },
    enabled: !!user?.id,
  });
};

export const useSaveMetaPixelConfig = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: {
      pixel_id: string;
      access_token: string;
      test_event_code?: string;
      mensagem_formulario?: string;
      eventos_ativos?: MetaPixelConfig["eventos_ativos"];
    }) => {
      if (!user?.id) throw new Error("User not authenticated");

      const { data: existing } = await supabase
        .from("meta_pixel_config")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("meta_pixel_config")
          .update({
            pixel_id: config.pixel_id,
            access_token: config.access_token,
            test_event_code: config.test_event_code || null,
            mensagem_formulario: config.mensagem_formulario || null,
            eventos_ativos: config.eventos_ativos,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("meta_pixel_config").insert({
          user_id: user.id,
          pixel_id: config.pixel_id,
          access_token: config.access_token,
          test_event_code: config.test_event_code || null,
          mensagem_formulario: config.mensagem_formulario || null,
          eventos_ativos: config.eventos_ativos || {
            lead: true,
            initiate_checkout: true,
            purchase: true,
            complete_registration: true,
          },
        });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-pixel-config"] });
      toast.success("Configuração do Pixel salva com sucesso!");
    },
    onError: (error) => {
      console.error("Error saving pixel config:", error);
      toast.error("Erro ao salvar configuração do Pixel");
    },
  });
};

export const useSendConversionEvent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (event: ConversionEvent) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-conversions-api`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(event),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send conversion event");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-conversion-events"] });
      toast.success("Evento de conversão enviado para o Meta!");
    },
    onError: (error) => {
      console.error("Error sending conversion:", error);
      toast.error(`Erro ao enviar conversão: ${error.message}`);
    },
  });
};

export const useConversionEvents = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["meta-conversion-events", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("meta_conversion_events")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
};

export const useDeleteConversionEvent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("meta_conversion_events")
        .delete()
        .eq("id", eventId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-conversion-events"] });
      toast.success("Evento excluído com sucesso!");
    },
    onError: (error) => {
      console.error("Error deleting event:", error);
      toast.error("Erro ao excluir evento");
    },
  });
};

// Hook to capture UTM parameters from URL
export const useUtmCapture = () => {
  const captureUtmParams = () => {
    const urlParams = new URLSearchParams(window.location.search);
    
    const utmData = {
      utm_source: urlParams.get("utm_source"),
      utm_medium: urlParams.get("utm_medium"),
      utm_campaign: urlParams.get("utm_campaign"),
      utm_content: urlParams.get("utm_content"),
      utm_term: urlParams.get("utm_term"),
      fbclid: urlParams.get("fbclid"),
      gclid: urlParams.get("gclid"),
    };

    // Only return if at least one parameter exists
    const hasParams = Object.values(utmData).some((v) => v !== null);
    
    if (hasParams) {
      // Store in sessionStorage for later use when creating leads
      sessionStorage.setItem("utm_data", JSON.stringify(utmData));
      return utmData;
    }

    // Check if we have stored UTM data
    const stored = sessionStorage.getItem("utm_data");
    if (stored) {
      return JSON.parse(stored);
    }

    return null;
  };

  return { captureUtmParams };
};

// Helper to get stored UTM data
export const getStoredUtmData = () => {
  const stored = sessionStorage.getItem("utm_data");
  return stored ? JSON.parse(stored) : null;
};
