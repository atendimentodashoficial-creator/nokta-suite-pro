import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Emails ignorados
    const ignoredEmails = ['mkt@noktaodonto.com.br', 'admin@noktaodonto.com.br'];

    // Buscar usuários
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
    const visibleUsers = authUsers?.filter(u => !ignoredEmails.includes(u.email || '')) || [];

    // Tabelas a serem contadas por user_id
    const tables = [
      { name: 'leads', label: 'Leads' },
      { name: 'agendamentos', label: 'Agendamentos' },
      { name: 'faturas', label: 'Faturas' },
      { name: 'despesas', label: 'Despesas' },
      { name: 'procedimentos', label: 'Procedimentos' },
      { name: 'profissionais', label: 'Profissionais' },
      { name: 'avisos_agendamento', label: 'Avisos Agendamento' },
      { name: 'avisos_enviados_log', label: 'Avisos Enviados' },
      { name: 'mensagens_predefinidas', label: 'Mensagens Predefinidas' },
      { name: 'audios_predefinidos', label: 'Áudios Predefinidos' },
      { name: 'disparos_campanhas', label: 'Campanhas Disparos' },
      { name: 'disparos_instancias', label: 'Instâncias Disparos' },
      { name: 'disparos_chats', label: 'Chats Disparos' },
      { name: 'whatsapp_chats', label: 'Chats WhatsApp' },
      { name: 'formulario_templates', label: 'Formulários' },
      { name: 'formulario_leads', label: 'Leads Formulários' },
      { name: 'reunioes', label: 'Reuniões' },
      { name: 'avisos_reuniao', label: 'Avisos Reunião' },
      { name: 'avisos_reuniao_log', label: 'Avisos Reunião Enviados' },
      { name: 'escalas_profissionais', label: 'Escalas' },
      { name: 'categorias_despesas', label: 'Categorias Despesas' },
      { name: 'disparos_kanban_columns', label: 'Colunas Kanban' },
    ];

    // Buscar contagens por usuário em paralelo
    const userUsagePromises = visibleUsers.map(async (user) => {
      const counts: Record<string, number> = {};
      let totalRecords = 0;

      // Fazer queries em paralelo para este usuário
      const results = await Promise.allSettled(
        tables.map(async (table) => {
          try {
            const { count, error } = await supabase
              .from(table.name)
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id);
            
            if (error) return { table: table.name, label: table.label, count: 0 };
            return { table: table.name, label: table.label, count: count || 0 };
          } catch {
            return { table: table.name, label: table.label, count: 0 };
          }
        })
      );

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          counts[result.value.table] = result.value.count;
          totalRecords += result.value.count;
        }
      });

      // Contar mensagens WhatsApp separadamente (não tem user_id direto)
      let whatsappMessagesCount = 0;
      try {
        const { count } = await supabase
          .from('whatsapp_messages')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        whatsappMessagesCount = count || 0;
      } catch { /* ignore */ }

      // Contar mensagens de disparos
      let disparosMessagesCount = 0;
      try {
        // Buscar chats do usuário primeiro
        const { data: userChats } = await supabase
          .from('disparos_chats')
          .select('id')
          .eq('user_id', user.id);
        
        if (userChats && userChats.length > 0) {
          const chatIds = userChats.map(c => c.id);
          // Contar em lotes de 50
          for (let i = 0; i < chatIds.length; i += 50) {
            const batch = chatIds.slice(i, i + 50);
            const { count } = await supabase
              .from('disparos_messages')
              .select('*', { count: 'exact', head: true })
              .in('chat_id', batch);
            disparosMessagesCount += count || 0;
          }
        }
      } catch { /* ignore */ }

      // Contar contatos de campanhas
      let campanhaContatosCount = 0;
      try {
        const { data: userCampanhas } = await supabase
          .from('disparos_campanhas')
          .select('id')
          .eq('user_id', user.id);
        
        if (userCampanhas && userCampanhas.length > 0) {
          const ids = userCampanhas.map(c => c.id);
          for (let i = 0; i < ids.length; i += 50) {
            const batch = ids.slice(i, i + 50);
            const { count } = await supabase
              .from('disparos_campanha_contatos')
              .select('*', { count: 'exact', head: true })
              .in('campanha_id', batch);
            campanhaContatosCount += count || 0;
          }
        }
      } catch { /* ignore */ }

      totalRecords += whatsappMessagesCount + disparosMessagesCount + campanhaContatosCount;

      return {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || null,
        banned_until: (user as any)?.banned_until || null,
        totalRecords,
        counts,
        whatsappMessagesCount,
        disparosMessagesCount,
        campanhaContatosCount,
      };
    });

    const usersUsage = await Promise.all(userUsagePromises);

    // Resumo geral por tabela
    const tableSummary = tables.map(table => {
      const total = usersUsage.reduce((sum, u) => sum + (u.counts[table.name] || 0), 0);
      return { table: table.name, label: table.label, total };
    });

    // Adicionar tabelas extras ao resumo
    tableSummary.push({
      table: 'whatsapp_messages',
      label: 'Mensagens WhatsApp',
      total: usersUsage.reduce((sum, u) => sum + u.whatsappMessagesCount, 0),
    });
    tableSummary.push({
      table: 'disparos_messages',
      label: 'Mensagens Disparos',
      total: usersUsage.reduce((sum, u) => sum + u.disparosMessagesCount, 0),
    });
    tableSummary.push({
      table: 'disparos_campanha_contatos',
      label: 'Contatos Campanhas',
      total: usersUsage.reduce((sum, u) => sum + u.campanhaContatosCount, 0),
    });

    // Ordenar resumo por total decrescente
    tableSummary.sort((a, b) => b.total - a.total);

    // Total geral
    const grandTotal = usersUsage.reduce((sum, u) => sum + u.totalRecords, 0);

    return new Response(
      JSON.stringify({
        success: true,
        usage: {
          users: usersUsage.sort((a, b) => b.totalRecords - a.totalRecords),
          tableSummary: tableSummary.filter(t => t.total > 0),
          grandTotal,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ADMIN_USAGE] Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
