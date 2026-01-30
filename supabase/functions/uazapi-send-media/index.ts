import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawAuth = req.headers.get("Authorization") ?? req.headers.get("authorization");
    
    if (!rawAuth || !rawAuth.startsWith("Bearer ")) {
      throw new Error("Missing authorization header");
    }

    const jwt = rawAuth.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { number, type, file, chatDbId, caption } = await req.json();

    if (!number || !type || !file) {
      throw new Error("Missing required fields: number, type, file");
    }

    // Validate type
    if (!['image', 'ptt', 'video', 'document'].includes(type)) {
      throw new Error("Invalid type. Must be: image, ptt, video, or document");
    }

    // Get user's UAZapi configuration
    const { data: config, error: configError } = await supabase
      .from("uazapi_config")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ error: "UAZapi não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send media via UAZapi
    const payload: any = { number, type, file };
    if (caption) payload.caption = caption;

    const response = await fetch(`${config.base_url}/send/media`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "token": config.api_key,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`UAZapi error: ${response.status} ${response.statusText} - ${text}`);
    }

    const result = await response.json();

    // Log message to database + update chat preview if chatDbId is provided
    if (chatDbId) {
      const nowIso = new Date().toISOString();

      // Normalize provider message id to a stable form (strip optional "owner:" prefix)
      const normalizeProviderMessageId = (raw: unknown): string => {
        const s = String(raw ?? "").trim();
        if (!s) return "";
        const parts = s.split(":").filter(Boolean);
        return (parts.length > 1 ? parts[parts.length - 1] : s).trim();
      };

      const rawMessageId = result.id || result.messageId;
      const messageId = normalizeProviderMessageId(rawMessageId) || `media_${Date.now()}`;
      const preview =
        caption ||
        `[${type === 'ptt' ? 'Áudio' : type === 'image' ? 'Imagem' : type === 'video' ? 'Vídeo' : 'Documento'}]`;

      await supabase.from("whatsapp_messages").insert({
        chat_id: chatDbId,
        message_id: messageId,
        content: preview,
        sender_type: "agent",
        timestamp: nowIso,
        media_type: type === 'ptt' ? 'audio' : type,
        media_url: file,
        status: "sent",
        admin_id: user.id,
      });

      // Update chat list preview immediately
      const { error: chatUpdateError } = await supabase
        .from('whatsapp_chats')
        .update({
          last_message: preview,
          last_message_time: nowIso,
          updated_at: nowIso,
        })
        .eq('id', chatDbId);

      if (chatUpdateError) {
        console.error('Error updating chat preview:', chatUpdateError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in uazapi-send-media:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
