import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CleanupOptions {
  leadsSoftDeleted: boolean;
  leadsDuplicados: boolean;
  agendamentosOrfaos: boolean;
  chatsOrfaos: boolean;
  mensagensOrfas: boolean;
}

interface CleanupResult {
  leadsSoftDeleted: number;
  leadsDuplicados: number;
  agendamentosOrfaos: number;
  chatsWhatsAppOrfaos: number;
  chatsDisparosOrfaos: number;
  mensagensWhatsAppOrfas: number;
  mensagensDisparosOrfas: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with user token to get user ID
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    // Service role client for deletions
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { options, dryRun = false } = await req.json() as { options: CleanupOptions; dryRun?: boolean };
    const result: CleanupResult = {
      leadsSoftDeleted: 0,
      leadsDuplicados: 0,
      agendamentosOrfaos: 0,
      chatsWhatsAppOrfaos: 0,
      chatsDisparosOrfaos: 0,
      mensagensWhatsAppOrfas: 0,
      mensagensDisparosOrfas: 0,
    };

    // Helper: normalize phone to last 8 digits (same as app logic)
    const phoneKey = (phone: string): string => {
      const clean = phone.replace(/\D/g, "");
      return clean.length > 8 ? clean.slice(-8) : clean;
    };

    // 1. Leads soft-deleted (deleted_at IS NOT NULL)
    if (options.leadsSoftDeleted) {
      const { data: softDeleted } = await supabase
        .from("leads")
        .select("id")
        .eq("user_id", userId)
        .not("deleted_at", "is", null);

      result.leadsSoftDeleted = softDeleted?.length || 0;

      if (!dryRun && softDeleted && softDeleted.length > 0) {
        const ids = softDeleted.map(l => l.id);
        // Delete related records first
        await supabase.from("historico_leads").delete().in("lead_id", ids);
        await supabase.from("leads").delete().in("id", ids);
      }
    }

    // 2. Leads duplicados (mesmo telefone, apenas o mais antigo é visível)
    if (options.leadsDuplicados) {
      const { data: allLeads } = await supabase
        .from("leads")
        .select("id, telefone, created_at")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (allLeads) {
        // Group by phone key, keep only the first (oldest)
        const primaryByPhone: Record<string, string> = {};
        const duplicateIds: string[] = [];

        for (const lead of allLeads) {
          const key = phoneKey(lead.telefone);
          if (!primaryByPhone[key]) {
            primaryByPhone[key] = lead.id;
          } else {
            duplicateIds.push(lead.id);
          }
        }

        result.leadsDuplicados = duplicateIds.length;

        if (!dryRun && duplicateIds.length > 0) {
          // Soft delete duplicates (set deleted_at)
          await supabase
            .from("leads")
            .update({ deleted_at: new Date().toISOString() })
            .in("id", duplicateIds);
        }
      }
    }

    // 3. Agendamentos órfãos (status "realizado" sem fatura vinculada)
    if (options.agendamentosOrfaos) {
      // Get all faturas with their agendamento links
      const { data: faturas } = await supabase
        .from("faturas")
        .select("id, fatura_agendamentos(agendamento_id)")
        .eq("user_id", userId);

      const agendamentoIdsComFatura = new Set<string>();
      faturas?.forEach((f: any) => {
        f.fatura_agendamentos?.forEach((fa: any) => {
          if (fa.agendamento_id) {
            agendamentoIdsComFatura.add(fa.agendamento_id);
          }
        });
      });

      // Find agendamentos with status "realizado" but no fatura
      const { data: agendamentos } = await supabase
        .from("agendamentos")
        .select("id, status")
        .eq("user_id", userId)
        .eq("status", "realizado");

      const orphanAgendamentos = agendamentos?.filter(
        a => !agendamentoIdsComFatura.has(a.id)
      ) || [];

      result.agendamentosOrfaos = orphanAgendamentos.length;

      if (!dryRun && orphanAgendamentos.length > 0) {
        const ids = orphanAgendamentos.map(a => a.id);
        // Delete avisos first
        await supabase.from("avisos_enviados_log").delete().in("agendamento_id", ids);
        await supabase.from("fatura_agendamentos").delete().in("agendamento_id", ids);
        await supabase.from("agendamentos").delete().in("id", ids);
      }
    }

