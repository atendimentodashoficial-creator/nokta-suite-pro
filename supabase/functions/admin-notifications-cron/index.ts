import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

/**
 * Admin Notifications Cron
 * 
 * Processes scheduled admin notifications:
 * 1. Low balance alerts - checks if any client's Meta Ads balance is below threshold
 * 2. Scheduled campaign reports - sends reports on configured day/time
 * 
 * This function should be called by pg_cron every minute
 */

function getSaoPauloTime(): Date {
  const now = new Date();
  const saoPauloOffset = -3 * 60; // UTC-3
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcTime + (saoPauloOffset * 60000));
}

function isCooldownActive(lastSentAt: string | null, cooldownHours: number): boolean {
  if (!lastSentAt || cooldownHours <= 0) return false;
  const lastSent = new Date(lastSentAt).getTime();
  const now = Date.now();
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  return (now - lastSent) < cooldownMs;
}

async function getExchangeRate(): Promise<number> {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (response.ok) {
      const data = await response.json();
      if (data?.rates?.BRL) {
        return data.rates.BRL;
      }
    }
  } catch (e) {
    console.log('[admin-notifications-cron] Exchange rate fetch failed, using fallback');
  }
  return 5.37; // fallback
}

async function getAccountBalance(
  supabase: any,
  userId: string,
  exchangeRate: number
): Promise<{ balance: number; hasAccount: boolean; fetchError: boolean }> {
  // Get user's Facebook Ad Account
  const { data: adAccount } = await supabase
    .from('facebook_ad_accounts')
    .select('ad_account_id, account_name, account_type, currency_type, currency_spread, manual_funds_balance')
    .eq('user_id', userId)
    .eq('status', 'connected')
    .order('last_sync_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!adAccount) {
    return { balance: 0, hasAccount: false, fetchError: false };
  }

  // Get user's Facebook token
  const { data: fbConfig } = await supabase
    .from('facebook_config')
    .select('access_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (!fbConfig?.access_token) {
    return { balance: 0, hasAccount: false, fetchError: false };
  }

  try {
    const normalizedAccountId = adAccount.ad_account_id.startsWith('act_')
      ? adAccount.ad_account_id
      : `act_${adAccount.ad_account_id}`;

    const fbResponse = await fetch(
      `https://graph.facebook.com/v22.0/${normalizedAccountId}?fields=balance,spend_cap,is_prepay_account,amount_spent&access_token=${fbConfig.access_token}`
    );

    if (!fbResponse.ok) {
      console.error(`[admin-notifications-cron] FB API error for user ${userId}, status: ${fbResponse.status}`);
      return { balance: 0, hasAccount: true, fetchError: true };
    }

    const fbData = await fbResponse.json();
    if (fbData.error) {
      console.error(`[admin-notifications-cron] FB API error:`, fbData.error);
      return { balance: 0, hasAccount: true, fetchError: true };
    }

    const isPrepaid = adAccount.account_type === 'prepaid' || fbData.is_prepay_account;
    const balanceCents = fbData.balance ? parseInt(String(fbData.balance)) : 0;
    const spendCapCents = fbData.spend_cap ? parseInt(String(fbData.spend_cap)) : 0;
    const amountSpentCents = fbData.amount_spent ? parseInt(String(fbData.amount_spent)) : 0;

    let rawBalance = balanceCents / 100;
    let spendCap = spendCapCents / 100;
    let amountSpent = amountSpentCents / 100;

    console.log(`[admin-notifications-cron] User ${userId} FB API raw values: balance=${rawBalance}, spend_cap=${spendCap}, amount_spent=${amountSpent}, isPrepaid=${isPrepaid}, account_type=${adAccount.account_type}, is_prepay_account=${fbData.is_prepay_account}, manual_funds=${adAccount.manual_funds_balance}`);

    let displayBalance: number;
    if (isPrepaid) {
      if (spendCap > 0) {
        displayBalance = spendCap - amountSpent;
      } else {
        displayBalance = rawBalance;
      }
    } else {
      if (adAccount.manual_funds_balance && adAccount.manual_funds_balance > 0) {
        displayBalance = adAccount.manual_funds_balance - rawBalance;
      } else {
        displayBalance = -rawBalance;
      }
    }

    console.log(`[admin-notifications-cron] User ${userId} displayBalance before currency: ${displayBalance}, currency: ${adAccount.currency_type}`);

    // Convert if USD account
    if (adAccount.currency_type === 'USD') {
      const spreadMultiplier = 1 + ((adAccount.currency_spread || 0) / 100);
      const effectiveRate = exchangeRate * spreadMultiplier;
      displayBalance = displayBalance * effectiveRate;
    }

    return { balance: displayBalance, hasAccount: true, fetchError: false };
  } catch (err) {
    console.error(`[admin-notifications-cron] Error fetching balance for user ${userId}:`, err);
    return { balance: 0, hasAccount: true, fetchError: true };
  }
}

