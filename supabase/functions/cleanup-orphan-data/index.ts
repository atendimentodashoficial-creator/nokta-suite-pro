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

interface ResetOptions {
  leads: boolean;
  agendamentos: boolean;
  faturas: boolean;
  chatsWhatsApp: boolean;
  chatsDisparos: boolean;
  campanhasDisparos: boolean;
  listasExtrator: boolean;
  historico: boolean;
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

interface ResetResult {
  leads: number;
  agendamentos: number;
  faturas: number;
  chatsWhatsApp: number;
  chatsDisparos: number;
  campanhasDisparos: number;
  listasExtrator: number;
  historico: number;
}

type PeriodOption = "7d" | "30d" | "90d" | "1y" | "max";

function getPeriodDate(period: PeriodOption): Date | null {
  const now = new Date();
  switch (period) {
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "1y":
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case "max":
      return null; // No date filter
  }
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { mode, options, period = "max", dryRun = false } = await req.json() as { 
      mode: "orphan" | "reset";
      options: CleanupOptions | ResetOptions;
      period?: PeriodOption;
      dryRun?: boolean;
    };

    const periodDate = getPeriodDate(period);
    const periodIso = periodDate?.toISOString();

    // Helper functions
    const phoneKey = (phone: string): string => {
      const clean = phone.replace(/\D/g, "");
      return clean.length > 8 ? clean.slice(-8) : clean;
    };

    // Batch delete helper - processes in chunks of 100 to avoid query limits
    const BATCH_SIZE = 100;
    const FETCH_BATCH_SIZE = 1000; // Supabase default limit
    
    const batchDelete = async (table: string, column: string, ids: string[]) => {
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        await supabase.from(table).delete().in(column, batch);
      }
    };
    
    // Helper to fetch ALL IDs from a table with pagination (overcomes 1000 row limit)
    const fetchAllIds = async (
      table: string, 
      userId: string, 
      periodIso: string | null = null,
      dateColumn: string = "created_at"
    ): Promise<string[]> => {
      const allIds: string[] = [];
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        let query = supabase
          .from(table)
          .select("id")
          .eq("user_id", userId)
          .range(offset, offset + FETCH_BATCH_SIZE - 1);
        
        if (periodIso) {
          query = query.gte(dateColumn, periodIso);
        }
        
        const { data, error } = await query;
        
        if (error) {
          console.error(`Error fetching from ${table}:`, error);
          break;
        }
        
        if (data && data.length > 0) {
          allIds.push(...data.map((row: any) => row.id));
          offset += FETCH_BATCH_SIZE;
          hasMore = data.length === FETCH_BATCH_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      return allIds;
    };

    if (mode === "orphan") {
      const cleanupOpts = options as CleanupOptions;
      const result: CleanupResult = {
        leadsSoftDeleted: 0,
        leadsDuplicados: 0,
        agendamentosOrfaos: 0,
        chatsWhatsAppOrfaos: 0,
        chatsDisparosOrfaos: 0,
        mensagensWhatsAppOrfas: 0,
        mensagensDisparosOrfas: 0,
      };

      // 1. Leads soft-deleted
      if (cleanupOpts.leadsSoftDeleted) {
        const { data: softDeleted } = await supabase
          .from("leads")
          .select("id")
          .eq("user_id", userId)
          .not("deleted_at", "is", null);

        result.leadsSoftDeleted = softDeleted?.length || 0;

        if (!dryRun && softDeleted && softDeleted.length > 0) {
          const ids = softDeleted.map(l => l.id);
          await batchDelete("historico_leads", "lead_id", ids);
          await batchDelete("leads", "id", ids);
        }
      }

      // 2. Leads duplicados
      if (cleanupOpts.leadsDuplicados) {
        const { data: allLeads } = await supabase
          .from("leads")
          .select("id, telefone, created_at")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .order("created_at", { ascending: true });

        if (allLeads) {
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
            await supabase
              .from("leads")
              .update({ deleted_at: new Date().toISOString() })
              .in("id", duplicateIds);
          }
        }
      }

      // 3. Agendamentos órfãos
      if (cleanupOpts.agendamentosOrfaos) {
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
          await batchDelete("avisos_enviados_log", "agendamento_id", ids);
          await batchDelete("fatura_agendamentos", "agendamento_id", ids);
          await batchDelete("agendamentos", "id", ids);
        }
      }

