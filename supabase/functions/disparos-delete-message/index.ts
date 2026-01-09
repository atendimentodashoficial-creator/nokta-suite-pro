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

    const { id, db_chat_id } = await req.json();

    if (!id) {
      throw new Error("Missing required field: id (message id)");
    }

    // Get the instance configuration from the chat
    let config = null;
    
    if (db_chat_id) {
      // Get the chat to find its instance
      const { data: chatData } = await supabase
        .from("disparos_chats")
        .select("instancia_id")
        .eq("id", db_chat_id)
        .single();

      if (chatData?.instancia_id) {
        const { data: instanceConfig } = await supabase
          .from("disparos_instancias")
          .select("*")
          .eq("id", chatData.instancia_id)
          .eq("is_active", true)
          .single();
        
        config = instanceConfig;
      }
    }

    // Fallback to any active instance for the user
    if (!config) {
      const { data: fallbackConfig, error: configError } = await supabase
        .from("disparos_instancias")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (configError || !fallbackConfig) {
        return new Response(
          JSON.stringify({ error: "Nenhuma instância de disparos configurada" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      config = fallbackConfig;
    }

    // Delete message via UAZapi
    const response = await fetch(`${config.base_url}/message/delete`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "token": config.api_key,
      },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`UAZapi delete error: ${response.status} ${response.statusText} - ${text}`);
      // Continue to delete from database even if UAZapi fails
    }

    // Update message in database as deleted instead of actually deleting
    const { error: updateError } = await supabase
      .from("disparos_messages")
      .update({ deleted: true, content: 'Mensagem apagada' })
      .eq("message_id", id);

    if (updateError) {
      console.error("Error updating message:", updateError);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in disparos-delete-message:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
