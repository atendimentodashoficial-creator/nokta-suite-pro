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
    console.log("=== Starting uazapi-disconnect-instance ===");

    const rawAuth = req.headers.get("Authorization") ?? req.headers.get("authorization");

    if (!rawAuth || !rawAuth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = rawAuth.replace("Bearer ", "");

    // Initialize Supabase client with service role to verify user
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Token inválido." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { base_url, api_key } = body;

    if (!base_url || !api_key) {
      return new Response(JSON.stringify({ success: false, error: "base_url e api_key são obrigatórios." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Disconnecting instance at:", base_url);

    // Normalize base URL
    const normalizedBaseUrl = base_url.replace(/\/+$/, '');

    // Call the logout endpoint
    const response = await fetch(`${normalizedBaseUrl}/instance/logout`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "token": api_key,
      },
    });

    console.log("Logout response status:", response.status);

    if (response.ok || response.status === 200) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "WhatsApp desconectado com sucesso!"
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      const errorText = await response.text().catch(() => "");
      console.log("Logout error:", errorText);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Erro ao desconectar do servidor UAZAPI"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (error: any) {
    console.error("Error in uazapi-disconnect-instance:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || "Erro desconhecido ao desconectar"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
