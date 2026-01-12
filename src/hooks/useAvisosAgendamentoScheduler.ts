import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const CHECK_INTERVAL_MS = 15000; // Check every 15 seconds

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

        // Find avisos that are due for checking
        const { data: dueAvisos, error } = await supabase
          .from("avisos_agendamento")
          .select("id, nome, next_check_at")
          .eq("user_id", user.id)
          .eq("ativo", true)
          .not("next_check_at", "is", null)
          .lte("next_check_at", nowIso)
          .order("next_check_at", { ascending: true })
          .limit(5);

        if (error) {
          console.error("[AvisosScheduler] Error querying due avisos:", error);
          return;
        }

        for (const aviso of dueAvisos || []) {
          if (!aviso?.id) continue;
          if (processingRef.current.has(aviso.id)) continue;

          processingRef.current.add(aviso.id);
          try {
            console.log(`[AvisosScheduler] Triggering aviso ${aviso.nome}...`);
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
