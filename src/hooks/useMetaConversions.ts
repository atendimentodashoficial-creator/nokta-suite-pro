import { supabase } from "@/integrations/supabase/client";

export interface ConversionEventData {
  event_name: "Lead" | "InitiateCheckout" | "Purchase" | "CompleteRegistration";
  lead_id?: string;
  fatura_id?: string;
  agendamento_id?: string;
  value?: number;
  currency?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_name?: string;
  // Additional customer data for better Meta matching
  customer_gender?: string;
  customer_date_of_birth?: string;
  customer_city?: string;
  customer_state?: string;
  customer_zip?: string;
  // Attribution
  utm_source?: string;
  utm_campaign?: string;
  fbclid?: string;
  external_id?: string;
  // Event timestamp
  data_fatura?: string;
}

/**
 * Sends a conversion event to Meta if the pixel is configured and the event type is enabled
 */
export async function sendMetaConversionEvent(
  event: ConversionEventData
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.log("Meta Conversion: User not authenticated, skipping event");
      return { success: false, error: "Not authenticated" };
    }

    // Check if pixel is configured and event is enabled
    const { data: pixelConfig } = await supabase
      .from("meta_pixel_config")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!pixelConfig) {
      console.log("Meta Conversion: Pixel not configured, skipping event");
      return { success: false, error: "Pixel not configured" };
    }

    // Check if the specific event type is enabled
    const eventosAtivos = pixelConfig.eventos_ativos as {
      lead?: boolean;
      initiate_checkout?: boolean;
      purchase?: boolean;
      complete_registration?: boolean;
    } | null;

    if (eventosAtivos) {
      const eventMap: Record<string, keyof typeof eventosAtivos> = {
        Lead: "lead",
        InitiateCheckout: "initiate_checkout",
        Purchase: "purchase",
        CompleteRegistration: "complete_registration",
      };

      const eventKey = eventMap[event.event_name];
      if (eventKey && eventosAtivos[eventKey] === false) {
        console.log(`Meta Conversion: Event ${event.event_name} is disabled, skipping`);
        return { success: false, error: "Event type disabled" };
      }
    }

    // Send the event
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
      console.error("Meta Conversion: Failed to send event", error);
      return { success: false, error: error.error || "Failed to send event" };
    }

    console.log(`Meta Conversion: Event ${event.event_name} sent successfully`);
    return { success: true };
  } catch (error) {
    console.error("Meta Conversion: Error sending event", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Fetches lead data and sends a Purchase conversion event
 */
export async function sendPurchaseConversion(
  faturaId: string,
  clienteId: string,
  valor: number,
  dataFatura?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch lead data for customer info and attribution (including new fields)
    const { data: lead } = await supabase
      .from("leads")
      .select("nome, telefone, email, utm_source, utm_campaign, fbclid, genero, data_nascimento, cidade, estado, cep")
      .eq("id", clienteId)
      .single();

    if (!lead) {
      console.log("Meta Conversion: Lead not found, sending basic event");
    }

    return await sendMetaConversionEvent({
      event_name: "Purchase",
      fatura_id: faturaId,
      lead_id: clienteId,
      value: valor,
      currency: "BRL",
      customer_phone: lead?.telefone,
      customer_email: lead?.email || undefined,
      customer_name: lead?.nome,
      customer_gender: (lead as any)?.genero || undefined,
      customer_date_of_birth: (lead as any)?.data_nascimento || undefined,
      customer_city: (lead as any)?.cidade || undefined,
      customer_state: (lead as any)?.estado || undefined,
      customer_zip: (lead as any)?.cep || undefined,
      utm_source: lead?.utm_source || undefined,
      utm_campaign: lead?.utm_campaign || undefined,
      fbclid: lead?.fbclid || undefined,
      external_id: clienteId,
      data_fatura: dataFatura,
    });
  } catch (error) {
    console.error("Meta Conversion: Error in sendPurchaseConversion", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Fetches lead data and sends a CompleteRegistration conversion event
 * Used when an agendamento is confirmed (lead qualificado)
 */
export async function sendCompleteRegistrationConversion(
  agendamentoId: string,
  clienteId: string,
  dataAgendamento?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch lead data for customer info and attribution
    const { data: lead } = await supabase
      .from("leads")
      .select("nome, telefone, email, utm_source, utm_campaign, fbclid, genero, data_nascimento, cidade, estado, cep")
      .eq("id", clienteId)
      .single();

    if (!lead) {
      console.log("Meta Conversion: Lead not found for CompleteRegistration, sending basic event");
    }

    // Use agendamento date for event_time if available
    const eventData: ConversionEventData = {
      event_name: "CompleteRegistration",
      agendamento_id: agendamentoId,
      lead_id: clienteId,
      customer_phone: lead?.telefone,
      customer_email: lead?.email || undefined,
      customer_name: lead?.nome,
      customer_gender: (lead as any)?.genero || undefined,
      customer_date_of_birth: (lead as any)?.data_nascimento || undefined,
      customer_city: (lead as any)?.cidade || undefined,
      customer_state: (lead as any)?.estado || undefined,
      customer_zip: (lead as any)?.cep || undefined,
      utm_source: lead?.utm_source || undefined,
      utm_campaign: lead?.utm_campaign || undefined,
      fbclid: lead?.fbclid || undefined,
      external_id: clienteId,
    };

    // Pass the agendamento date as data_fatura (reusing the field for event_time)
    if (dataAgendamento) {
      eventData.data_fatura = dataAgendamento;
    }

    return await sendMetaConversionEvent(eventData);
  } catch (error) {
    console.error("Meta Conversion: Error in sendCompleteRegistrationConversion", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