      // 4. Chats órfãos
      if (cleanupOpts.chatsOrfaos) {
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
          await batchDelete("whatsapp_messages", "chat_id", ids);
          await batchDelete("whatsapp_chat_kanban", "chat_id", ids);
          await batchDelete("whatsapp_chats", "id", ids);
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
          await batchDelete("disparos_messages", "chat_id", ids);
          await batchDelete("disparos_chat_kanban", "chat_id", ids);
          await batchDelete("disparos_chats", "id", ids);
        }
      }

      // 5. Mensagens órfãs
      if (cleanupOpts.mensagensOrfas) {
        const { data: validWhatsappChatIds } = await supabase
          .from("whatsapp_chats")
          .select("id")
          .eq("user_id", userId);

        const validWaChatSet = new Set(validWhatsappChatIds?.map(c => c.id) || []);

        const { data: waMessages } = await supabase
          .from("whatsapp_messages")
          .select("id, chat_id");

        const orphanWaMessageIds = waMessages?.filter(m => !validWaChatSet.has(m.chat_id)).map(m => m.id) || [];
        result.mensagensWhatsAppOrfas = orphanWaMessageIds.length;

        if (!dryRun && orphanWaMessageIds.length > 0) {
          for (let i = 0; i < orphanWaMessageIds.length; i += 500) {
            const batch = orphanWaMessageIds.slice(i, i + 500);
            await supabase.from("whatsapp_messages").delete().in("id", batch);
          }
        }

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

      return new Response(
        JSON.stringify({ success: true, dryRun, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // MODE: RESET
    const resetOpts = options as ResetOptions;
    const result: ResetResult = {
      leads: 0,
      agendamentos: 0,
      faturas: 0,
      chatsWhatsApp: 0,
      chatsDisparos: 0,
      campanhasDisparos: 0,
      listasExtrator: 0,
      historico: 0,
    };

    // Helper to build period query
    const withPeriod = (query: any, dateColumn: string = "created_at") => {
      if (periodIso) {
        return query.gte(dateColumn, periodIso);
      }
      return query;
    };

    // 1. Histórico (must be deleted before leads due to FK)
    if (resetOpts.historico) {
      let query = supabase
        .from("historico_leads")
        .select("id", { count: "exact" })
        .eq("user_id", userId);
      
      query = withPeriod(query, "data_alteracao");
      const { count } = await query;
      result.historico = count || 0;

      if (!dryRun && result.historico > 0) {
        let deleteQuery = supabase
          .from("historico_leads")
          .delete()
          .eq("user_id", userId);
        
        if (periodIso) {
          deleteQuery = deleteQuery.gte("data_alteracao", periodIso);
        }
        await deleteQuery;
      }
    }

    // 2. Faturas (before agendamentos due to fatura_agendamentos FK)
    if (resetOpts.faturas) {
      let query = supabase
        .from("faturas")
        .select("id", { count: "exact" })
        .eq("user_id", userId);
      
      query = withPeriod(query);
      const { data: faturaIds, count } = await query;
      result.faturas = count || 0;

      if (!dryRun && faturaIds && faturaIds.length > 0) {
        const ids = faturaIds.map((f: any) => f.id);
        // Delete related records
        await batchDelete("fatura_upsells", "fatura_id", ids);
        await batchDelete("fatura_agendamentos", "fatura_id", ids);
        await batchDelete("meta_conversion_events", "fatura_id", ids);
        await batchDelete("faturas", "id", ids);
      }
    }

    // 3. Agendamentos
    if (resetOpts.agendamentos) {
      let query = supabase
        .from("agendamentos")
        .select("id", { count: "exact" })
        .eq("user_id", userId);
      
      query = withPeriod(query);
      const { data: agendamentoIds, count } = await query;
      result.agendamentos = count || 0;

      if (!dryRun && agendamentoIds && agendamentoIds.length > 0) {
        const ids = agendamentoIds.map((a: any) => a.id);
        await batchDelete("avisos_enviados_log", "agendamento_id", ids);
        await batchDelete("fatura_agendamentos", "agendamento_id", ids);
        await batchDelete("meta_conversion_events", "agendamento_id", ids);
        await batchDelete("agendamentos", "id", ids);
      }
    }

    // 4. Leads
    if (resetOpts.leads) {
      let query = supabase
        .from("leads")
        .select("id", { count: "exact" })
        .eq("user_id", userId);
      
      query = withPeriod(query);
      const { data: leadIds, count } = await query;
      result.leads = count || 0;

      if (!dryRun && leadIds && leadIds.length > 0) {
        const ids = leadIds.map((l: any) => l.id);
        // Delete related records in order
        await batchDelete("historico_leads", "lead_id", ids);
        await batchDelete("meta_conversion_events", "lead_id", ids);
        await batchDelete("avisos_enviados_log", "cliente_id", ids);
        
        // Delete agendamentos for these leads - fetch in batches too
        let allAgendamentoIds: string[] = [];
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
          const batch = ids.slice(i, i + BATCH_SIZE);
          const { data: agendamentos } = await supabase
            .from("agendamentos")
            .select("id")
            .in("cliente_id", batch);
          if (agendamentos) {
            allAgendamentoIds = allAgendamentoIds.concat(agendamentos.map((a: any) => a.id));
          }
        }
        
        if (allAgendamentoIds.length > 0) {
          await batchDelete("fatura_agendamentos", "agendamento_id", allAgendamentoIds);
          await batchDelete("avisos_enviados_log", "agendamento_id", allAgendamentoIds);
          await batchDelete("agendamentos", "id", allAgendamentoIds);
        }

        // Delete faturas for these leads - fetch in batches too
        let allFaturaIds: string[] = [];
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
          const batch = ids.slice(i, i + BATCH_SIZE);
          const { data: faturas } = await supabase
            .from("faturas")
            .select("id")
            .in("cliente_id", batch);
          if (faturas) {
            allFaturaIds = allFaturaIds.concat(faturas.map((f: any) => f.id));
          }
        }
        
        if (allFaturaIds.length > 0) {
          await batchDelete("fatura_upsells", "fatura_id", allFaturaIds);
          await batchDelete("fatura_agendamentos", "fatura_id", allFaturaIds);
          await batchDelete("faturas", "id", allFaturaIds);
        }

        await batchDelete("leads", "id", ids);
      }
    }

    // 5. Chats WhatsApp
    if (resetOpts.chatsWhatsApp) {
      // Get count first
      let countQuery = supabase
        .from("whatsapp_chats")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      
      if (periodIso) {
        countQuery = countQuery.gte("created_at", periodIso);
      }
      const { count } = await countQuery;
      result.chatsWhatsApp = count || 0;

      if (!dryRun && result.chatsWhatsApp > 0) {
        // Fetch ALL IDs with pagination
        const ids = await fetchAllIds("whatsapp_chats", userId, periodIso);
        if (ids.length > 0) {
          await batchDelete("whatsapp_messages", "chat_id", ids);
          await batchDelete("whatsapp_chat_kanban", "chat_id", ids);
          await batchDelete("whatsapp_chats", "id", ids);
        }
      }
    }

    // 6. Chats Disparos
    if (resetOpts.chatsDisparos) {
      // Get count first
      let countQuery = supabase
        .from("disparos_chats")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      
      if (periodIso) {
        countQuery = countQuery.gte("created_at", periodIso);
      }
      const { count } = await countQuery;
      result.chatsDisparos = count || 0;

      if (!dryRun && result.chatsDisparos > 0) {
        // Fetch ALL IDs with pagination
        const ids = await fetchAllIds("disparos_chats", userId, periodIso);
        if (ids.length > 0) {
          await batchDelete("disparos_messages", "chat_id", ids);
          await batchDelete("disparos_chat_kanban", "chat_id", ids);
          await batchDelete("disparos_chats", "id", ids);
        }
      }
    }

    // 7. Campanhas Disparos
    if (resetOpts.campanhasDisparos) {
      let query = supabase
        .from("disparos_campanhas")
        .select("id", { count: "exact" })
        .eq("user_id", userId);
      
      query = withPeriod(query);
      const { data: campanhaIds, count } = await query;
      result.campanhasDisparos = count || 0;

      if (!dryRun && campanhaIds && campanhaIds.length > 0) {
        const ids = campanhaIds.map((c: any) => c.id);
        await batchDelete("disparos_campanha_contatos", "campanha_id", ids);
        await batchDelete("disparos_campanha_variacoes", "campanha_id", ids);
        await batchDelete("disparos_campanhas", "id", ids);
      }
    }

    // 8. Listas Extrator
    if (resetOpts.listasExtrator) {
      let query = supabase
        .from("listas_extrator")
        .select("id", { count: "exact" })
        .eq("user_id", userId);
      
      query = withPeriod(query);
      const { count } = await query;
      result.listasExtrator = count || 0;

      if (!dryRun && result.listasExtrator > 0) {
        let deleteQuery = supabase
          .from("listas_extrator")
          .delete()
          .eq("user_id", userId);
        
        if (periodIso) {
          deleteQuery = deleteQuery.gte("created_at", periodIso);
        }
        await deleteQuery;
      }
    }

    return new Response(
      JSON.stringify({ success: true, dryRun, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Cleanup error:", err);
    const errorMessage = err instanceof Error ? err.message : "Erro ao processar limpeza";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
