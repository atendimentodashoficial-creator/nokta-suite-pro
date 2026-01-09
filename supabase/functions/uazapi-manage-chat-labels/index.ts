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

    const { number, labelids } = await req.json();

    if (!number || !Array.isArray(labelids)) {
      throw new Error("Invalid request: number and labelids array required");
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

    // Send label update to UAZapi
    const response = await fetch(`${config.base_url}/chat/labels`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "token": config.api_key,
      },
      body: JSON.stringify({ number, labelids }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`UAZapi error: ${response.status} ${response.statusText} - ${text}`);
    }

    // Update labels in database
    const normalizePhone = (phone: string) => phone.replace(/[^\d]/g, "");
    const normalized = normalizePhone(number);

    // Find chat in database
    const { data: chat, error: chatError } = await supabase
      .from("whatsapp_chats")
      .select("id")
      .eq("normalized_number", normalized)
      .eq("user_id", user.id)
      .single();

    if (chat && !chatError) {
      // Remove existing labels for this chat
      await supabase
        .from("whatsapp_chat_labels")
        .delete()
        .eq("chat_id", chat.id);

      // Add new labels
      if (labelids.length > 0) {
        const labelsToInsert = labelids.map((labelId: string) => ({
          chat_id: chat.id,
          label_id: labelId,
          user_id: user.id,
        }));

        await supabase
          .from("whatsapp_chat_labels")
          .insert(labelsToInsert);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in uazapi-manage-chat-labels:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
