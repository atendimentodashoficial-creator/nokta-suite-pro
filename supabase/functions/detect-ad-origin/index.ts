import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AD_KEYWORDS = [
  "vi seu anúncio",
  "vi o anúncio",
  "vi no instagram",
  "vi no facebook",
  "vi na propaganda",
  "vi a propaganda",
  "vi pelo instagram",
  "vi pelo facebook",
  "vi uma publicação",
  "vi um post",
  "vi o post",
  "vi sua publicação",
  "vim pelo anúncio",
  "vim do anúncio",
  "vim pelo instagram",
  "vim do instagram",
  "vim pelo facebook",
  "vim do facebook",
  "através do anúncio",
  "através do instagram",
  "através do facebook",
  "pelo anúncio",
  "do anúncio",
  "propaganda",
  "publicidade",
  "patrocinado",
];

// Simple keyword detection (fast, no AI cost)
function detectAdMentionSimple(text: string): boolean {
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const textWithAccents = text.toLowerCase();
  
  for (const keyword of AD_KEYWORDS) {
    const normalizedKeyword = keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes(normalizedKeyword) || textWithAccents.includes(keyword)) {
      return true;
    }
  }
  return false;
}

// AI-powered detection for edge cases (uses Lovable AI)
async function detectAdMentionAI(text: string): Promise<{ isFromAd: boolean; confidence: number; source: string | null }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.log("LOVABLE_API_KEY not configured, skipping AI detection");
    return { isFromAd: false, confidence: 0, source: null };
  }

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Você é um detector de origem de leads. Analise a mensagem e determine se o cliente indica que veio de um anúncio, propaganda ou publicação nas redes sociais (Instagram, Facebook, Meta Ads).

Responda APENAS com JSON no formato:
{"isFromAd": true/false, "confidence": 0.0-1.0, "source": "instagram"|"facebook"|"meta"|null}

Exemplos de mensagens de anúncio:
- "Olá! Vi seu anúncio e gostaria de mais informações" → {"isFromAd": true, "confidence": 0.95, "source": "meta"}
- "Vi no Instagram sobre limpeza de pele" → {"isFromAd": true, "confidence": 0.9, "source": "instagram"}
- "Boa tarde, quero agendar" → {"isFromAd": false, "confidence": 0.9, "source": null}`,
          },
          {
            role: "user",
            content: text,
          },
        ],
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      console.error("AI detection failed:", response.status);
      return { isFromAd: false, confidence: 0, source: null };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Parse JSON response
    const jsonMatch = content.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        isFromAd: parsed.isFromAd === true,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
        source: parsed.source || null,
      };
    }

    return { isFromAd: false, confidence: 0, source: null };
  } catch (error) {
    console.error("AI detection error:", error);
    return { isFromAd: false, confidence: 0, source: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { message_text, lead_id, use_ai = false } = await req.json();

    if (!message_text) {
      return new Response(JSON.stringify({ error: "message_text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // First try simple keyword detection (fast and free)
    const simpleDetection = detectAdMentionSimple(message_text);
    
    let result = {
      isFromAd: simpleDetection,
      confidence: simpleDetection ? 0.85 : 0,
      source: simpleDetection ? "meta" : null,
      method: "keyword",
    };

    // If no simple match and AI is enabled, try AI detection
    if (!simpleDetection && use_ai) {
      const aiResult = await detectAdMentionAI(message_text);
      if (aiResult.isFromAd && aiResult.confidence > 0.7) {
        result = {
          isFromAd: true,
          confidence: aiResult.confidence,
          source: aiResult.source,
          method: "ai",
        };
      }
    }

    // If detection is positive and lead_id provided, update the lead
    if (result.isFromAd && lead_id) {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      
      // Update lead with inferred ad attribution
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          utm_source: result.source || "facebook",
          utm_medium: "cpc",
          utm_campaign: "Detectado por I.A",
          observacoes: `[Auto-detectado: Lead mencionou anúncio na primeira mensagem]`,
        })
        .eq("id", lead_id)
        .is("utm_source", null); // Only update if not already set

      if (updateError) {
        console.error("Error updating lead:", updateError);
      } else {
        console.log(`Lead ${lead_id} updated with inferred ad attribution`);
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in detect-ad-origin:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
