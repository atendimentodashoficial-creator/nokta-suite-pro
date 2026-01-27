import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const CHECK_INTERVAL_MS = 60000; // 60s - backend cron handles primary scheduling

export function useDisparosCampaignScheduler() {
  const { user } = useAuth();
  const processingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    const checkAndContinue = async () => {
      if (cancelled) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const nowIso = new Date().toISOString();

        const { data: campaigns, error } = await supabase
          .from("disparos_campanhas")
          .select("id,nome,next_send_at,delay_min,status")
          .eq("user_id", user.id)
          .eq("status", "running")
          .not("next_send_at", "is", null)
          .gte("delay_min", 60)
          .lte("next_send_at", nowIso)
          .order("next_send_at", { ascending: true })
          .limit(10);

        if (error) throw error;

        for (const c of campaigns || []) {
          if (!c?.id) continue;
          if (processingRef.current.has(c.id)) continue;

          processingRef.current.add(c.id);
          try {
            await supabase.functions.invoke("disparos-campanha-control", {
              headers: { Authorization: `Bearer ${session.access_token}` },
              body: { campanha_id: c.id, action: "continue" },
            });
          } catch (err) {
            console.error(`[Scheduler] Error continuing campaign ${c.id}:`, err);
          } finally {
            // Small cooldown to avoid duplicate calls while backend updates next_send_at
            window.setTimeout(() => processingRef.current.delete(c.id), 5000);
          }
        }
      } catch (err) {
        console.error("[Scheduler] Error checking due campaigns:", err);
      }
    };

    const interval = window.setInterval(checkAndContinue, CHECK_INTERVAL_MS);
    checkAndContinue();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user?.id]);
}
