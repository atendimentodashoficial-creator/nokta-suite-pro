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

    // Pegar filtros se fornecidos
    const url = new URL(req.url);
    const filterUserId = url.searchParams.get('user_id');
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');

    // Emails a serem ignorados nas métricas
    const ignoredEmails = ['mkt@noktaodonto.com.br', 'admin@noktaodonto.com.br'];

    // Buscar usuários auth primeiro para ter a lista completa de IDs
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
    
    // Filtrar usuários visíveis (excluindo emails ignorados)
    const filteredAuthUsers = authUsers?.filter(u => !ignoredEmails.includes(u.email || ''));
    const activeAuthUsers = filteredAuthUsers?.filter(u => !(u as any).banned_until);
    
    // IDs dos usuários ignorados (baseado em auth users, não profiles)
    const ignoredUserIds = authUsers?.filter(u => ignoredEmails.includes(u.email || '')).map(u => u.id) || [];
    
    // IDs dos usuários visíveis no painel
    const visibleUserIds = filteredAuthUsers?.map(u => u.id) || [];
    
    console.log('[ADMIN_METRICS] Ignored user IDs:', ignoredUserIds);
    console.log('[ADMIN_METRICS] Visible user IDs count:', visibleUserIds.length);
    console.log('[ADMIN_METRICS] Filter user ID:', filterUserId);

    // Construir queries com filtros condicionais
    let leadsQuery = supabase.from('leads').select('*', { count: 'exact', head: true });
    let clientesQuery = supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'cliente');
    let agendamentosQuery = supabase.from('agendamentos').select('*', { count: 'exact', head: true });
    let faturasQuery = supabase.from('faturas').select('*', { count: 'exact', head: true });
    let faturasFechadasQuery = supabase.from('faturas').select('*', { count: 'exact', head: true }).eq('status', 'fechado');
    let faturasNegociacaoQuery = supabase.from('faturas').select('*', { count: 'exact', head: true }).eq('status', 'negociacao');

    // Se houver filtro de usuário, aplicar
    if (filterUserId) {
      leadsQuery = leadsQuery.eq('user_id', filterUserId);
      clientesQuery = clientesQuery.eq('user_id', filterUserId);
      agendamentosQuery = agendamentosQuery.eq('user_id', filterUserId);
      faturasQuery = faturasQuery.eq('user_id', filterUserId);
      faturasFechadasQuery = faturasFechadasQuery.eq('user_id', filterUserId);
      faturasNegociacaoQuery = faturasNegociacaoQuery.eq('user_id', filterUserId);
    } else if (visibleUserIds.length > 0) {
      // Filtrar apenas para usuários visíveis no painel
      leadsQuery = leadsQuery.in('user_id', visibleUserIds);
      clientesQuery = clientesQuery.in('user_id', visibleUserIds);
      agendamentosQuery = agendamentosQuery.in('user_id', visibleUserIds);
      faturasQuery = faturasQuery.in('user_id', visibleUserIds);
      faturasFechadasQuery = faturasFechadasQuery.in('user_id', visibleUserIds);
      faturasNegociacaoQuery = faturasNegociacaoQuery.in('user_id', visibleUserIds);
    }

    // Buscar métricas gerais (apenas de usuários visíveis no painel)
    const [
      { count: totalLeads },
      { count: totalClientes },
      { count: totalAgendamentos },
      { count: totalFaturas },
      { count: totalFaturasFechadas },
      { count: totalFaturasNegociacao }
    ] = await Promise.all([
      leadsQuery,
      clientesQuery,
      agendamentosQuery,
      faturasQuery,
      faturasFechadasQuery,
      faturasNegociacaoQuery
    ]);
    
    // Usar dados diretamente do auth em vez da tabela profiles
    // para garantir que todos os usuários apareçam, mesmo sem registro em profiles
    const recentUsers = filteredAuthUsers?.map(authUser => ({
      id: authUser.id,
      email: authUser.email,
      full_name: authUser.user_metadata?.full_name || null,
      created_at: authUser.created_at
    })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) || [];

    // Criar mapa de auth users para acesso rápido
    const authUsersMap = new Map(filteredAuthUsers?.map(u => [u.id, u]) || []);

    // Buscar dados detalhados por usuário COM filtro de período
    const usersWithStats = await Promise.all(
      (recentUsers || []).map(async (user) => {
        // Queries base
        let userLeadsQuery = supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
        let userFaturasCountQuery = supabase.from('faturas').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
        let userFaturasFechadasCountQuery = supabase.from('faturas').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'fechado');
        let userFaturasNegociacaoCountQuery = supabase.from('faturas').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'negociacao');
        let userAgendamentosQuery = supabase.from('agendamentos').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
        let userFaturasQuery = supabase.from('faturas').select('valor, status').eq('user_id', user.id);
        let userEmNegociacaoQuery = supabase.from('faturas').select('valor').eq('user_id', user.id).eq('status', 'negociacao');

        // Aplicar filtro de período se houver
        if (startDate && endDate) {
          userLeadsQuery = userLeadsQuery.gte('created_at', startDate).lte('created_at', endDate);
          userFaturasCountQuery = userFaturasCountQuery.gte('created_at', startDate).lte('created_at', endDate);
          userFaturasFechadasCountQuery = userFaturasFechadasCountQuery.gte('created_at', startDate).lte('created_at', endDate);
          userFaturasNegociacaoCountQuery = userFaturasNegociacaoCountQuery.gte('created_at', startDate).lte('created_at', endDate);
          userAgendamentosQuery = userAgendamentosQuery.gte('created_at', startDate).lte('created_at', endDate);
          userFaturasQuery = userFaturasQuery.gte('created_at', startDate).lte('created_at', endDate);
          userEmNegociacaoQuery = userEmNegociacaoQuery.gte('created_at', startDate).lte('created_at', endDate);
        }

        const [
          { count: userLeadsCount },
          { count: userFaturasCount },
          { count: userFaturasFechadasCount },
          { count: userFaturasNegociacaoCount },
          { count: userAgendamentosCount },
          { data: userFaturas },
          { data: userEmNegociacaoFaturas }
        ] = await Promise.all([
          userLeadsQuery,
          userFaturasCountQuery,
          userFaturasFechadasCountQuery,
          userFaturasNegociacaoCountQuery,
          userAgendamentosQuery,
          userFaturasQuery,
          userEmNegociacaoQuery
        ]);

        const totalFaturado = (userFaturas || []).reduce((sum, f) => sum + (Number(f.valor) || 0), 0);
        const totalPago = (userFaturas || []).filter(f => f.status === 'fechado').reduce((sum, f) => sum + (Number(f.valor) || 0), 0);
        const emNegociacaoValor = (userEmNegociacaoFaturas || []).reduce((sum, f) => sum + (Number(f.valor) || 0), 0);

        // Pegar dados do auth user
        const authUser = authUsersMap.get(user.id);

        return {
          ...user,
          banned_until: (authUser as any)?.banned_until || null,
          user_metadata: authUser?.user_metadata || {},
          leadsCount: userLeadsCount || 0,
          faturasCount: userFaturasCount || 0,
          faturasCountFechadas: userFaturasFechadasCount || 0,
          faturasCountNegociacao: userFaturasNegociacaoCount || 0,
          agendamentosCount: userAgendamentosCount || 0,
          totalFaturado,
          totalPago,
          emNegociacao: emNegociacaoValor
        };
      })
    );

    console.log('[ADMIN_METRICS] Results:', {
      totalUsers: usersWithStats.length,
      totalLeads,
      totalClientes,
      totalAgendamentos,
      totalFaturas,
    });


    // Buscar leads e agendamentos por período
    const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const defaultEndDate = new Date().toISOString();
    const queryStartDate = startDate || defaultStartDate;
    const queryEndDate = endDate || defaultEndDate;
    
    let leadsDataQuery = supabase
      .from('leads')
      .select('created_at')
      .gte('created_at', queryStartDate)
      .lte('created_at', queryEndDate);
    
    let agendamentosDataQuery = supabase
      .from('agendamentos')
      .select('created_at')
      .gte('created_at', queryStartDate)
      .lte('created_at', queryEndDate);

    // Se houver filtro de usuário, aplicar
    if (filterUserId) {
      leadsDataQuery = leadsDataQuery.eq('user_id', filterUserId);
      agendamentosDataQuery = agendamentosDataQuery.eq('user_id', filterUserId);
    } else if (visibleUserIds.length > 0) {
      // Filtrar apenas para usuários visíveis no painel
      leadsDataQuery = leadsDataQuery.in('user_id', visibleUserIds);
      agendamentosDataQuery = agendamentosDataQuery.in('user_id', visibleUserIds);
    }

    // Buscar faturas por período
    let faturasDataQuery = supabase
      .from('faturas')
      .select('created_at, valor, status')
      .gte('created_at', queryStartDate)
      .lte('created_at', queryEndDate);

    if (filterUserId) {
      faturasDataQuery = faturasDataQuery.eq('user_id', filterUserId);
    } else if (visibleUserIds.length > 0) {
      faturasDataQuery = faturasDataQuery.in('user_id', visibleUserIds);
    }

    const [
      { data: leadsData },
      { data: agendamentosData },
      { data: faturasData }
    ] = await Promise.all([
      leadsDataQuery,
      agendamentosDataQuery,
      faturasDataQuery
    ]);

    // Agrupar por dia da semana
    const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const weekdayStats: { [key: number]: { leads: number; agendamentos: number; faturamentoAberto: number; faturamentoFechado: number } } = {};

    // Inicializar todos os dias com zero
    for (let i = 0; i < 7; i++) {
      weekdayStats[i] = { leads: 0, agendamentos: 0, faturamentoAberto: 0, faturamentoFechado: 0 };
    }

    // Contar leads por dia da semana
    leadsData?.forEach(lead => {
      const day = new Date(lead.created_at).getDay();
      weekdayStats[day].leads++;
    });

    // Contar agendamentos por dia da semana
    agendamentosData?.forEach(agendamento => {
      const day = new Date(agendamento.created_at).getDay();
      weekdayStats[day].agendamentos++;
    });

    // Somar faturamento por dia da semana e status
    faturasData?.forEach(fatura => {
      const day = new Date(fatura.created_at).getDay();
      const valor = Number(fatura.valor) || 0;
      if (fatura.status === 'fechado') {
        weekdayStats[day].faturamentoFechado += valor;
      } else {
        weekdayStats[day].faturamentoAberto += valor;
      }
    });

    // Converter para array
    const weekdayData = Object.entries(weekdayStats).map(([day, counts]) => ({
      day: weekdays[parseInt(day)],
      leads: counts.leads,
      agendamentos: counts.agendamentos,
      faturamentoAberto: counts.faturamentoAberto,
      faturamentoFechado: counts.faturamentoFechado
    }));

    // Agrupar por dia para gráfico de linha
    const dailyStats: { [key: string]: { leads: number; agendamentos: number; faturamentoAberto: number; faturamentoFechado: number } } = {};

    // Preencher todos os dias do período com zero primeiro
    const start = new Date(queryStartDate);
    const end = new Date(queryEndDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      dailyStats[dateKey] = { leads: 0, agendamentos: 0, faturamentoAberto: 0, faturamentoFechado: 0 };
    }

    // Contar leads por dia
    leadsData?.forEach(lead => {
      const date = new Date(lead.created_at).toISOString().split('T')[0];
      if (dailyStats[date]) {
        dailyStats[date].leads++;
      }
    });

    // Contar agendamentos por dia
    agendamentosData?.forEach(agendamento => {
      const date = new Date(agendamento.created_at).toISOString().split('T')[0];
      if (dailyStats[date]) {
        dailyStats[date].agendamentos++;
      }
    });

    // Somar faturamento por dia e status
    faturasData?.forEach(fatura => {
      const date = new Date(fatura.created_at).toISOString().split('T')[0];
      if (dailyStats[date]) {
        const valor = Number(fatura.valor) || 0;
        if (fatura.status === 'fechado') {
          dailyStats[date].faturamentoFechado += valor;
        } else {
          dailyStats[date].faturamentoAberto += valor;
        }
      }
    });

    // Converter para array ordenado por data
    const dailyData = Object.entries(dailyStats)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, counts]) => ({
        date: new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        leads: counts.leads,
        agendamentos: counts.agendamentos,
        faturamentoAberto: counts.faturamentoAberto,
        faturamentoFechado: counts.faturamentoFechado
      }));

    console.log('[ADMIN_METRICS] Daily data count:', dailyData.length);
    console.log('[ADMIN_METRICS] Date range:', queryStartDate, 'to', queryEndDate);
    console.log('[ADMIN_METRICS] Sample daily data:', dailyData.slice(0, 3));

    // Calcular métricas baseadas nos usuários que estão realmente na tabela
    const activeUsersInTable = usersWithStats.filter(u => !u.banned_until);
    const calculatedTotalLeads = usersWithStats.reduce((sum, u) => sum + (u.leadsCount || 0), 0);
    const calculatedTotalAgendamentos = usersWithStats.reduce((sum, u) => sum + (u.agendamentosCount || 0), 0);
    const calculatedTotalFaturas = usersWithStats.reduce((sum, u) => sum + (u.faturasCount || 0), 0);
    const calculatedTotalFaturasFechadas = usersWithStats.reduce((sum, u) => sum + (u.faturasCountFechadas || 0), 0);
    const calculatedTotalFaturasNegociacao = usersWithStats.reduce((sum, u) => sum + (u.faturasCountNegociacao || 0), 0);

    console.log('[ADMIN_METRICS] Calculated from table users:', {
      activeUsers: activeUsersInTable.length,
      totalLeads: calculatedTotalLeads,
      totalAgendamentos: calculatedTotalAgendamentos,
      totalFaturas: calculatedTotalFaturas
    });

    return new Response(
      JSON.stringify({
        success: true,
        metrics: {
          totalUsers: usersWithStats.length,
          totalLeads: calculatedTotalLeads,
          totalClientes: totalClientes || 0,
          totalAgendamentos: calculatedTotalAgendamentos,
          totalFaturas: calculatedTotalFaturas,
          totalFaturasFechadas: calculatedTotalFaturasFechadas,
          totalFaturasNegociacao: calculatedTotalFaturasNegociacao,
          totalAuthUsers: activeUsersInTable.length,
          recentUsers: usersWithStats || [],
          weekdayData: weekdayData || [],
          dailyData: dailyData || []
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
