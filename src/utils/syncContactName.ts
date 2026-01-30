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
  const { data: allLeads, error: leadsError } = await supabase
    .from("leads")
    .select("id, telefone")
    .is("deleted_at", null);

  if (leadsError) {
    console.error("[syncContactName] Erro ao buscar leads:", leadsError);
  }

  if (allLeads) {
    const matchingLeads = allLeads.filter((l) => {
      if (excludeLeadId && l.id === excludeLeadId) return false;
      return getLast8Digits(l.telefone) === last8;
    });

    console.log("[syncContactName] Leads encontrados para atualizar:", matchingLeads.length);

    for (const lead of matchingLeads) {
      const { error } = await supabase
        .from("leads")
        .update({ nome: trimmedName })
        .eq("id", lead.id);
      
      if (error) {
        console.error("[syncContactName] Erro ao atualizar lead:", lead.id, error);
      } else {
        console.log("[syncContactName] Lead atualizado:", lead.id);
      }
    }
  }

  // 2. Atualizar todos os whatsapp_chats com mesmo telefone
  const { data: whatsappChats, error: waError } = await supabase
    .from("whatsapp_chats")
    .select("id, normalized_number");

  if (waError) {
    console.error("[syncContactName] Erro ao buscar whatsapp_chats:", waError);
  }

  if (whatsappChats) {
    const matchingWa = whatsappChats.filter(
      (c) => getLast8Digits(c.normalized_number) === last8
    );

    console.log("[syncContactName] WhatsApp chats encontrados para atualizar:", matchingWa.length);

    for (const chat of matchingWa) {
      const { error } = await supabase
        .from("whatsapp_chats")
        .update({ contact_name: trimmedName })
        .eq("id", chat.id);
      
      if (error) {
        console.error("[syncContactName] Erro ao atualizar whatsapp_chat:", chat.id, error);
      } else {
        console.log("[syncContactName] WhatsApp chat atualizado:", chat.id);
      }
    }
  }

  // 3. Atualizar todos os disparos_chats com mesmo telefone
  const { data: disparosChats, error: dispError } = await supabase
    .from("disparos_chats")
    .select("id, normalized_number");

  if (dispError) {
    console.error("[syncContactName] Erro ao buscar disparos_chats:", dispError);
  }

  if (disparosChats) {
    const matchingDisparos = disparosChats.filter(
      (c) => getLast8Digits(c.normalized_number) === last8
    );

    console.log("[syncContactName] Disparos chats encontrados para atualizar:", matchingDisparos.length, matchingDisparos.map(c => c.id));

    for (const chat of matchingDisparos) {
      const { data, error } = await supabase
        .from("disparos_chats")
        .update({ contact_name: trimmedName })
        .eq("id", chat.id)
        .select();
      
      if (error) {
        console.error("[syncContactName] Erro ao atualizar disparos_chat:", chat.id, error);
      } else {
        console.log("[syncContactName] Disparos chat atualizado:", chat.id, "resultado:", data);
      }
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
