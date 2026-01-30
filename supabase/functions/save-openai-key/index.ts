import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// In-memory storage for user-provided API keys (per-session override)
const userApiKeys = new Map<string, string>();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, api_key } = await req.json();

    // Helper function to get the effective API key (user override or env)
    const getEffectiveApiKey = (): string | undefined => {
      // First check if user has a saved key in database
      // Then fall back to environment variable
      return userApiKeys.get(user.id) || Deno.env.get("OPENAI_API_KEY");
    };

    if (action === "test") {
      // Test the OpenAI connection with the current stored key
      const openaiKey = getEffectiveApiKey();
      
      if (!openaiKey) {
        return new Response(
          JSON.stringify({ success: false, error: "API Key da OpenAI não configurada" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const response = await fetch("https://api.openai.com/v1/models", {
          headers: {
            Authorization: `Bearer ${openaiKey}`,
          },
        });

        if (response.ok) {
          return new Response(
            JSON.stringify({ success: true, message: "Conexão com OpenAI funcionando!" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          const error = await response.json();
          return new Response(
            JSON.stringify({ success: false, error: error.error?.message || "Erro ao validar API Key" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: "Erro ao conectar com OpenAI" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "check") {
      // Check if OpenAI key is configured (either in memory or env)
      const openaiKey = getEffectiveApiKey();
      return new Response(
        JSON.stringify({ configured: !!openaiKey && openaiKey.length > 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_key") {
      // Return the currently active API key for use in other functions
      const openaiKey = getEffectiveApiKey();
      if (!openaiKey) {
        return new Response(
          JSON.stringify({ error: "API Key não configurada" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ api_key: openaiKey }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "save" && api_key) {
      // First validate the new API key
      try {
        const response = await fetch("https://api.openai.com/v1/models", {
          headers: {
            Authorization: `Bearer ${api_key}`,
          },
        });

        if (!response.ok) {
          const error = await response.json();
          return new Response(
            JSON.stringify({ success: false, error: error.error?.message || "API Key inválida" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Store the valid API key in memory for this user
        // This allows immediate use without waiting for secret update
        userApiKeys.set(user.id, api_key);

        // Also save to a database table for persistence across function restarts
        const now = new Date().toISOString();
        const { error: dbError } = await supabase
          .from("openai_config")
          .upsert({
            user_id: user.id,
            api_key: api_key,
            created_at: now,
            updated_at: now,
          }, {
            onConflict: "user_id",
            ignoreDuplicates: false,
          });

        if (dbError) {
          console.error("Error saving to database:", dbError);
          // Even if DB save fails, the in-memory key works for this session
        } else {
          console.log("API key saved successfully to database for user:", user.id);
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "API Key salva com sucesso! A chave está ativa e funcionando." 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: "Erro ao validar API Key" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "clear_info") {
      // Remove from memory and inform about clearing
      userApiKeys.delete(user.id);
      
      // Remove from database
      await supabase
        .from("openai_config")
        .delete()
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Chave OpenAI removida com sucesso." 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "validate" && api_key) {
      // Validate a new API key before saving
      try {
        const response = await fetch("https://api.openai.com/v1/models", {
          headers: {
            Authorization: `Bearer ${api_key}`,
          },
        });

        if (response.ok) {
          return new Response(
            JSON.stringify({ valid: true, message: "API Key válida!" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          const error = await response.json();
          return new Response(
            JSON.stringify({ valid: false, error: error.error?.message || "API Key inválida" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (error) {
        return new Response(
          JSON.stringify({ valid: false, error: "Erro ao validar API Key" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