async function generateReportMessage(
  supabase: any,
  userId: string,
  reportPeriod: number,
  messageTemplate: string,
  exchangeRate: number
): Promise<string> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - reportPeriod);

  const formatDate = (d: Date) => d.toLocaleDateString('pt-BR');
  const formatDateISO = (d: Date) => d.toISOString().split('T')[0];

  // Get user's Facebook config
  const { data: fbConfig } = await supabase
    .from('facebook_config')
    .select('access_token')
    .eq('user_id', userId)
    .maybeSingle();

  // Get user's ad accounts
  const { data: adAccounts } = await supabase
    .from('facebook_ad_accounts')
    .select('ad_account_id, currency_type, currency_spread')
    .eq('user_id', userId)
    .eq('status', 'connected');

  let gasto = 0;
  let conversas = 0;
  let cliques = 0;
  let impressoes = 0;
  let alcance = 0;

  if (fbConfig?.access_token && adAccounts?.length) {
    const timeRangeValue = JSON.stringify({
      since: formatDateISO(startDate),
      until: formatDateISO(endDate)
    });

    for (const account of adAccounts) {
      try {
        const normalizedAccountId = account.ad_account_id.startsWith('act_')
          ? account.ad_account_id
          : `act_${account.ad_account_id}`;

        const insightsUrl = `https://graph.facebook.com/v22.0/${normalizedAccountId}/insights?fields=spend,actions,clicks,impressions,reach&time_range=${encodeURIComponent(timeRangeValue)}&access_token=${fbConfig.access_token}`;

        const response = await fetch(insightsUrl);

        if (response.ok) {
          const data = await response.json();
          const insights = data.data?.[0];

          if (insights) {
            let accountSpend = parseFloat(insights.spend || '0');

            if (account.currency_type === 'USD') {
              const spreadMultiplier = 1 + ((account.currency_spread || 0) / 100);
              const effectiveRate = exchangeRate * spreadMultiplier;
              accountSpend = accountSpend * effectiveRate;
            }

            gasto += accountSpend;
            cliques += parseInt(insights.clicks || '0');
            impressoes += parseInt(insights.impressions || '0');
            alcance += parseInt(insights.reach || '0');

            const actions = insights.actions || [];
            const messagingActions = [
              'onsite_conversion.messaging_conversation_started_7d',
              'onsite_conversion.messaging_first_reply',
              'messaging_conversation_started_7d'
            ];

            for (const actionType of messagingActions) {
              const convAction = actions.find((a: any) => a.action_type === actionType);
              if (convAction) {
                conversas += parseInt(convAction.value || '0');
                break;
              }
            }
          }
        }
      } catch (err) {
        console.error(`[admin-notifications-cron] Error fetching insights for ${account.ad_account_id}:`, err);
      }
    }
  }

  const custoConversa = conversas > 0 ? (gasto / conversas).toFixed(2) : '0.00';
  const cpc = cliques > 0 ? (gasto / cliques).toFixed(2) : '0.00';
  const cpm = impressoes > 0 ? ((gasto / impressoes) * 1000).toFixed(2) : '0.00';
  const ctr = impressoes > 0 ? ((cliques / impressoes) * 100).toFixed(2) : '0.00';

  return messageTemplate
    .replace('{data_inicio}', formatDate(startDate))
    .replace('{data_fim}', formatDate(endDate))
    .replace('{periodo_dias}', String(reportPeriod))
    .replace('{gasto}', gasto.toFixed(2))
    .replace('{conversas}', String(conversas))
    .replace('{custo_conversa}', custoConversa)
    .replace('{cliques}', String(cliques))
    .replace('{cpc}', cpc)
    .replace('{cpm}', cpm)
    .replace('{ctr}', ctr)
    .replace('{impressoes}', impressoes.toLocaleString('pt-BR'))
    .replace('{alcance}', alcance.toLocaleString('pt-BR'));
}

