import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // debug habilitado via body (evita CORS com header custom)
  let debugEnabled = false;
  try {
    const body = await req.clone().json();
    debugEnabled = body?.debug === true;
  } catch {
    // sem body
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ isAdmin: false, ...(debugEnabled ? { debug: { reason: 'missing_auth' } } : {}) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Criar cliente com o token do usuário para obter informações do usuário
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
    
    // Obter o usuário atual
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ isAdmin: false, ...(debugEnabled ? { debug: { reason: 'user_not_found', userError: userError?.message } } : {}) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Usar service role para verificar tabela admin_users
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const normalizedEmail = (user.email ?? "").trim().toLowerCase();

    // Buscar admins e validar em memória (evita problemas de case/espacos)
    const { data: adminUsers, error: adminListError } = await supabaseAdmin
      .from('admin_users')
      .select('id, email');

    if (adminListError) {
      console.error('Erro ao buscar admins:', adminListError);
      return new Response(
        JSON.stringify({ isAdmin: false, ...(debugEnabled ? { debug: { reason: 'admin_list_error', adminListError: adminListError.message } } : {}) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminUser = (adminUsers || []).find(a => (a.email || '').trim().toLowerCase() === normalizedEmail);

    if (!adminUser) {
      return new Response(
        JSON.stringify({
          isAdmin: false,
          ...(debugEnabled
            ? {
                debug: {
                  reason: 'email_not_admin',
                  normalizedEmail,
                  adminUsersCount: (adminUsers || []).length,
                  hasExactAdminNokta: (adminUsers || []).some(a => (a.email || '').trim().toLowerCase() === 'admin@nokta.com'),
                },
              }
            : {}),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[check-admin-status] admin OK:', normalizedEmail);

    
    // Usuário é admin! Buscar lista de todos os usuários
    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (usersError) {
      console.error('Erro ao listar usuários:', usersError);
      return new Response(
        JSON.stringify({ isAdmin: true, users: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Filtrar e formatar usuários (excluindo admins da lista)
    const adminEmailSet = new Set((adminUsers || []).map(a => (a.email || '').trim().toLowerCase()));

    const filteredUsers = usersData.users
      .filter(u => !adminEmailSet.has((u.email || '').trim().toLowerCase()))
      .sort((a, b) => {
        const orderA = (a.user_metadata as any)?.display_order ?? 999;
        const orderB = (b.user_metadata as any)?.display_order ?? 999;
        return orderA - orderB;
      })
      .map(u => ({
        id: u.id,
        email: u.email,
        user_metadata: u.user_metadata
      }));
    
    // Gerar um token admin simples para uso nas requisições subsequentes
    // Usamos o ID do admin como base
    const adminToken = btoa(`admin:${adminUser.id}:${Date.now()}`);
    
    return new Response(
      JSON.stringify({
        isAdmin: true,
        adminToken,
        users: filteredUsers,
        ...(debugEnabled
          ? {
              debug: {
                reason: "admin_ok",
                normalizedEmail,
                adminUserId: adminUser.id,
                returnedUsers: filteredUsers.length,
              },
            }
          : {}),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: any) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ isAdmin: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
