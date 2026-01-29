import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

  // Validate cron secret
  const cronHeader = req.headers.get("X-Cron-Secret") ?? "";
  if (!CRON_SECRET || cronHeader !== CRON_SECRET) {
    console.error("Invalid or missing cron secret");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("Missing backend env vars");
    return new Response(JSON.stringify({ error: "Missing backend env vars" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const now = new Date();
    console.log(`[CRON] Starting disparos cron at ${now.toISOString()}`);

    // === Run admin notifications cron (low balance alerts + scheduled reports) ===
    try {
      console.log("[CRON] Triggering admin-notifications-cron...");
      const adminNotifResponse = await fetch(`${SUPABASE_URL}/functions/v1/admin-notifications-cron`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cron-Secret": CRON_SECRET,
        },
      });
      const adminNotifResult = await adminNotifResponse.json();
      console.log("[CRON] Admin notifications result:", adminNotifResult);
    } catch (adminErr: any) {
      console.error("[CRON] Error calling admin-notifications-cron:", adminErr.message);
    }

    // === Run appointment reminders cron (avisos agendamento) ===
    try {
      console.log("[CRON] Triggering enviar-avisos-agendamento...");
      const avisosAgResponse = await fetch(`${SUPABASE_URL}/functions/v1/enviar-avisos-agendamento`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cron-Secret": CRON_SECRET,
        },
      });
      const avisosAgResult = await avisosAgResponse.json();
      console.log("[CRON] Avisos agendamento result:", avisosAgResult);
    } catch (avisosAgErr: any) {
      console.error("[CRON] Error calling enviar-avisos-agendamento:", avisosAgErr.message);
    }

    // === Run meeting reminders cron (avisos reuniao) ===
    try {
      console.log("[CRON] Triggering enviar-avisos-reuniao...");
      const avisosReResponse = await fetch(`${SUPABASE_URL}/functions/v1/enviar-avisos-reuniao`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cron-Secret": CRON_SECRET,
        },
      });
      const avisosReResult = await avisosReResponse.json();
      console.log("[CRON] Avisos reuniao result:", avisosReResult);
    } catch (avisosReErr: any) {
      console.error("[CRON] Error calling enviar-avisos-reuniao:", avisosReErr.message);
    }

    // Find all running campaigns that are ready to continue
    // Process ALL campaigns regardless of delay - cron is the primary scheduler
    const { data: campanhas, error: campanhasError } = await supabase
      .from("disparos_campanhas")
      .select("id, nome, user_id, next_send_at, status, delay_min")
      .eq("status", "running")
      .or(`next_send_at.is.null,next_send_at.lte.${now.toISOString()}`);

    if (campanhasError) {
      console.error("Error fetching campaigns:", campanhasError);
      throw campanhasError;
    }

    if (!campanhas || campanhas.length === 0) {
      console.log("[CRON] No running campaigns to process");
      return new Response(
        JSON.stringify({ success: true, message: "No campaigns to process", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[CRON] Found ${campanhas.length} campaigns to process`);

    const results: any[] = [];

    // Process each campaign by calling the control function
    for (const campanha of campanhas) {
      try {
        console.log(`[CRON] Processing campaign "${campanha.nome}" (${campanha.id}) for user ${campanha.user_id}`);

        // Call the control function with continue action
        const response = await fetch(`${SUPABASE_URL}/functions/v1/disparos-campanha-control`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            campanha_id: campanha.id,
            action: "continue",
          }),
        });

        const result = await response.json();
        console.log(`[CRON] Campaign "${campanha.nome}" result:`, result);

        results.push({
          campanha_id: campanha.id,
          nome: campanha.nome,
          success: result.success ?? false,
          message: result.message || result.error,
          skipped: result.skipped || false,
        });
      } catch (error: any) {
        console.error(`[CRON] Error processing campaign ${campanha.id}:`, error);
        results.push({
          campanha_id: campanha.id,
          nome: campanha.nome,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success && !r.skipped).length;
    const skippedCount = results.filter((r) => r.skipped).length;

    console.log(`[CRON] Finished. Processed: ${successCount}, Skipped: ${skippedCount}, Failed: ${results.length - successCount - skippedCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: successCount,
        skipped: skippedCount,
        total: campanhas.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[CRON] Error in disparos-cron:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