async function sendWhatsAppMessage(
  baseUrl: string,
  apiKey: string,
  phone: string,
  message: string
): Promise<boolean> {
  try {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const response = await fetch(`${normalizedBaseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': apiKey,
      },
      body: JSON.stringify({
        number: phone,
        text: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[admin-notifications-cron] Failed to send message: ${errorText}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[admin-notifications-cron] Error sending message:`, err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

  // Validate cron secret
  const cronHeader = req.headers.get('X-Cron-Secret') ?? '';
  if (!CRON_SECRET || cronHeader !== CRON_SECRET) {
    console.error('[admin-notifications-cron] Invalid or missing cron secret');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[admin-notifications-cron] Missing backend env vars');
    return new Response(JSON.stringify({ error: 'Missing backend env vars' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const saoPauloNow = getSaoPauloTime();
    const currentDayOfWeek = saoPauloNow.getDay(); // 0 = Sunday
    const currentTime = `${String(saoPauloNow.getHours()).padStart(2, '0')}:${String(saoPauloNow.getMinutes()).padStart(2, '0')}`;

    console.log(`[admin-notifications-cron] Starting at ${saoPauloNow.toISOString()} (São Paulo)`);
    console.log(`[admin-notifications-cron] Day: ${currentDayOfWeek}, Time: ${currentTime}`);

    // Get all notification configs with their admin instances
    const { data: configs, error: configsError } = await supabase
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
      .not('admin_instancia_id', 'is', null);

    if (configsError) {
      console.error('[admin-notifications-cron] Error fetching configs:', configsError);
      throw configsError;
    }

    if (!configs || configs.length === 0) {
      console.log('[admin-notifications-cron] No notification configs found');
      return new Response(
        JSON.stringify({ success: true, message: 'No configs to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-notifications-cron] Found ${configs.length} configs to check`);

    const exchangeRate = await getExchangeRate();
    console.log(`[admin-notifications-cron] Exchange rate: ${exchangeRate}`);

    const results = {
      lowBalanceAlerts: 0,
      scheduledReports: 0,
      errors: 0,
    };

    for (const config of configs) {
      const adminInstance = config.admin_notification_instances;
      console.log(`[admin-notifications-cron] Processing config for user ${config.user_id}, instance: ${adminInstance?.nome || 'none'}`);
      
      if (!adminInstance || !adminInstance.is_active) {
        console.log(`[admin-notifications-cron] Skipping user ${config.user_id}: no active instance`);
        continue;
      }

      // Get destination phone - support both number and group
      let destinationPhone = config.destination_value;
      if (!destinationPhone) {
        console.log(`[admin-notifications-cron] Skipping user ${config.user_id}: no destination configured`);
        continue;
      }

      console.log(`[admin-notifications-cron] User ${config.user_id} destination: ${config.destination_type} -> ${destinationPhone}`);

      // === Check Low Balance Alerts ===
      if (config.low_balance_enabled && config.low_balance_threshold > 0) {
        const cooldownHours = config.low_balance_cooldown_hours ?? 24;
        const cooldownActive = isCooldownActive(config.low_balance_last_sent_at, cooldownHours);
        
        console.log(`[admin-notifications-cron] User ${config.user_id} low_balance check: enabled=${config.low_balance_enabled}, threshold=${config.low_balance_threshold}, cooldown=${cooldownActive}, lastSent=${config.low_balance_last_sent_at}`);
        
        if (!cooldownActive) {
          const { balance, hasAccount, fetchError } = await getAccountBalance(supabase, config.user_id, exchangeRate);
          
          console.log(`[admin-notifications-cron] User ${config.user_id} balance: ${balance}, hasAccount: ${hasAccount}, fetchError: ${fetchError}`);
          
          if (fetchError) {
            console.log(`[admin-notifications-cron] User ${config.user_id} skipped low balance alert: could not fetch balance from API`);
          } else if (hasAccount && balance < config.low_balance_threshold) {
            console.log(`[admin-notifications-cron] Low balance alert for user ${config.user_id}: ${balance} < ${config.low_balance_threshold}`);
            
            const messageTemplate = config.low_balance_message || '⚠️ *Alerta de Saldo Baixo*\n\nSeu saldo atual é R$ {saldo}.\nLimite configurado: R$ {limite}';
            const message = messageTemplate
              .replace('{saldo}', balance.toFixed(2))
              .replace('{limite}', config.low_balance_threshold.toFixed(2));

            const sent = await sendWhatsAppMessage(
              adminInstance.base_url,
              adminInstance.api_key,
              destinationPhone,
              message
            );

            if (sent) {
              await supabase
                .from('admin_client_notifications')
                .update({ low_balance_last_sent_at: new Date().toISOString() })
                .eq('id', config.id);
              
              results.lowBalanceAlerts++;
              console.log(`[admin-notifications-cron] Low balance alert sent for user ${config.user_id}`);
            } else {
              console.log(`[admin-notifications-cron] Failed to send low balance alert for user ${config.user_id}`);
              results.errors++;
            }
          } else {
            console.log(`[admin-notifications-cron] User ${config.user_id} balance OK or no account: balance=${balance}, threshold=${config.low_balance_threshold}`);
          }
        } else {
          console.log(`[admin-notifications-cron] User ${config.user_id} skipped due to cooldown`);
        }
      }

      // === Check Scheduled Reports ===
      if (config.campaign_reports_enabled) {
        const reportDayOfWeek = config.report_day_of_week ?? 1; // Default Monday
        const reportTime = config.report_time ?? '09:00';

        // Check if it's the right day and time (within 1 minute window)
        if (currentDayOfWeek === reportDayOfWeek && currentTime === reportTime) {
          console.log(`[admin-notifications-cron] Time to send scheduled report for user ${config.user_id}`);

          const reportPeriod = parseInt(config.campaign_report_period || '7');
          const messageTemplate = config.campaign_report_message || `📊 *Relatório de Campanhas*

Período: {data_inicio} a {data_fim}

🔹 *Gasto:* R$ {gasto}
🔹 *Leads:* {conversas}
🔹 *Custo por Lead:* R$ {custo_conversa}
🔹 *Cliques:* {cliques}
🔹 *CPC:* R$ {cpc}
🔹 *Impressões:* {impressoes}
🔹 *Alcance:* {alcance}`;

          const message = await generateReportMessage(
            supabase,
            config.user_id,
            reportPeriod,
            messageTemplate,
            exchangeRate
          );

          const sent = await sendWhatsAppMessage(
            adminInstance.base_url,
            adminInstance.api_key,
            destinationPhone,
            message
          );

          if (sent) {
            results.scheduledReports++;
            console.log(`[admin-notifications-cron] Scheduled report sent for user ${config.user_id}`);
          } else {
            results.errors++;
          }
        }
      }
    }

    console.log(`[admin-notifications-cron] Finished. Low balance: ${results.lowBalanceAlerts}, Reports: ${results.scheduledReports}, Errors: ${results.errors}`);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[admin-notifications-cron] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
