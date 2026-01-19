import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hash function for user data (Meta requires SHA256 hashed data)
// Meta: Trim, lowercase, then hash
async function sha256Hash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  // Meta: lowercase and trim before hashing
  const normalized = data.toLowerCase().trim();
  const dataBuffer = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Normalize phone number according to Meta guidelines:
 * - Remove all symbols and letters
 * - Remove leading zeros
 * - Must include country code
 * - Format: digits only with country code (e.g., 16505551212 for US)
 */
function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, "");
  
  // Remove leading zeros
  cleaned = cleaned.replace(/^0+/, "");
  
  // If it's a Brazilian number without country code, add 55
  // Brazilian numbers: 10-11 digits (DDD + number)
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = "55" + cleaned;
  }
  
  return cleaned;
}

/**
 * Normalize email according to Meta guidelines:
 * - Trim leading and trailing spaces
 * - Convert to lowercase
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Normalize name (first or last) according to Meta guidelines:
 * - Lowercase only
 * - No punctuation
 * - Roman alphabet a-z recommended
 * - Special characters must be UTF-8 encoded
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Remove punctuation but keep letters (including accented)
    .replace(/[^\p{L}\s]/gu, "")
    .trim();
}

/**
 * Normalize city according to Meta guidelines:
 * - Lowercase only
 * - No punctuation
 * - No special characters
 * - No spaces
 */
function normalizeCity(city: string): string {
  return city
    .toLowerCase()
    .trim()
    // Remove all non-letter characters and spaces
    .replace(/[^a-z\u00C0-\u024F]/gi, "")
    .toLowerCase();
}

/**
 * Normalize state according to Meta guidelines:
 * - Use 2-character ANSI abbreviation code in lowercase
 * - For states outside US, lowercase with no punctuation/spaces
 */
function normalizeState(state: string): string {
  return state
    .toLowerCase()
    .trim()
    // Remove special characters and spaces
    .replace(/[^a-z]/gi, "")
    .toLowerCase();
}

/**
 * Normalize zip code according to Meta guidelines:
 * - Lowercase
 * - No spaces
 * - No dashes
 * - US: first 5 digits only
 * - Brazil (CEP): 8 digits
 */
function normalizeZip(zip: string): string {
  // Remove all non-alphanumeric characters
  const cleaned = zip.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return cleaned;
}

/**
 * Normalize date of birth according to Meta guidelines:
 * - Format: YYYYMMDD
 * - Year: 1900 to current year
 * - Month: 01 to 12
 * - Day: 01 to 31
 */
