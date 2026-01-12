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

        // Check if any aviso should be sent now (within 5 minute window)
        const shouldTrigger = activeAvisos.some((aviso) => {
          const [hora, minuto] = aviso.horario_envio.split(":").map(Number);
          const avisoMinute = hora * 60 + minuto;
          return currentMinute >= avisoMinute && currentMinute <= avisoMinute + 5;
        });

        if (!shouldTrigger) {
          return;
        }

        console.log("[AvisosScheduler] Triggering enviar-avisos-agendamento...");
        processingRef.current = true;

        try {
          const { error } = await supabase.functions.invoke("enviar-avisos-agendamento", {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: {},
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
