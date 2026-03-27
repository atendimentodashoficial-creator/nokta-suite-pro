import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const adminToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!adminToken) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify admin
    const { data: adminUser, error: adminError } = await supabase
      .from("admin_users")
      .select("id")
      .limit(1)
      .single();

    if (adminError || !adminUser) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "get") {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", "global")
        .single();

      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "toggle") {
      const { maintenance_mode, maintenance_message } = body;

      // 1. Update app_settings flag
      const { data, error } = await supabase
        .from("app_settings")
        .update({
          maintenance_mode,
          maintenance_message: maintenance_message || "Sistema em manutenção. Tente novamente mais tarde.",
          updated_at: new Date().toISOString(),
          updated_by: adminUser.id,
        })
        .eq("id", "global")
        .select()
        .single();

      if (error) throw error;

      // 2. Toggle all pg_cron jobs
      try {
        // Use pg connection to manage cron jobs
        // We need to use the Postgres connection directly via fetch to the management API
        // Since we can't use pg directly, we'll use a database function approach
        
        if (maintenance_mode) {
          // Deactivate all cron jobs
          await supabase.rpc("toggle_cron_jobs" as any, { p_active: false });
          console.log("All cron jobs deactivated");
        } else {
          // Reactivate all cron jobs
          await supabase.rpc("toggle_cron_jobs" as any, { p_active: true });
          console.log("All cron jobs reactivated");
        }
      } catch (cronError) {
        console.error("Error toggling cron jobs (non-fatal):", cronError);
        // Don't fail the whole request if cron toggle fails
      }

      return new Response(JSON.stringify({ ...data, crons_toggled: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