function normalizeDateOfBirth(dob: string): string | null {
  // Try to parse various date formats
  // Expected input: YYYY-MM-DD or DD/MM/YYYY or similar
  
  // Remove all non-digits first
  const digitsOnly = dob.replace(/\D/g, "");
  
  // If already in YYYYMMDD format (8 digits)
  if (digitsOnly.length === 8) {
    const year = parseInt(digitsOnly.substring(0, 4));
    if (year >= 1900 && year <= new Date().getFullYear()) {
      return digitsOnly;
    }
  }
  
  // Try YYYY-MM-DD format
  const isoMatch = dob.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}${isoMatch[2]}${isoMatch[3]}`;
  }
  
  // Try DD/MM/YYYY format
  const brMatch = dob.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    return `${brMatch[3]}${brMatch[2]}${brMatch[1]}`;
  }
  
  return null;
}

/**
 * Normalize gender according to Meta guidelines:
 * - Single character: 'm' for male, 'f' for female
 */
function normalizeGender(gender: string): string | null {
  const g = gender.toLowerCase().trim();
  
  if (g === "m" || g === "male" || g === "masculino" || g === "homem") {
    return "m";
  }
  if (g === "f" || g === "female" || g === "feminino" || g === "mulher") {
    return "f";
  }
  
  // If it's already just 'm' or 'f'
  if (g.length === 1 && (g === "m" || g === "f")) {
    return g;
  }
  
  return null;
}

/**
 * Normalize country according to Meta guidelines:
 * - Lowercase 2-letter ISO 3166-1 alpha-2 code
 */
function normalizeCountry(country: string): string {
  const c = country.toLowerCase().trim();
  
  // Common mappings
  const countryMap: Record<string, string> = {
    "brasil": "br",
    "brazil": "br",
    "united states": "us",
    "usa": "us",
    "portugal": "pt",
    "argentina": "ar",
  };
  
  // If it's already a 2-letter code
  if (c.length === 2) {
    return c;
  }
  
  return countryMap[c] || "br"; // Default to Brazil
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
      // Additional customer data for better matching
      customer_gender,
      customer_date_of_birth,
      customer_city,
      customer_state,
      customer_zip,
      customer_country,
      // Attribution parameters
      utm_source,
      utm_campaign,
      fbclid,
      fbp, // Browser ID from _fbp cookie
      external_id,
      // Client info (from browser if available)
      client_ip_address,
      client_user_agent,
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
    
    // Use data_fatura timestamp if provided, otherwise use current time
    const { data_fatura } = body;
    let eventTime: number;
    if (data_fatura) {
      // Parse the date string and convert to Unix timestamp (seconds)
      const faturaDate = new Date(data_fatura);
      eventTime = Math.floor(faturaDate.getTime() / 1000);
      console.log(`Using data_fatura for event_time: ${data_fatura} -> ${eventTime}`);
    } else {
      eventTime = Math.floor(Date.now() / 1000);
      console.log(`Using current time for event_time: ${eventTime}`);
    }

    // =====================================================
    // Build user_data following Meta's guidelines exactly
    // https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
    // =====================================================
    const userData: Record<string, unknown> = {};

    // Phone number (ph) - REQUIRED: digits only with country code, hashed
    // Meta: Remove symbols, letters, leading zeros. Include country code.
    if (customer_phone) {
      const normalizedPhone = normalizePhone(customer_phone);
      if (normalizedPhone) {
        userData.ph = [await sha256Hash(normalizedPhone)];
        console.log(`Phone normalized: ${customer_phone} -> ${normalizedPhone}`);
      }
    }

    // Email (em) - hashed, lowercase, trimmed
    if (customer_email) {
      const normalizedEmail = normalizeEmail(customer_email);
      userData.em = [await sha256Hash(normalizedEmail)];
      console.log(`Email normalized: ${customer_email} -> ${normalizedEmail}`);
    }

    // First name (fn) and Last name (ln) - hashed, lowercase, no punctuation
    if (customer_name) {
      const nameParts = customer_name.trim().split(/\s+/).filter((p: string) => p.length > 0);
      
      if (nameParts.length > 0) {
        // First name - first word
        const firstName = normalizeName(nameParts[0]);
        if (firstName) {
          userData.fn = await sha256Hash(firstName);
          console.log(`First name normalized: ${nameParts[0]} -> ${firstName}`);
        }
      }
      
      if (nameParts.length > 1) {
        // Last name - last word
        const lastName = normalizeName(nameParts[nameParts.length - 1]);
        if (lastName) {
          userData.ln = await sha256Hash(lastName);
          console.log(`Last name normalized: ${nameParts[nameParts.length - 1]} -> ${lastName}`);
        }
      }
    }

    // Gender (ge) - hashed, single char: 'm' or 'f'
    if (customer_gender) {
      const normalizedGender = normalizeGender(customer_gender);
      if (normalizedGender) {
        userData.ge = await sha256Hash(normalizedGender);
        console.log(`Gender normalized: ${customer_gender} -> ${normalizedGender}`);
      }
    }

    // Date of birth (db) - hashed, format YYYYMMDD
    if (customer_date_of_birth) {
      const normalizedDob = normalizeDateOfBirth(customer_date_of_birth);
      if (normalizedDob) {
        userData.db = await sha256Hash(normalizedDob);
        console.log(`DOB normalized: ${customer_date_of_birth} -> ${normalizedDob}`);
      }
    }

    // City (ct) - hashed, lowercase, no spaces/punctuation
    if (customer_city) {
      const normalizedCity = normalizeCity(customer_city);
      if (normalizedCity) {
        userData.ct = await sha256Hash(normalizedCity);
        console.log(`City normalized: ${customer_city} -> ${normalizedCity}`);
      }
    }

    // State (st) - hashed, 2-char ANSI code in lowercase
    if (customer_state) {
      const normalizedState = normalizeState(customer_state);
      if (normalizedState) {
        userData.st = await sha256Hash(normalizedState);
        console.log(`State normalized: ${customer_state} -> ${normalizedState}`);
      }
    }

    // Zip/Postal Code (zp) - hashed, lowercase, no spaces/dashes
    if (customer_zip) {
      const normalizedZip = normalizeZip(customer_zip);
      if (normalizedZip) {
        userData.zp = await sha256Hash(normalizedZip);
        console.log(`Zip normalized: ${customer_zip} -> ${normalizedZip}`);
      }
    }

    // Country (country) - ALWAYS include, hashed, 2-letter ISO code
    // Meta: "Always include your customers' countries even if all from the same country"
    const normalizedCountry = normalizeCountry(customer_country || "br");
    userData.country = await sha256Hash(normalizedCountry);

    // External ID (external_id) - hashed, unique advertiser ID
    if (external_id) {
      userData.external_id = [await sha256Hash(external_id)];
    } else if (lead_id) {
      // Fallback to lead_id as external identifier
      userData.external_id = [await sha256Hash(lead_id)];
    }

    // Facebook Click ID (fbc) - NOT hashed
    // Format: fb.${subdomain_index}.${creation_time}.${fbclid}
    if (fbclid) {
      // Generate proper fbc format if we only have fbclid
      userData.fbc = `fb.1.${eventTime * 1000}.${fbclid}`;
    }

    // Facebook Browser ID (fbp) - NOT hashed
    // Format: fb.${subdomain_index}.${creation_time}.${random_number}
    if (fbp) {
      userData.fbp = fbp;
    }

    // Client IP Address - NOT hashed, improves matching
    if (client_ip_address) {
      userData.client_ip_address = client_ip_address;
    }

    // Client User Agent - NOT hashed, improves matching
    if (client_user_agent) {
      userData.client_user_agent = client_user_agent;
    }

    // =====================================================
    // Build the event payload
    // =====================================================
    const eventData: Record<string, unknown> = {
      event_name,
      event_time: eventTime,
      event_id: eventId,
      action_source: "business_messaging", // Events from CRM/business interactions
      user_data: userData,
    };

    // Build custom_data
    let customData: Record<string, unknown> = {};
    
    // For Purchase events, currency and value are REQUIRED by Meta
    if (event_name === "Purchase") {
      const purchaseValue = value !== undefined && value !== null ? parseFloat(value) : 0;
      customData = {
        value: purchaseValue,
        currency: currency || "BRL",
        content_type: "product",
        contents: [{ 
          id: fatura_id || lead_id || "product", 
          quantity: 1, 
          item_price: purchaseValue 
        }],
      };
    } else if (value !== undefined && value !== null) {
      // For other events, only add value if provided
      customData = {
        value: parseFloat(value),
        currency: currency || "BRL",
      };
    }

    // Add campaign attribution to custom_data
    if (utm_campaign) {
      customData.campaign_name = utm_campaign;
    }
    if (utm_source) {
      customData.content_category = utm_source;
    }

    // Only add custom_data if there's data
    if (Object.keys(customData).length > 0) {
      eventData.custom_data = customData;
    }

    // =====================================================
    // Send to Meta Conversions API
    // =====================================================
    const apiVersion = "v18.0";
    const url = `https://graph.facebook.com/${apiVersion}/${pixelConfig.pixel_id}/events`;

    const requestBody: Record<string, unknown> = {
      data: [eventData],
      access_token: pixelConfig.access_token,
    };

    // Add test event code if configured (for testing in Events Manager)
    if (pixelConfig.test_event_code) {
      requestBody.test_event_code = pixelConfig.test_event_code;
    }

    console.log("=== META CONVERSIONS API REQUEST ===");
    console.log("URL:", url);
    console.log("Event data:", JSON.stringify(eventData, null, 2));

    // Send to Meta
    const metaResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const metaResult = await metaResponse.json();
    console.log("=== META CONVERSIONS API RESPONSE ===");
    console.log("Status:", metaResponse.status);
    console.log("Response:", JSON.stringify(metaResult, null, 2));

    // Build customer data summary for logging (what was actually sent)
    const customerDataSent = {
      phone: !!customer_phone,
      email: !!customer_email,
      name: !!customer_name,
      gender: !!customer_gender,
      date_of_birth: !!customer_date_of_birth,
      city: !!customer_city,
      state: !!customer_state,
      zip: !!customer_zip,
      country: true, // Always sent
      external_id: !!(external_id || lead_id),
      fbclid: !!fbclid,
      fbp: !!fbp,
      client_ip_address: !!client_ip_address,
      client_user_agent: !!client_user_agent,
      // Store normalized values (not hashed) for debugging
      normalized_values: {
        phone: customer_phone ? normalizePhone(customer_phone) : null,
        email: customer_email ? normalizeEmail(customer_email) : null,
        first_name: customer_name ? normalizeName(customer_name.split(" ")[0]) : null,
        last_name: customer_name && customer_name.includes(" ") 
          ? normalizeName(customer_name.split(" ").pop()!) 
          : null,
        gender: customer_gender ? normalizeGender(customer_gender) : null,
        date_of_birth: customer_date_of_birth ? normalizeDateOfBirth(customer_date_of_birth) : null,
        city: customer_city ? normalizeCity(customer_city) : null,
        state: customer_state ? normalizeState(customer_state) : null,
        zip: customer_zip ? normalizeZip(customer_zip) : null,
        country: normalizedCountry,
      }
    };

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
        customer_data_sent: customerDataSent,
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
      // Include matching quality info if available
      fbtrace_id: metaResult.fbtrace_id,
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
