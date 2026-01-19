/**
 * Meta Pixel and Conversion API integration for forms
 * Ensures deduplication by using the same event_id for both Pixel and API
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export interface MetaFormEventData {
  // User data
  email?: string | null;
  phone?: string | null;
  customerName?: string | null;
  externalId?: string | null; // Lead ID
  
  // Event parameters
  contentName: string; // Form/template name
  contentType?: string; // Default: lead_form
  leadType?: string;
  value?: number;
  currency?: string; // Default: BRL
  
  // Form config
  templateId: string;
  userId: string;
}

/**
 * Get fbp cookie value (_fbp)
 */
function getFbp(): string | null {
  const match = document.cookie.match(/_fbp=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Get fbc cookie value (_fbc) or construct from fbclid
 */
function getFbc(): string | null {
  // Try to get from cookie first
  const match = document.cookie.match(/_fbc=([^;]+)/);
  if (match) return match[1];
  
  // Try to construct from fbclid in URL
  const urlParams = new URLSearchParams(window.location.search);
  const fbclid = urlParams.get("fbclid");
  if (fbclid) {
    return `fb.1.${Date.now()}.${fbclid}`;
  }
  
  return null;
}

/**
 * Get fbclid from URL
 */
function getFbclid(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("fbclid");
}

/**
 * Fires Meta Pixel event and sends to Conversion API with the same event_id
 * for proper deduplication
 */
export async function sendMetaFormLeadEvent(
  data: MetaFormEventData,
  pixelId: string | null,
  pixelEnabled: boolean
): Promise<{ success: boolean; eventId: string; error?: string }> {
  // Generate unique event_id for deduplication
  const eventId = crypto.randomUUID();
  const eventTime = Math.floor(Date.now() / 1000);
  const eventSourceUrl = window.location.href;
  
  // Get browser data
  const fbp = getFbp();
  const fbc = getFbc();
  const fbclid = getFbclid();
  const clientUserAgent = navigator.userAgent;
  
  console.log("=== META FORM LEAD EVENT ===");
  console.log("Event ID:", eventId);
  console.log("Pixel ID:", pixelId);
  console.log("Pixel Enabled:", pixelEnabled);
  console.log("fbp:", fbp);
  console.log("fbc:", fbc);
  
  // 1. Fire Meta Pixel event (client-side)
  if (pixelEnabled && pixelId && typeof window.fbq === "function") {
    try {
      // Standard Lead event with eventID for deduplication
      window.fbq("track", "Lead", {
        content_name: data.contentName,
        content_type: data.contentType || "lead_form",
        lead_type: data.leadType,
        value: data.value,
        currency: data.currency || "BRL",
      }, {
        eventID: eventId,
      });
      console.log("Meta Pixel Lead event fired with eventID:", eventId);
    } catch (pixelError) {
      console.error("Error firing Meta Pixel event:", pixelError);
    }
  } else {
    console.log("Meta Pixel not available or disabled");
  }
  
  // 2. Send to Conversion API (server-side) via edge function
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/formulario-meta-conversion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        event_id: eventId,
        event_time: eventTime,
        event_source_url: eventSourceUrl,
        
        email: data.email,
        phone: data.phone,
        customer_name: data.customerName,
        external_id: data.externalId,
        client_user_agent: clientUserAgent,
        // Note: client_ip_address will be captured by the edge function from request headers
        
        fbp,
        fbc,
        fbclid,
        
        content_name: data.contentName,
        content_type: data.contentType || "lead_form",
        lead_type: data.leadType,
        value: data.value,
        currency: data.currency || "BRL",
        
        template_id: data.templateId,
        user_id: data.userId,
      }),
    });
    
    const result = await response.json();
    console.log("Conversion API response:", result);
    
    if (result.success) {
      return { success: true, eventId };
    } else {
      return { success: false, eventId, error: result.error || result.reason };
    }
  } catch (error) {
    console.error("Error sending to Conversion API:", error);
    return { 
      success: false, 
      eventId, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

/**
 * Initialize Meta Pixel on page load
 */
export function initMetaPixel(pixelId: string): void {
  if (!pixelId) return;
  
  // Check if already initialized
  if (typeof window.fbq === "function") {
    console.log("Meta Pixel already initialized");
    return;
  }
  
  // Initialize Meta Pixel
  const script = document.createElement("script");
  script.innerHTML = `
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${pixelId}');
    fbq('track', 'PageView');
  `;
  document.head.appendChild(script);
  console.log("Meta Pixel initialized with ID:", pixelId);
}