    // 4. Chats órfãos (sem lead correspondente ativo)
    if (options.chatsOrfaos) {
      // Get all active leads' phone keys
      const { data: activeLeads } = await supabase
        .from("leads")
        .select("telefone")
        .eq("user_id", userId)
        .is("deleted_at", null);

      const activePhoneKeys = new Set<string>();
      activeLeads?.forEach(l => {
        activePhoneKeys.add(phoneKey(l.telefone));
      });

      // WhatsApp chats
      const { data: whatsappChats } = await supabase
        .from("whatsapp_chats")
        .select("id, contact_number")
        .eq("user_id", userId)
        .is("deleted_at", null);

      const orphanWhatsappChats = whatsappChats?.filter(c => {
        const key = phoneKey(c.contact_number);
        return !activePhoneKeys.has(key);
      }) || [];

      result.chatsWhatsAppOrfaos = orphanWhatsappChats.length;

      if (!dryRun && orphanWhatsappChats.length > 0) {
        const ids = orphanWhatsappChats.map(c => c.id);
        await supabase.from("whatsapp_messages").delete().in("chat_id", ids);
        await supabase.from("whatsapp_chat_kanban").delete().in("chat_id", ids);
        await supabase.from("whatsapp_chats").delete().in("id", ids);
      }

      // Disparos chats
      const { data: disparosChats } = await supabase
        .from("disparos_chats")
        .select("id, contact_number")
        .eq("user_id", userId)
        .is("deleted_at", null);

      const orphanDisparosChats = disparosChats?.filter(c => {
        const key = phoneKey(c.contact_number);
        return !activePhoneKeys.has(key);
      }) || [];

      result.chatsDisparosOrfaos = orphanDisparosChats.length;

      if (!dryRun && orphanDisparosChats.length > 0) {
        const ids = orphanDisparosChats.map(c => c.id);
        await supabase.from("disparos_messages").delete().in("chat_id", ids);
        await supabase.from("disparos_chat_kanban").delete().in("chat_id", ids);
        await supabase.from("disparos_chats").delete().in("id", ids);
      }
    }

    // 5. Mensagens órfãs (de chats que não existem mais)
    if (options.mensagensOrfas) {
      // WhatsApp messages without valid chat
      const { data: validWhatsappChatIds } = await supabase
        .from("whatsapp_chats")
        .select("id")
        .eq("user_id", userId);

      const validWaChatSet = new Set(validWhatsappChatIds?.map(c => c.id) || []);

      // Get distinct chat_ids from messages
      const { data: waMessages } = await supabase
        .from("whatsapp_messages")
        .select("id, chat_id");

      const orphanWaMessageIds = waMessages?.filter(m => !validWaChatSet.has(m.chat_id)).map(m => m.id) || [];
      result.mensagensWhatsAppOrfas = orphanWaMessageIds.length;

      if (!dryRun && orphanWaMessageIds.length > 0) {
        // Delete in batches of 500
        for (let i = 0; i < orphanWaMessageIds.length; i += 500) {
          const batch = orphanWaMessageIds.slice(i, i + 500);
          await supabase.from("whatsapp_messages").delete().in("id", batch);
        }
      }

      // Disparos messages without valid chat
      const { data: validDisparosChatIds } = await supabase
        .from("disparos_chats")
        .select("id")
        .eq("user_id", userId);

      const validDispChatSet = new Set(validDisparosChatIds?.map(c => c.id) || []);

      const { data: dispMessages } = await supabase
        .from("disparos_messages")
        .select("id, chat_id");

      const orphanDispMessageIds = dispMessages?.filter(m => !validDispChatSet.has(m.chat_id)).map(m => m.id) || [];
      result.mensagensDisparosOrfas = orphanDispMessageIds.length;

      if (!dryRun && orphanDispMessageIds.length > 0) {
        for (let i = 0; i < orphanDispMessageIds.length; i += 500) {
          const batch = orphanDispMessageIds.slice(i, i + 500);
          await supabase.from("disparos_messages").delete().in("id", batch);
        }
      }
    }

    const totalCleaned = Object.values(result).reduce((a, b) => a + b, 0);

    return new Response(
      JSON.stringify({ 
        success: true, 
        dryRun,
        message: dryRun 
          ? `Encontrados ${totalCleaned} registros órfãos para limpeza`
          : `${totalCleaned} registros órfãos removidos com sucesso`,
        result 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Cleanup error:", err);
    const errorMessage = err instanceof Error ? err.message : "Erro ao limpar dados";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
