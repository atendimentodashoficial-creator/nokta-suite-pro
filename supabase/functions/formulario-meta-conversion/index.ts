import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hash function for user data (Meta requires SHA256 hashed data)
async function sha256Hash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const normalized = data.toLowerCase().trim();
  const dataBuffer = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Normalize phone number according to Meta guidelines
 */
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  cleaned = cleaned.replace(/^0+/, "");
  
  // Brazilian numbers without country code
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = "55" + cleaned;
  }
  
  return cleaned;
}

/**
 * Normalize email according to Meta guidelines
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Normalize name according to Meta guidelines
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\s]/gu, "")
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const {
      // Required fields
      event_id,       // Must match Pixel event_id for deduplication
      event_time,     // Timestamp in seconds
      event_source_url,
      
      // User data
      email,
      phone,
      external_id,    // Lead ID
      client_ip_address,
      client_user_agent,
      fbp,            // _fbp cookie value
      fbc,            // _fbc cookie value or fbclid
      fbclid,
      
      // Customer info (optional)
      customer_name,
      
      // Event parameters
      content_name,   // Offer name (form/template name)
      content_type,   // Always "lead_form"
      lead_type,      // Optional
      value,          // Optional
      currency,       // BRL
      
      // Form config (to get pixel settings)
      template_id,
      user_id,
    } = body;

    // Validate required fields
    if (!event_id || !event_time || !template_id || !user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: event_id, event_time, template_id, user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get form config with Meta Pixel settings
    const { data: formConfig, error: configError } = await supabase
      .from("formularios_config")
      .select("meta_pixel_id, meta_access_token, meta_pixel_enabled, meta_test_event_code")
      .eq("user_id", user_id)
      .maybeSingle();

    if (configError) {
      console.error("Error fetching form config:", configError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch form config" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!formConfig || !formConfig.meta_pixel_enabled || !formConfig.meta_pixel_id || !formConfig.meta_access_token) {
      console.log("Meta Pixel not configured or disabled for user:", user_id);
      return new Response(
        JSON.stringify({ success: false, reason: "Meta Pixel not configured or disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build user_data following Meta's guidelines
    const userData: Record<string, unknown> = {};

    // Email (em) - hashed
    if (email) {
      const normalizedEmail = normalizeEmail(email);
      userData.em = [await sha256Hash(normalizedEmail)];
      console.log(`Email normalized: ${email} -> ${normalizedEmail}`);
    }

    // Phone (ph) - hashed
    if (phone) {
      const normalizedPhone = normalizePhone(phone);
      if (normalizedPhone) {
        userData.ph = [await sha256Hash(normalizedPhone)];
        console.log(`Phone normalized: ${phone} -> ${normalizedPhone}`);
      }
    }

    // First name (fn) and Last name (ln) - hashed
    if (customer_name) {
      const nameParts = customer_name.trim().split(/\s+/).filter((p: string) => p.length > 0);
      
      if (nameParts.length > 0) {
        const firstName = normalizeName(nameParts[0]);
        if (firstName) {
          userData.fn = await sha256Hash(firstName);
        }
      }
      
      if (nameParts.length > 1) {
        const lastName = normalizeName(nameParts[nameParts.length - 1]);
        if (lastName) {
          userData.ln = await sha256Hash(lastName);
        }
      }
    }

    // External ID - hashed
    if (external_id) {
      userData.external_id = [await sha256Hash(external_id)];
    }

    // Client IP Address - NOT hashed
    if (client_ip_address) {
      userData.client_ip_address = client_ip_address;
    }

    // Client User Agent - NOT hashed
    if (client_user_agent) {
      userData.client_user_agent = client_user_agent;
    }

    // Facebook Browser ID (fbp) - NOT hashed
    if (fbp) {
      userData.fbp = fbp;
    }

    // Facebook Click ID (fbc) - NOT hashed
    // Format: fb.${subdomain_index}.${creation_time}.${fbclid}
    if (fbc) {
      userData.fbc = fbc;
    } else if (fbclid) {
      // Generate fbc from fbclid if not provided
      userData.fbc = `fb.1.${event_time * 1000}.${fbclid}`;
    }

    // Build custom_data (event_parameters)
    const customData: Record<string, unknown> = {
      content_type: content_type || "lead_form",
    };

    if (content_name) {
      customData.content_name = content_name;
    }

    if (lead_type) {
      customData.lead_type = lead_type;
    }

    if (value !== undefined && value !== null) {
      customData.value = parseFloat(value);
      customData.currency = currency || "BRL";
    }

    // Build the event payload
    const eventData: Record<string, unknown> = {
      event_name: "Lead",
      event_time: event_time,
      event_id: event_id,  // Same as Pixel for deduplication
      action_source: "website",
      event_source_url: event_source_url,
      user_data: userData,
      custom_data: customData,
    };

    // Send to Meta Conversions API
    const apiVersion = "v18.0";
    const url = `https://graph.facebook.com/${apiVersion}/${formConfig.meta_pixel_id}/events`;

    const requestBody: Record<string, unknown> = {
      data: [eventData],
      access_token: formConfig.meta_access_token,
    };

    // Add test event code if configured
    if (formConfig.meta_test_event_code) {
      requestBody.test_event_code = formConfig.meta_test_event_code;
    }

    console.log("=== FORMULARIO META CONVERSIONS API REQUEST ===");
    console.log("URL:", url);
    console.log("Event data:", JSON.stringify(eventData, null, 2));

    const metaResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const metaResult = await metaResponse.json();
    console.log("=== META CONVERSIONS API RESPONSE ===");
    console.log("Status:", metaResponse.status);
    console.log("Response:", JSON.stringify(metaResult, null, 2));

    if (!metaResponse.ok) {
      console.error("Meta API error:", metaResult);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: metaResult.error?.message || "Meta API error",
          details: metaResult
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        event_id: event_id,
        events_received: metaResult.events_received,
        fbtrace_id: metaResult.fbtrace_id
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in formulario-meta-conversion:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
