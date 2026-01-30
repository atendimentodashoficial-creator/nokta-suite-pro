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

  // 1. Atualizar todos os leads com mesmo telefone
  const { data: allLeads } = await supabase
    .from("leads")
    .select("id, telefone")
    .is("deleted_at", null);

  if (allLeads) {
    const matchingLeads = allLeads.filter((l) => {
      if (excludeLeadId && l.id === excludeLeadId) return false;
      return getLast8Digits(l.telefone) === last8;
    });

    for (const lead of matchingLeads) {
      await supabase
        .from("leads")
        .update({ nome: trimmedName })
        .eq("id", lead.id);
    }
  }

  // 2. Atualizar todos os whatsapp_chats com mesmo telefone
  const { data: whatsappChats } = await supabase
    .from("whatsapp_chats")
    .select("id, normalized_number");

  if (whatsappChats) {
    const matchingWa = whatsappChats.filter(
      (c) => getLast8Digits(c.normalized_number) === last8
    );

    for (const chat of matchingWa) {
      await supabase
        .from("whatsapp_chats")
        .update({ contact_name: trimmedName })
        .eq("id", chat.id);
    }
  }

  // 3. Atualizar todos os disparos_chats com mesmo telefone
  const { data: disparosChats } = await supabase
    .from("disparos_chats")
    .select("id, normalized_number");

  if (disparosChats) {
    const matchingDisparos = disparosChats.filter(
      (c) => getLast8Digits(c.normalized_number) === last8
    );

    for (const chat of matchingDisparos) {
      await supabase
        .from("disparos_chats")
        .update({ contact_name: trimmedName })
        .eq("id", chat.id);
    }
  }

  // 4. Disparar evento para que componentes com estado local recarreguem
  dispatchContactNameUpdatedEvent(telefone, trimmedName);
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
