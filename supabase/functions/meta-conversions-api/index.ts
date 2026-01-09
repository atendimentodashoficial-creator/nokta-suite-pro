import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hash function for user data (Meta requires SHA256 hashed data)
async function sha256Hash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Normalize phone for Meta (E.164 format without +)
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  // If it doesn't start with country code, assume Brazil (55)
  if (cleaned.length === 10 || cleaned.length === 11) {
    return "55" + cleaned;
  }
  return cleaned;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      event_name,
      lead_id,
      fatura_id,
      agendamento_id,
      value,
      currency = "BRL",
      customer_phone,
      customer_email,
      customer_name,
      utm_source,
      utm_campaign,
      fbclid,
      external_id,
    } = body;

    // Get user's pixel config
    const { data: pixelConfig, error: configError } = await supabase
      .from("meta_pixel_config")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (configError || !pixelConfig) {
      return new Response(JSON.stringify({ error: "Pixel not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate unique event ID for deduplication
    const eventId = crypto.randomUUID();
    const eventTime = Math.floor(Date.now() / 1000);

    // Build user data with hashed values (all available fields from Meta's list)
    const userData: Record<string, unknown> = {};

    // Phone number (ph) - required format: digits only with country code
    if (customer_phone) {
      const normalizedPhone = normalizePhone(customer_phone);
      userData.ph = [await sha256Hash(normalizedPhone)];
    }

    // Email (em)
    if (customer_email) {
      userData.em = [await sha256Hash(customer_email.toLowerCase().trim())];
    }

    // First name (fn) and Last name (ln)
    if (customer_name) {
      const nameParts = customer_name.trim().split(" ").filter((p: string) => p.length > 0);
      if (nameParts.length > 0) {
        // First name - first word
        userData.fn = await sha256Hash(nameParts[0].toLowerCase());
      }
      if (nameParts.length > 1) {
        // Last name - last word
        userData.ln = await sha256Hash(nameParts[nameParts.length - 1].toLowerCase());
      }
    }

    // Country (country) - always Brazil for this system
    userData.country = await sha256Hash("br");

    // External ID (external_id) - use lead_id or customer_id for matching
    if (external_id) {
      userData.external_id = [await sha256Hash(external_id)];
    } else if (lead_id) {
      // Fallback to lead_id as external identifier
      userData.external_id = [await sha256Hash(lead_id)];
    }

    // Facebook Click ID (fbc) - for attribution
    if (fbclid) {
      userData.fbc = `fb.1.${eventTime}.${fbclid}`;
    }

    // Client IP address and User Agent would be added if we had them
    // These improve match quality but we don't have access to them in server-side calls

    // Build the event payload
    const eventData: Record<string, unknown> = {
      event_name,
      event_time: eventTime,
      event_id: eventId,
      action_source: "system_generated", // Using system_generated since events come from CRM
      user_data: userData,
    };

    // Add custom data if value is provided
    let customData: Record<string, unknown> = {};
    
    if (value !== undefined && value !== null) {
      customData = {
        value: parseFloat(value),
        currency,
      };

      // Add content info for Purchase events
      if (event_name === "Purchase") {
        customData = {
          ...customData,
          content_type: "product",
          contents: [{ id: fatura_id || lead_id || "product", quantity: 1, item_price: parseFloat(value) }],
        };
      }
    }

    // Add campaign attribution
    if (utm_campaign) {
      customData.campaign_name = utm_campaign;
    }

    // Only add custom_data if there's data
    if (Object.keys(customData).length > 0) {
      eventData.custom_data = customData;
    }

    // Build request to Meta Conversions API
    const apiVersion = "v18.0";
    const url = `https://graph.facebook.com/${apiVersion}/${pixelConfig.pixel_id}/events`;

    const requestBody: Record<string, unknown> = {
      data: [eventData],
      access_token: pixelConfig.access_token,
    };

    // Add test event code if configured (for testing)
    if (pixelConfig.test_event_code) {
      requestBody.test_event_code = pixelConfig.test_event_code;
    }

    console.log("Sending event to Meta:", JSON.stringify(requestBody, null, 2));

    // Send to Meta
    const metaResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const metaResult = await metaResponse.json();
    console.log("Meta response:", JSON.stringify(metaResult, null, 2));

    // Log the event in our database
    const { error: logError } = await supabase
      .from("meta_conversion_events")
      .insert({
        user_id: user.id,
        lead_id,
        fatura_id,
        agendamento_id,
        event_name,
        event_id: eventId,
        event_time: new Date().toISOString(),
        value,
        currency,
        utm_source,
        utm_campaign,
        fbclid,
        status: metaResponse.ok ? "sent" : "error",
        response: metaResult,
      });

    if (logError) {
      console.error("Error logging event:", logError);
    }

    if (!metaResponse.ok) {
      return new Response(JSON.stringify({ 
        error: "Failed to send event to Meta",
        details: metaResult 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      event_id: eventId,
      events_received: metaResult.events_received,
      messages: metaResult.messages,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
