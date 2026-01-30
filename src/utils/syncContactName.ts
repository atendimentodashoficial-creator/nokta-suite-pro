import { supabase } from "@/integrations/supabase/client";
import { getLast8Digits } from "@/utils/phoneFormat";

/**
 * Evento customizado disparado quando um nome de contato é alterado.
 * Componentes podem ouvir este evento para recarregar seus dados.
 */
export const CONTACT_NAME_UPDATED_EVENT = "contact-name-updated";

/**
 * Dispara o evento de atualização de nome de contato
 */
export function dispatchContactNameUpdatedEvent(telefone: string, novoNome: string) {
  window.dispatchEvent(
    new CustomEvent(CONTACT_NAME_UPDATED_EVENT, {
      detail: { telefone, novoNome },
    })
  );
}

/**
 * Propaga a alteração de nome de contato para todas as tabelas relacionadas:
 * - leads (todos com mesmo telefone)
 * - whatsapp_chats (todos com mesmo telefone)
 * - disparos_chats (todos com mesmo telefone)
 * 
 * @param telefone - Telefone do contato (qualquer formato)
 * @param novoNome - Novo nome a ser propagado
 * @param excludeLeadId - ID do lead a ser excluído da atualização (já foi atualizado)
 */
export async function syncContactNameEverywhere(
  telefone: string,
  novoNome: string,
  excludeLeadId?: string
): Promise<void> {
  const last8 = getLast8Digits(telefone);
  if (!last8 || last8.length < 8) {
    console.warn("[syncContactName] Telefone inválido:", telefone);
    return;
  }

  const trimmedName = novoNome.trim();
  if (!trimmedName) {
    console.warn("[syncContactName] Nome vazio, ignorando");
    return;
  }

  console.log("[syncContactName] Iniciando sincronização", { telefone, last8, novoNome: trimmedName });

  // 1. Atualizar todos os leads com mesmo telefone
  // IMPORTANTE: não fazer select em massa (limite padrão 1000). Filtrar direto pelo sufixo.
  const leadsQuery = supabase
    .from("leads")
    .select("id, telefone")
    .is("deleted_at", null)
    .like("telefone", `%${last8}%`);

  const { data: allLeads, error: leadsError } = excludeLeadId
    ? await leadsQuery.neq("id", excludeLeadId)
    : await leadsQuery;

  if (leadsError) {
    console.error("[syncContactName] Erro ao buscar leads:", leadsError);
  }

  console.log("[syncContactName] Leads encontrados para atualizar (filtrado por sufixo):", allLeads?.length ?? 0);

  if ((allLeads?.length ?? 0) > 0) {
    const leadIds = allLeads!.map((l) => l.id);
    const { error } = await supabase
      .from("leads")
      .update({ nome: trimmedName })
      .in("id", leadIds);

    if (error) {
      console.error("[syncContactName] Erro ao atualizar leads em lote:", error);
    } else {
      console.log("[syncContactName] Leads atualizados em lote:", leadIds.length);
    }
  }

  // 2. Atualizar todos os whatsapp_chats com mesmo telefone
  // Filtrar direto no backend para evitar limite e custo.
  const { data: whatsappChats, error: waError } = await supabase
    .from("whatsapp_chats")
    .select("id")
    .like("normalized_number", `%${last8}%`);

  if (waError) {
    console.error("[syncContactName] Erro ao buscar whatsapp_chats:", waError);
  }

  console.log(
    "[syncContactName] WhatsApp chats encontrados para atualizar (filtrado por sufixo):",
    whatsappChats?.length ?? 0
  );

  if ((whatsappChats?.length ?? 0) > 0) {
    const chatIds = whatsappChats!.map((c) => c.id);
    const { error } = await supabase
      .from("whatsapp_chats")
      .update({ contact_name: trimmedName })
      .in("id", chatIds);

    if (error) {
      console.error("[syncContactName] Erro ao atualizar whatsapp_chats em lote:", error);
    } else {
      console.log("[syncContactName] WhatsApp chats atualizados em lote:", chatIds.length);
    }
  }

  // 3. Atualizar todos os disparos_chats com mesmo telefone
  const { data: disparosChats, error: dispError } = await supabase
    .from("disparos_chats")
    .select("id")
    .like("normalized_number", `%${last8}%`);

  if (dispError) {
    console.error("[syncContactName] Erro ao buscar disparos_chats:", dispError);
  }

  console.log(
    "[syncContactName] Disparos chats encontrados para atualizar (filtrado por sufixo):",
    disparosChats?.length ?? 0,
    (disparosChats ?? []).map((c) => c.id)
  );

  if ((disparosChats?.length ?? 0) > 0) {
    const chatIds = disparosChats!.map((c) => c.id);
    const { error } = await supabase
      .from("disparos_chats")
      .update({ contact_name: trimmedName })
      .in("id", chatIds);

    if (error) {
      console.error("[syncContactName] Erro ao atualizar disparos_chats em lote:", error);
    } else {
      console.log("[syncContactName] Disparos chats atualizados em lote:", chatIds.length);
    }
  }

  // 4. Disparar evento para que componentes com estado local recarreguem
  dispatchContactNameUpdatedEvent(telefone, trimmedName);
  console.log("[syncContactName] Evento disparado, sincronização concluída");
}

/**
 * Lista de queryKeys que devem ser invalidadas após alteração de nome
 */
export const CONTACT_NAME_QUERY_KEYS = [
  ["leads"],
  ["whatsapp-chats"],
  ["disparos-chats"],
  ["agendamentos"],
  ["faturas"],
  ["reunioes"],
] as const;
