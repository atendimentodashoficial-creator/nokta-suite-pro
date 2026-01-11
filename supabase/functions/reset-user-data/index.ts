import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResetOptions {
  leads: boolean;
  agendamentos: boolean;
  faturas: boolean;
  chatsWhatsApp: boolean;
  chatsDisparos: boolean;
  historicoMensagens: boolean;
  campanhasDisparos: boolean;
  listasExtrator: boolean;
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

    const { options } = await req.json() as { options: ResetOptions };
    const deletedTables: string[] = [];

    // Order matters due to foreign key constraints
    // Delete in reverse dependency order

    // 1. Histórico de mensagens (Instagram)
    if (options.historicoMensagens) {
      await supabase.from("instagram_mensagens").delete().eq("user_id", userId);
      await supabase.from("instagram_interacoes").delete().eq("user_id", userId);
      await supabase.from("instagram_formularios_respostas").delete().eq("user_id", userId);
      deletedTables.push("instagram_mensagens", "instagram_interacoes", "instagram_formularios_respostas");
    }

    // 2. Campanhas de Disparos
    if (options.campanhasDisparos) {
      // Delete campaign contacts and variations first
      const { data: campanhas } = await supabase
        .from("disparos_campanhas")
        .select("id")
        .eq("user_id", userId);
      
      if (campanhas && campanhas.length > 0) {
        const campanhaIds = campanhas.map(c => c.id);
        await supabase.from("disparos_campanha_contatos").delete().in("campanha_id", campanhaIds);
        await supabase.from("disparos_campanha_variacoes").delete().in("campanha_id", campanhaIds);
      }
      
      await supabase.from("disparos_campanhas").delete().eq("user_id", userId);
      deletedTables.push("disparos_campanhas");
    }

    // 3. Listas do Extrator
    if (options.listasExtrator) {
      await supabase.from("listas_extrator").delete().eq("user_id", userId);
      deletedTables.push("listas_extrator");
    }

    // 4. Chats Disparos (mensagens e chats)
    if (options.chatsDisparos) {
      // Get chat IDs first
      const { data: disparosChats } = await supabase
        .from("disparos_chats")
        .select("id")
        .eq("user_id", userId);
      
      if (disparosChats && disparosChats.length > 0) {
        const chatIds = disparosChats.map(c => c.id);
        await supabase.from("disparos_messages").delete().in("chat_id", chatIds);
        await supabase.from("disparos_chat_kanban").delete().in("chat_id", chatIds);
      }
      
      await supabase.from("disparos_chats").delete().eq("user_id", userId);
      deletedTables.push("disparos_chats", "disparos_messages");
    }

    // 5. Chats WhatsApp (mensagens e chats)
    if (options.chatsWhatsApp) {
      // Get chat IDs first
      const { data: whatsappChats } = await supabase
        .from("whatsapp_chats")
        .select("id")
        .eq("user_id", userId);
      
      if (whatsappChats && whatsappChats.length > 0) {
        const chatIds = whatsappChats.map(c => c.id);
        await supabase.from("whatsapp_messages").delete().in("chat_id", chatIds);
        await supabase.from("whatsapp_chat_kanban").delete().in("chat_id", chatIds);
      }
      
      await supabase.from("whatsapp_chats").delete().eq("user_id", userId);
      deletedTables.push("whatsapp_chats", "whatsapp_messages");
    }

    // 6. Faturas (delete upsells and agendamento links first)
    if (options.faturas) {
      const { data: faturas } = await supabase
        .from("faturas")
        .select("id")
        .eq("user_id", userId);
      
      if (faturas && faturas.length > 0) {
        const faturaIds = faturas.map(f => f.id);
        await supabase.from("fatura_upsells").delete().in("fatura_id", faturaIds);
        await supabase.from("fatura_agendamentos").delete().in("fatura_id", faturaIds);
      }
      
      await supabase.from("faturas").delete().eq("user_id", userId);
      deletedTables.push("faturas");
    }

    // 7. Agendamentos (delete links first)
    if (options.agendamentos) {
      const { data: agendamentos } = await supabase
        .from("agendamentos")
        .select("id")
        .eq("user_id", userId);
      
      if (agendamentos && agendamentos.length > 0) {
        const agendamentoIds = agendamentos.map(a => a.id);
        // Delete fatura_agendamentos links (if not already deleted with faturas)
        await supabase.from("fatura_agendamentos").delete().in("agendamento_id", agendamentoIds);
        // Delete avisos enviados
        await supabase.from("avisos_enviados_log").delete().in("agendamento_id", agendamentoIds);
      }
      
      await supabase.from("agendamentos").delete().eq("user_id", userId);
      deletedTables.push("agendamentos");
    }

    // 8. Leads (delete history first)
    if (options.leads) {
      const { data: leads } = await supabase
        .from("leads")
        .select("id")
        .eq("user_id", userId);
      
      if (leads && leads.length > 0) {
        const leadIds = leads.map(l => l.id);
        await supabase.from("historico_leads").delete().in("lead_id", leadIds);
        // Delete avisos enviados linked to leads
        await supabase.from("avisos_enviados_log").delete().in("cliente_id", leadIds);
      }
      
      // If agendamentos weren't deleted, we need to handle the FK constraint
      if (!options.agendamentos) {
        // Set cliente_id to null on agendamentos (if table allows) or skip
        // For now, leads with agendamentos can't be deleted without deleting agendamentos
        const { error: leadsError } = await supabase
          .from("leads")
          .delete()
          .eq("user_id", userId);
        
        if (leadsError && leadsError.message.includes("foreign key")) {
          return new Response(
            JSON.stringify({ 
              error: "Não é possível deletar leads que possuem agendamentos. Selecione também 'Agendamentos'." 
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        await supabase.from("leads").delete().eq("user_id", userId);
      }
      
      deletedTables.push("leads");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Dados resetados com sucesso`,
        deletedTables 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Reset error:", err);
    const errorMessage = err instanceof Error ? err.message : "Erro ao resetar dados";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
