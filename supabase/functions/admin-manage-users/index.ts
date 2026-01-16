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

    const { action, userId, email, password, fullName, expiryDate, displayOrder, redirectTo } = await req.json();

    switch (action) {
      case 'create': {
        // Criar novo usuário
        const userMetadata: Record<string, any> = { full_name: fullName };
        if (expiryDate) {
          userMetadata.expiry_date = expiryDate;
        }

        const { data: user, error: createError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: userMetadata
        });

        if (createError) throw createError;

        return new Response(
          JSON.stringify({ success: true, user }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'block': {
        // Bloquear usuário
        const { error: blockError } = await supabase.auth.admin.updateUserById(
          userId,
          { ban_duration: '876000h' } // ~100 anos
        );

        if (blockError) throw blockError;

        return new Response(
          JSON.stringify({ success: true, message: 'Usuário bloqueado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'unblock': {
        // Desbloquear usuário
        const { error: unblockError } = await supabase.auth.admin.updateUserById(
          userId,
          { ban_duration: 'none' }
        );

        if (unblockError) throw unblockError;

        return new Response(
          JSON.stringify({ success: true, message: 'Usuário desbloqueado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list': {
        // Listar todos os usuários
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

        if (listError) throw listError;

        return new Response(
          JSON.stringify({ success: true, users }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'generate_link': {
        // Gerar link mágico para login como usuário
        const origin = req.headers.get('origin') || 'https://nokta-clinic-flow.lovable.app';
        // Usar redirectTo customizado se fornecido, senão ir para a raiz
        const redirectPath = redirectTo || '/';
        const fullRedirectUrl = `${origin}${redirectPath}`;
        
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: email,
          options: {
            redirectTo: fullRedirectUrl
          }
        });

        if (linkError) throw linkError;

        return new Response(
          JSON.stringify({ 
            success: true, 
            link: linkData.properties?.action_link 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_name': {
        // Atualizar nome do usuário
        const { error: updateError } = await supabase.auth.admin.updateUserById(
          userId,
          { user_metadata: { full_name: fullName } }
        );

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify({ success: true, message: 'Nome atualizado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_order': {
        // Atualizar ordem de exibição do usuário
        const { error: updateError } = await supabase.auth.admin.updateUserById(
          userId,
          { user_metadata: { display_order: displayOrder } }
        );

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify({ success: true, message: 'Ordem atualizada' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_permissions': {
        // Obter permissões de features do usuário
        const { data: permissions, error: getError } = await supabase
          .from('user_feature_access')
          .select('*')
          .eq('user_id', userId);

        if (getError) throw getError;

        return new Response(
          JSON.stringify({ success: true, permissions }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_permissions': {
        // Atualizar permissões de features do usuário
        const { permissions } = await req.json().catch(() => ({ permissions: [] }));
        const body = await req.clone().json();
        const userPermissions = body.permissions || [];

        // Deletar permissões existentes
        const { error: deleteError } = await supabase
          .from('user_feature_access')
          .delete()
          .eq('user_id', userId);

        if (deleteError) throw deleteError;

        // Inserir novas permissões
        if (userPermissions.length > 0) {
          const permissionsToInsert = userPermissions.map((p: { feature_key: string; enabled: boolean }) => ({
            user_id: userId,
            feature_key: p.feature_key,
            enabled: p.enabled
          }));

          const { error: insertError } = await supabase
            .from('user_feature_access')
            .insert(permissionsToInsert);

          if (insertError) throw insertError;
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Permissões atualizadas' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Ação inválida' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
