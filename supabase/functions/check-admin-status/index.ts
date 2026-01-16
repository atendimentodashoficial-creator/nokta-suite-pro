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
        JSON.stringify({ isAdmin: false }),
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
        JSON.stringify({ isAdmin: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Usar service role para verificar tabela admin_users
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const normalizedEmail = (user.email ?? "").trim().toLowerCase();

    // Verificar se o email do usuário existe na tabela admin_users (case-insensitive)
    const { data: adminUser, error: adminError } = await supabaseAdmin
      .from('admin_users')
      .select('id, email')
      .ilike('email', normalizedEmail)
      .maybeSingle();
    
    if (adminError) {
      console.error('Erro ao verificar admin:', adminError);
      return new Response(
        JSON.stringify({ isAdmin: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!adminUser) {
      return new Response(
        JSON.stringify({ isAdmin: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
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
    const { data: adminEmails } = await supabaseAdmin
      .from('admin_users')
      .select('email');

    const adminEmailSet = new Set((adminEmails || []).map(a => (a.email || '').trim().toLowerCase()));

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
        users: filteredUsers 
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
