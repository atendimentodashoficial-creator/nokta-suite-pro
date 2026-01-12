import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const CHECK_INTERVAL_MS = 15000; // Check every 15 seconds

// Get current time in São Paulo timezone
function getSaoPauloTime(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const saoPauloOffset = -3 * 60 * 60 * 1000;
  return new Date(utc + saoPauloOffset);
}

export function useAvisosAgendamentoScheduler() {
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
        const saoPauloNow = getSaoPauloTime();
        const currentMinute = saoPauloNow.getHours() * 60 + saoPauloNow.getMinutes();

        // Find avisos that are due for checking:
        // 1. next_check_at is set and has passed, OR
        // 2. next_check_at is NULL but the scheduled time has passed today (catch-up)
        const { data: activeAvisos, error } = await supabase
          .from("avisos_agendamento")
          .select("id, nome, horario_envio, next_check_at")
          .eq("user_id", user.id)
          .eq("ativo", true);

        if (error) {
          console.error("[AvisosScheduler] Error querying avisos:", error);
          return;
        }

        const dueAvisos = (activeAvisos || []).filter((aviso) => {
          if (processingRef.current.has(aviso.id)) return false;

          // Parse horario_envio
          const [hora, minuto] = (aviso.horario_envio || "00:00").split(":").map(Number);
          const avisoMinute = hora * 60 + minuto;

          // If next_check_at is set and due
          if (aviso.next_check_at) {
            return new Date(aviso.next_check_at) <= new Date(nowIso);
          }

          // Fallback: if no next_check_at but time has passed today
          return currentMinute >= avisoMinute;
        });

        for (const aviso of dueAvisos) {
          processingRef.current.add(aviso.id);
          try {
            console.log(`[AvisosScheduler] Triggering aviso "${aviso.nome}"...`);
            await supabase.functions.invoke("enviar-avisos-agendamento", {
              headers: { Authorization: `Bearer ${session.access_token}` },
              body: { aviso_id: aviso.id, action: "scheduled" },
            });
          } catch (err) {
            console.error(`[AvisosScheduler] Error triggering aviso ${aviso.id}:`, err);
          } finally {
            // Small cooldown to avoid duplicate calls while backend updates next_check_at
            window.setTimeout(() => processingRef.current.delete(aviso.id), 5000);
          }
        }
      } catch (err) {
        console.error("[AvisosScheduler] Error:", err);
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
