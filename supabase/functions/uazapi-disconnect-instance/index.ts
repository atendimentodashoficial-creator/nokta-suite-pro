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

    // Try multiple endpoint variations (different UAZAPI servers expose different disconnect routes/methods)
    // Based on similar APIs like Evolution API, CodeChat, 4Whats - they use DELETE, GET or POST
    const attempts: Array<{ url: string; method: string }> = [
      // DELETE methods (common in Evolution API style)
      { url: `${normalizedBaseUrl}/instance/logout`, method: "DELETE" },
      { url: `${normalizedBaseUrl}/instance/disconnect`, method: "DELETE" },
      // POST methods
      { url: `${normalizedBaseUrl}/instance/logout`, method: "POST" },
      { url: `${normalizedBaseUrl}/instance/disconnect`, method: "POST" },
      // GET methods (some APIs use GET for logout)
      { url: `${normalizedBaseUrl}/instance/logout`, method: "GET" },
      { url: `${normalizedBaseUrl}/instance/disconnect`, method: "GET" },
      // PUT methods (some panels use PUT)
      { url: `${normalizedBaseUrl}/instance/logout`, method: "PUT" },
    ];

    let lastStatus = 0;
    let lastBody = "";
    let successfulAttempt: { url: string; method: string } | null = null;

    for (const attempt of attempts) {
      try {
        console.log(`Trying disconnect: ${attempt.method} ${attempt.url}`);

        const resp = await fetch(attempt.url, {
          method: attempt.method,
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "token": api_key,
            // Some servers also accept Authorization header
            "Authorization": `Bearer ${api_key}`,
          },
        });

        lastStatus = resp.status;
        lastBody = await resp.text().catch(() => "");
        console.log(`Disconnect response - Status: ${resp.status}, Body: ${lastBody.substring(0, 200)}`);

        if (resp.ok || resp.status === 200 || resp.status === 204) {
          successfulAttempt = attempt;
          break;
        }

        // Parse body to check for success flags
        try {
          const jsonBody = JSON.parse(lastBody);
          // Some APIs return success in the body even with non-200 status
          if (jsonBody.success === true || jsonBody.status === 'logged_out' || jsonBody.message?.toLowerCase().includes('logout')) {
            successfulAttempt = attempt;
            break;
          }
        } catch {}

        // If method is not allowed or not found, try next option
        if (resp.status === 404 || resp.status === 405) {
          continue;
        }
      } catch (e: any) {
        console.log("Disconnect attempt failed:", e?.message || e);
      }
    }

    if (successfulAttempt) {
      console.log(`Successfully disconnected using ${successfulAttempt.method} ${successfulAttempt.url}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "WhatsApp desconectado com sucesso!",
          endpoint_used: successfulAttempt.url,
          method_used: successfulAttempt.method,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("All disconnect attempts failed", { lastStatus, lastBody });
    return new Response(
      JSON.stringify({
        success: false,
        error: "Erro ao desconectar do servidor UAZAPI",
        details: { lastStatus, lastBody },
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );

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
