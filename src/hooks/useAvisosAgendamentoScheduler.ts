import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const CHECK_INTERVAL_MS = 60000; // Check every minute

// Get current time in São Paulo timezone
function getSaoPauloTime(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const saoPauloOffset = -3 * 60 * 60 * 1000;
  return new Date(utc + saoPauloOffset);
}

export function useAvisosAgendamentoScheduler() {
  const { user } = useAuth();
  const processingRef = useRef(false);
  const lastCheckMinuteRef = useRef<number | null>(null);
  const lastInvokeAtRef = useRef<number>(0);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    const checkAndSend = async () => {
      if (cancelled || processingRef.current) return;

      const now = getSaoPauloTime();
      const currentMinute = now.getHours() * 60 + now.getMinutes();

      // Avoid running multiple times in the same minute
      if (lastCheckMinuteRef.current === currentMinute) {
        return;
      }
      lastCheckMinuteRef.current = currentMinute;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Check if user has any active avisos
        const { data: activeAvisos, error: avisosError } = await supabase
          .from("avisos_agendamento")
          .select("id, horario_envio")
          .eq("user_id", user.id)
          .eq("ativo", true);

        if (avisosError || !activeAvisos || activeAvisos.length === 0) {
          return;
        }

        // If the scheduled time has already passed and something wasn't sent,
        // we still need to trigger the backend to catch up.
        const avisoMinutes = activeAvisos
          .map((aviso) => {
            const [hora, minuto] = aviso.horario_envio.split(":").map(Number);
            return hora * 60 + minuto;
          })
          .filter((m) => Number.isFinite(m));

        const earliestAvisoMinute = avisoMinutes.length ? Math.min(...avisoMinutes) : null;
        if (earliestAvisoMinute == null) return;

        // Too early for all avisos today
        if (currentMinute < earliestAvisoMinute) {
          return;
        }

        // Throttle invocations (avoid calling every minute for the rest of the day)
        const THROTTLE_MS = 5 * 60 * 1000;
        if (Date.now() - lastInvokeAtRef.current < THROTTLE_MS) {
          return;
        }
        lastInvokeAtRef.current = Date.now();

        console.log("[AvisosScheduler] Triggering enviar-avisos-agendamento (catch-up enabled)...");
        processingRef.current = true;

        try {
          const { error } = await supabase.functions.invoke("enviar-avisos-agendamento", {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { user_id: user.id },
          });

          if (error) {
            console.error("[AvisosScheduler] Error invoking function:", error);
          } else {
            console.log("[AvisosScheduler] Function invoked successfully");
          }
        } finally {
          // Cooldown to avoid duplicate calls
          window.setTimeout(() => {
            processingRef.current = false;
          }, 30000);
        }
      } catch (err) {
        console.error("[AvisosScheduler] Error:", err);
        processingRef.current = false;
      }
    };

    // Initial check
    checkAndSend();

    // Set up interval
    const interval = window.setInterval(checkAndSend, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user?.id]);
}
