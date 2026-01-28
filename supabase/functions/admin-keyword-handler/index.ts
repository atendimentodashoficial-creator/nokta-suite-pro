import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Admin Keyword Handler
 * 
 * Processes incoming WhatsApp messages and checks if they match admin-configured keywords.
 * When a keyword is detected, it responds with the configured information (balance or report).
 * Includes cooldown to prevent repeated sends.
 */

// Normalize accents for keyword matching
function normalizeAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Check if keyword exists as a whole word in text
function matchesWholeWord(text: string, keyword: string): boolean {
  if (!text || !keyword) return false;
  const normalizedText = normalizeAccents(text);
  const normalizedKeyword = normalizeAccents(keyword);
  const escapedKeyword = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
  return regex.test(normalizedText);
}

interface KeywordHandlerPayload {
  user_id?: string;
  admin_instancia_id?: string;
  phone: string;
  message_text: string;
}

function getLast8Digits(phone: string): string {
  return String(phone || '').replace(/\D/g, '').slice(-8);
}

// Check if cooldown period has passed
function isCooldownActive(lastSentAt: string | null, cooldownHours: number): boolean {
  if (!lastSentAt || cooldownHours <= 0) return false;
  const lastSent = new Date(lastSentAt).getTime();
  const now = Date.now();
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  return (now - lastSent) < cooldownMs;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[admin-keyword-handler] Starting...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: KeywordHandlerPayload = await req.json();
    const { user_id, admin_instancia_id, phone, message_text } = body;

    if (!phone || !message_text || (!user_id && !admin_instancia_id)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let resolvedUserId = user_id || null;
    let notifConfig: any = null;
    let configError: any = null;

    if (user_id) {
      console.log(`[admin-keyword-handler] Processing (user mode) for user ${user_id}, phone: ${phone}, text: "${message_text.substring(0, 50)}..."`);

      const res = await supabase
        .from('admin_client_notifications')
        .select(`
          *,
          admin_notification_instances:admin_instancia_id (
            id,
            base_url,
            api_key,
            is_active
          )
        `)
        .eq('user_id', user_id)
        .maybeSingle();

      notifConfig = res.data;
      configError = res.error;
    } else {
      console.log(`[admin-keyword-handler] Processing (admin instance mode) for admin_instancia_id ${admin_instancia_id}, phone: ${phone}, text: "${message_text.substring(0, 50)}..."`);

      const res = await supabase
        .from('admin_client_notifications')
        .select(`
          *,
          admin_notification_instances:admin_instancia_id (
            id,
            base_url,
            api_key,
            is_active
          )
        `)
        .eq('admin_instancia_id', admin_instancia_id)
        .eq('keyword_enabled', true)
        .limit(250);

      if (res.error) {
        configError = res.error;
      } else {
        const incomingLast8 = getLast8Digits(phone);
        const matched = (res.data || []).find((c: any) =>
          c?.destination_type === 'number' &&
          c?.destination_value &&
          getLast8Digits(c.destination_value) === incomingLast8
        );

        if (!matched) {
          console.log('[admin-keyword-handler] No notification config matched for incoming phone');
          return new Response(
            JSON.stringify({ success: false, matched: false, reason: 'No config matched for phone' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        notifConfig = matched;
        resolvedUserId = matched.user_id;
      }
    }

    if (configError) {
      console.error('[admin-keyword-handler] Error fetching config:', configError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch config' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!notifConfig) {
      console.log('[admin-keyword-handler] No notification config found for user');
      return new Response(
        JSON.stringify({ success: false, matched: false, reason: 'No config found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if keyword feature is enabled
    if (!notifConfig.keyword_enabled) {
      console.log('[admin-keyword-handler] Keywords not enabled for user');
      return new Response(
        JSON.stringify({ success: false, matched: false, reason: 'Keywords not enabled' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminInstance = notifConfig.admin_notification_instances;
    if (!adminInstance || !adminInstance.is_active) {
      console.log('[admin-keyword-handler] No active admin instance configured');
      return new Response(
        JSON.stringify({ success: false, matched: false, reason: 'No admin instance configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const keywordBalance = notifConfig.keyword_balance || 'saldo';
    const keywordReport = notifConfig.keyword_report || 'relatorio';
    const cooldownHours = notifConfig.keyword_cooldown_hours ?? 1;

    let matchedKeyword: 'balance' | 'report' | null = null;

    // Check for balance keyword
    if (matchesWholeWord(message_text, keywordBalance)) {
      matchedKeyword = 'balance';
      console.log(`[admin-keyword-handler] Matched balance keyword: "${keywordBalance}"`);
    }
    // Check for report keyword
    else if (matchesWholeWord(message_text, keywordReport)) {
      matchedKeyword = 'report';
      console.log(`[admin-keyword-handler] Matched report keyword: "${keywordReport}"`);
    }

    if (!matchedKeyword) {
      console.log('[admin-keyword-handler] No keyword matched');
      return new Response(
        JSON.stringify({ success: true, matched: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check cooldown
    const lastSentField = matchedKeyword === 'balance' 
      ? 'keyword_last_balance_sent_at' 
      : 'keyword_last_report_sent_at';
    const lastSentAt = notifConfig[lastSentField];

    if (isCooldownActive(lastSentAt, cooldownHours)) {
      const hoursRemaining = Math.ceil((cooldownHours * 60 * 60 * 1000 - (Date.now() - new Date(lastSentAt).getTime())) / (60 * 60 * 1000));
      console.log(`[admin-keyword-handler] Cooldown active for ${matchedKeyword}, ${hoursRemaining}h remaining`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          matched: true, 
          keyword: matchedKeyword,
          skipped: true,
          reason: `Cooldown active (${hoursRemaining}h remaining)` 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the destination phone number
    let destinationPhone = phone;
    if (notifConfig.destination_type === 'number' && notifConfig.destination_value) {
      destinationPhone = notifConfig.destination_value;
    }

    // Prepare the response message based on keyword type
    let responseMessage = '';

    if (matchedKeyword === 'balance') {
      // Fetch Meta Ads balance for this user
      console.log('[admin-keyword-handler] Fetching Meta Ads balance...');
      
      try {
        // Get user's Facebook Ad Accounts
        const { data: adAccounts } = await supabase
          .from('facebook_ad_accounts')
          .select('ad_account_id, account_name, account_type')
          .eq('user_id', resolvedUserId)
          .limit(5);

        let saldoDetalhado = '';

        if (!adAccounts || adAccounts.length === 0) {
          saldoDetalhado = '❌ Nenhuma conta de anúncios configurada.';
        } else {
          // Get balance for each account
          const balances: string[] = [];
          
          for (const account of adAccounts) {
            const { data: tokenData } = await supabase
              .from('facebook_tokens')
              .select('access_token')
              .eq('user_id', resolvedUserId)
              .maybeSingle();

            if (tokenData?.access_token) {
              try {
                const fbResponse = await fetch(
                  `https://graph.facebook.com/v22.0/act_${account.ad_account_id}?fields=balance,spend_cap,amount_spent,currency&access_token=${tokenData.access_token}`
                );
                
                if (fbResponse.ok) {
                  const fbData = await fbResponse.json();
                  const balance = parseFloat(fbData.balance || '0') / 100;
                  const currency = fbData.currency || 'BRL';
                  const formattedBalance = balance.toLocaleString('pt-BR', { 
                    style: 'currency', 
                    currency 
                  });
                  
                  balances.push(`• ${account.account_name || account.ad_account_id}: ${formattedBalance}`);
                }
              } catch (err) {
                console.error(`[admin-keyword-handler] Error fetching balance for ${account.ad_account_id}:`, err);
              }
            }
          }

          if (balances.length > 0) {
            saldoDetalhado = balances.join('\n');
          } else {
            saldoDetalhado = '⚠️ Não foi possível obter o saldo. Verifique a conexão com o Meta Ads.';
          }
        }

        // Use custom message template or default
        const messageTemplate = notifConfig.keyword_balance_message || '💰 *Saldo Meta Ads*\n\n{saldo_detalhado}';
        responseMessage = messageTemplate.replace('{saldo_detalhado}', saldoDetalhado);

      } catch (err) {
        console.error('[admin-keyword-handler] Error fetching balance:', err);
        responseMessage = '❌ Erro ao consultar o saldo. Tente novamente mais tarde.';
      }
    } else if (matchedKeyword === 'report') {
      // Generate report with Meta Ads data
      console.log('[admin-keyword-handler] Generating report...');

      try {
        const reportPeriod = parseInt(notifConfig.keyword_report_period || notifConfig.campaign_report_period || '7');
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - reportPeriod);

        const formatDate = (d: Date) => d.toLocaleDateString('pt-BR');

        // Get user's Facebook config and accounts
        const { data: fbConfig } = await supabase
          .from('facebook_config')
          .select('access_token')
          .eq('user_id', resolvedUserId)
          .maybeSingle();

        const { data: adAccounts } = await supabase
          .from('facebook_ad_accounts')
          .select('ad_account_id')
          .eq('user_id', resolvedUserId)
          .limit(5);

        let gasto = 0;
        let conversas = 0;
        let cliques = 0;
        let impressoes = 0;
        let alcance = 0;

        if (fbConfig?.access_token && adAccounts?.length) {
          const dateRange = `time_range={'since':'${startDate.toISOString().split('T')[0]}','until':'${endDate.toISOString().split('T')[0]}'}`;
          
          for (const account of adAccounts) {
            try {
              const insightsUrl = `https://graph.facebook.com/v22.0/act_${account.ad_account_id}/insights?fields=spend,actions,clicks,impressions,reach&${dateRange}&access_token=${fbConfig.access_token}`;
              const response = await fetch(insightsUrl);
              
              if (response.ok) {
                const data = await response.json();
                const insights = data.data?.[0];
                if (insights) {
                  gasto += parseFloat(insights.spend || '0');
                  cliques += parseInt(insights.clicks || '0');
                  impressoes += parseInt(insights.impressions || '0');
                  alcance += parseInt(insights.reach || '0');
                  
                  // Count messaging_conversation_started actions
                  const actions = insights.actions || [];
                  const convAction = actions.find((a: any) => 
                    a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
                    a.action_type === 'messaging_conversation_started_7d'
                  );
                  if (convAction) {
                    conversas += parseInt(convAction.value || '0');
                  }
                }
              }
            } catch (err) {
              console.error(`[admin-keyword-handler] Error fetching insights for ${account.ad_account_id}:`, err);
            }
          }
        }

        const custoConversa = conversas > 0 ? (gasto / conversas).toFixed(2) : '0.00';
        const cpc = cliques > 0 ? (gasto / cliques).toFixed(2) : '0.00';

        // Use custom message template or default
        const messageTemplate = notifConfig.keyword_report_message || `📊 *Relatório de Campanhas*

Período: {data_inicio} a {data_fim}

🔹 *Gasto:* R$ {gasto}
🔹 *Leads:* {conversas}
🔹 *Custo por Lead:* R$ {custo_conversa}
🔹 *Cliques:* {cliques}
🔹 *Impressões:* {impressoes}`;

        responseMessage = messageTemplate
          .replace('{data_inicio}', formatDate(startDate))
          .replace('{data_fim}', formatDate(endDate))
          .replace('{gasto}', gasto.toFixed(2))
          .replace('{conversas}', String(conversas))
          .replace('{custo_conversa}', custoConversa)
          .replace('{cliques}', String(cliques))
          .replace('{impressoes}', impressoes.toLocaleString('pt-BR'))
          .replace('{alcance}', alcance.toLocaleString('pt-BR'))
          .replace('{cpc}', cpc);

      } catch (err) {
        console.error('[admin-keyword-handler] Error generating report:', err);
        responseMessage = '❌ Erro ao gerar relatório. Tente novamente mais tarde.';
      }
    }

    // Send the response message via the admin's WhatsApp instance
    console.log(`[admin-keyword-handler] Sending response to ${destinationPhone}...`);
    
    const normalizedBaseUrl = adminInstance.base_url.replace(/\/+$/, '');
    
    const sendResponse = await fetch(`${normalizedBaseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': adminInstance.api_key,
      },
      body: JSON.stringify({
        number: destinationPhone,
        text: responseMessage,
      }),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error(`[admin-keyword-handler] Failed to send message: ${errorText}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send response message', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update last sent timestamp
    const updateField = matchedKeyword === 'balance' 
      ? { keyword_last_balance_sent_at: new Date().toISOString() }
      : { keyword_last_report_sent_at: new Date().toISOString() };

    await supabase
      .from('admin_client_notifications')
      .update(updateField)
      .eq('user_id', resolvedUserId);

    console.log(`[admin-keyword-handler] Response sent successfully! Updated ${Object.keys(updateField)[0]}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        matched: true, 
        keyword: matchedKeyword, 
        destination: destinationPhone,
        message_sent: true 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[admin-keyword-handler] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});