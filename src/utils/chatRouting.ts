/**
 * Utility to determine the correct chat route based on lead/contact origin.
 *
 * Rules:
 * - If origem === "Disparos" → /disparos (and, when known, keep the instance reference)
 * - Otherwise → /whatsapp
 * - If origem is missing, we try to infer it by looking up existing records for the same phone.
 */

import { supabase } from "@/integrations/supabase/client";
import { getLast8Digits } from "@/utils/phoneFormat";

export type ChatOrigin = "WhatsApp" | "Disparos" | "Manual" | string | null | undefined;

type ChatRouteOptions = {
  instanciaNome?: string | null;
  prefillMessage?: string | null;
};

function buildRoute(phone: string, origem?: ChatOrigin, opts?: ChatRouteOptions): string {
  const encodedPhone = encodeURIComponent(phone);
  const prefillParam = opts?.prefillMessage ? `&prefill=${encodeURIComponent(opts.prefillMessage)}` : "";

  if (origem === "Disparos") {
    const instanciaNome = opts?.instanciaNome ? encodeURIComponent(opts.instanciaNome) : "";
    return instanciaNome
      ? `/disparos?chat=${encodedPhone}&instancia_nome=${instanciaNome}${prefillParam}`
      : `/disparos?chat=${encodedPhone}${prefillParam}`;
  }

  return `/whatsapp?chat=${encodedPhone}${prefillParam}`;
}

/**
 * Returns the appropriate route for opening a chat based on the origin.
 */
export function getChatRoute(phone: string, origem?: ChatOrigin, opts?: ChatRouteOptions): string {
  return buildRoute(phone, origem, opts);
}

async function inferOriginByPhone(phone: string): Promise<{ origem: ChatOrigin; instanciaNome?: string | null } | null> {
  const last8 = getLast8Digits(phone);
  if (!last8) return null;

  // Prefer a Disparos lead if it exists, otherwise fall back to a WhatsApp lead.
  const { data: leads, error } = await supabase
    .from("leads")
    .select("origem, instancia_nome, created_at")
    .like("telefone", `%${last8}`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.error("[chatRouting] inferOriginByPhone leads error", error);
    return null;
  }

  const rows = leads || [];
  const disparosRow = rows.find((r: any) => r?.origem === "Disparos");
  if (disparosRow) return { origem: "Disparos", instanciaNome: disparosRow.instancia_nome };

  const whatsappRow = rows.find((r: any) => r?.origem === "WhatsApp");
  if (whatsappRow) return { origem: "WhatsApp" };

  return null;
}

/**
 * Navigates to the appropriate chat.
 *
 * IMPORTANT: This is async because, when origem is missing, it will try to infer it.
 */
export async function navigateToChat(
  navigate: (path: string) => void,
  phone: string,
  origem?: ChatOrigin,
  opts?: ChatRouteOptions
): Promise<void> {
  let resolvedOrigem = origem;
  let resolvedInstanciaNome = opts?.instanciaNome;

  if (!resolvedOrigem) {
    const inferred = await inferOriginByPhone(phone);
    if (inferred?.origem) {
      resolvedOrigem = inferred.origem;
      resolvedInstanciaNome = inferred.instanciaNome ?? resolvedInstanciaNome;
    }
  }

  navigate(buildRoute(phone, resolvedOrigem, { instanciaNome: resolvedInstanciaNome, prefillMessage: opts?.prefillMessage }));
}

