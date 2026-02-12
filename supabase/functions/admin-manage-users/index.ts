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

    const body = await req.json();
    const {
      action,
      userId,
      email,
      password,
      fullName,
      expiryDate,
      displayOrder,
      redirectTo,
      permissions,
      destinationType,
      destinationValue,
      lowBalanceEnabled,
      lowBalanceThreshold,
      lowBalanceMessage,
      lowBalanceCooldownHours,
      campaignReportsEnabled,
      campaignReportMessage,
      campaignReportPeriod,
      reportDayOfWeek,
      reportTime,
      keywordEnabled,
      keywordBalance,
      keywordReport,
      keywordBalanceMessage,
      keywordReportMessage,
      keywordReportPeriod,
      keywordCooldownHours,
      adminInstanciaId,
      instanceId,
    } = body;

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

      case 'update_password': {
        // Atualizar senha do usuário
        const { error: updateError } = await supabase.auth.admin.updateUserById(
          userId,
          { password }
        );

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify({ success: true, message: 'Senha atualizada' }),
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
        const userPermissions = permissions || [];

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

      case 'get_notification_config': {
        // Obter configuração de notificações do cliente
        const { data: config, error: getError } = await supabase
          .from('admin_client_notifications')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (getError) throw getError;

        return new Response(
          JSON.stringify({ success: true, config }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_notification_config': {
        // Upsert configuração - dados já extraídos do body acima
        const { error: upsertError } = await supabase
          .from('admin_client_notifications')
          .upsert({
            user_id: userId,
            destination_type: destinationType || 'number',
            destination_value: destinationValue || null,
            low_balance_enabled: lowBalanceEnabled ?? true,
            low_balance_threshold: lowBalanceThreshold ?? 100,
            low_balance_message: lowBalanceMessage || null,
            low_balance_cooldown_hours: lowBalanceCooldownHours ?? 24,
            campaign_reports_enabled: campaignReportsEnabled ?? true,
            campaign_report_message: campaignReportMessage || null,
            campaign_report_period: campaignReportPeriod || '7',
            report_day_of_week: reportDayOfWeek ?? 1,
            report_time: reportTime || '09:00',
            keyword_enabled: keywordEnabled ?? false,
            keyword_balance: keywordBalance || 'saldo',
            keyword_report: keywordReport || 'relatorio',
            keyword_balance_message: keywordBalanceMessage || null,
            keyword_report_message: keywordReportMessage || null,
            keyword_report_period: keywordReportPeriod || '7',
            keyword_cooldown_hours: keywordCooldownHours ?? 1,
            admin_instancia_id: adminInstanciaId || null,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          });

        if (upsertError) throw upsertError;

        return new Response(
          JSON.stringify({ success: true, message: 'Configuração atualizada' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_all_notification_configs': {
        // Obter todas configurações de notificações (para listar no admin)
        const { data: configs, error: getError } = await supabase
          .from('admin_client_notifications')
          .select('*');

        if (getError) throw getError;

        return new Response(
          JSON.stringify({ success: true, configs }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete_notification_instance': {
        if (!instanceId) {
          return new Response(
            JSON.stringify({ success: false, error: 'instanceId é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 1) Desvincular qualquer cliente que esteja usando essa instância
        const { data: unlinked, error: unlinkError } = await supabase
          .from('admin_client_notifications')
          .update({
            admin_instancia_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('admin_instancia_id', instanceId)
          .select('id');

        if (unlinkError) throw unlinkError;

        // 2) Excluir a instância
        const { error: deleteError } = await supabase
          .from('admin_notification_instances')
          .delete()
          .eq('id', instanceId);

        if (deleteError) throw deleteError;

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Instância removida',
            unlinkedCount: unlinked?.length || 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list_notification_instances': {
        // Listar todas as instâncias de notificação do admin
        const { data: instances, error: listError } = await supabase
          .from('admin_notification_instances')
          .select('*')
          .order('created_at', { ascending: false });

        if (listError) throw listError;

        return new Response(
          JSON.stringify({ success: true, instances }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'create_notification_instance': {
        // Criar nova instância de notificação manualmente (modo manual)
        const { nome, base_url, api_key } = body;
        
        if (!nome || !base_url || !api_key) {
          return new Response(
            JSON.stringify({ success: false, error: 'nome, base_url e api_key são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: instance, error: insertError } = await supabase
          .from('admin_notification_instances')
          .insert({
            nome: nome.trim(),
            base_url: base_url.trim().replace(/\/+$/, ''),
            api_key: api_key.trim(),
            is_active: true,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        return new Response(
          JSON.stringify({ success: true, instance }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update_notification_instance': {
        // Atualizar instância existente (ex: credenciais via aba Credenciais)
        const { instanceId: instId, base_url: newUrl, api_key: newKey } = body;
        
        if (!instId) {
          return new Response(
            JSON.stringify({ success: false, error: 'instanceId é obrigatório' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
        if (newUrl) updateData.base_url = newUrl.trim().replace(/\/+$/, '');
        if (newKey) updateData.api_key = newKey.trim();

        const { data: updated, error: updateError } = await supabase
          .from('admin_notification_instances')
          .update(updateData)
          .eq('id', instId)
          .select()
          .single();

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify({ success: true, instance: updated }),
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
