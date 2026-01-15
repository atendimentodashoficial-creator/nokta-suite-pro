import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { DateRangeCalendars } from "@/components/filters/CalendarWithMonthSelect";
import { cn } from "@/lib/utils";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RefreshCw, Wallet, CreditCard, Building2, AlertTriangle, CheckCircle2, Trash2, CalendarIcon, TrendingUp, Target, Megaphone, XCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";

interface FacebookAccountData {
  id: string;
  name: string;
  balance: number;
  currency: string;
  currency_type?: string;
  is_prepay_account: boolean;
  funding_source_details?: {
    display_string?: string;
    type?: number;
  };
  amount_spent: number;
  spend_in_period?: number;
  daily_budget?: number;
  exchange_rate?: number | null;
  currency_spread?: number;
}
interface LinkedAccount {
  id: string;
  ad_account_id: string;
  account_name: string | null;
  is_prepay_account: boolean | null;
  last_balance: number | null;
  last_sync_at: string | null;
  status: string | null;
}
export function ContaAnunciosTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hasToken, setHasToken] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [accountData, setAccountData] = useState<Record<string, FacebookAccountData>>({});
  const [loadingAccounts, setLoadingAccounts] = useState<Record<string, boolean>>({});

  // Filtros de período
  const [periodFilter, setPeriodFilter] = useState("today");
  const [dateStart, setDateStart] = useState<Date>(new Date());
  const [dateEnd, setDateEnd] = useState<Date>(new Date());
  const [selectedAccount, setSelectedAccount] = useState("all");

  // Filtrar contas baseado na seleção
  const filteredAccounts = selectedAccount === "all" 
    ? linkedAccounts 
    : linkedAccounts.filter(acc => acc.ad_account_id === selectedAccount);
  
  const filteredAccountData = selectedAccount === "all"
    ? accountData
    : Object.fromEntries(
        Object.entries(accountData).filter(([key]) => key === selectedAccount)
      );

  // Calcular totais baseado nas contas filtradas
  const totalSpendInPeriod = Object.values(filteredAccountData).reduce((sum, acc) => sum + (acc.spend_in_period || 0), 0);
  const totalDailyBudget = Object.values(filteredAccountData).reduce((sum, acc) => sum + (acc.daily_budget || 0), 0);
  const totalBalance = Object.values(filteredAccountData).reduce((sum, acc) => sum + (acc.balance || 0), 0);
  useEffect(() => {
    if (user) {
      loadConfig();
      loadLinkedAccounts();
    }
  }, [user]);

  // Atualizar datas quando o período mudar
  useEffect(() => {
    const now = new Date();
    switch (periodFilter) {
      case "today":
        setDateStart(now);
        setDateEnd(now);
        break;
      case "yesterday":
        const yesterday = subDays(now, 1);
        setDateStart(yesterday);
        setDateEnd(yesterday);
        break;
      case "last_7_days":
        setDateStart(subDays(now, 6));
        setDateEnd(now);
        break;
      case "last_30_days":
        setDateStart(subDays(now, 29));
        setDateEnd(now);
        break;
      case "this_week":
        setDateStart(startOfWeek(now, {
          weekStartsOn: 0
        }));
        setDateEnd(endOfWeek(now, {
          weekStartsOn: 0
        }));
        break;
      case "last_week":
        const lastWeekStart = startOfWeek(subDays(now, 7), {
          weekStartsOn: 0
        });
        setDateStart(lastWeekStart);
        setDateEnd(endOfWeek(lastWeekStart, {
          weekStartsOn: 0
        }));
        break;
      case "this_month":
        setDateStart(startOfMonth(now));
        setDateEnd(endOfMonth(now));
        break;
      case "last_month":
        const lastMonth = subMonths(now, 1);
        setDateStart(startOfMonth(lastMonth));
        setDateEnd(endOfMonth(lastMonth));
        break;
      case "max":
        setDateStart(new Date(2020, 0, 1));
        setDateEnd(now);
        break;
      case "custom":
        // Manter as datas atuais
        break;
    }
  }, [periodFilter]);

  // Recarregar dados quando as datas mudarem
  useEffect(() => {
    if (hasToken && linkedAccounts.length > 0) {
      linkedAccounts.forEach(account => {
        fetchAccountData(account.ad_account_id);
      });
    }
  }, [dateStart, dateEnd]);
  const loadConfig = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("facebook_config").select("access_token").eq("user_id", user?.id).maybeSingle();
      if (!error && data?.access_token) {
        setHasToken(true);
      }
    } catch (error) {
      console.error("Error loading config:", error);
    } finally {
      setLoading(false);
    }
  };
  const loadLinkedAccounts = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("facebook_ad_accounts").select("*").eq("user_id", user?.id).order("created_at", {
        ascending: false
      });
      if (!error && data) {
        setLinkedAccounts(data);
        // Carregar dados de cada conta
        data.forEach(account => {
          fetchAccountData(account.ad_account_id);
        });
      }
    } catch (error) {
      console.error("Error loading accounts:", error);
    }
  };
  const fetchAccountData = async (adAccountId: string) => {
    setLoadingAccounts(prev => ({
      ...prev,
      [adAccountId]: true
    }));
    try {
      const {
        data: session
      } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("facebook-ads-api", {
        body: {
          action: "get_account_info",
          ad_account_id: adAccountId,
          date_start: format(dateStart, "yyyy-MM-dd"),
          date_end: format(dateEnd, "yyyy-MM-dd")
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`
        }
      });
      if (response.error || !response.data?.success) {
        console.error("Error fetching account data:", response.data?.error);
        return;
      }
      setAccountData(prev => ({
        ...prev,
        [adAccountId]: response.data.data
      }));
    } catch (error) {
      console.error("Error fetching account data:", error);
    } finally {
      setLoadingAccounts(prev => ({
        ...prev,
        [adAccountId]: false
      }));
    }
  };
  const removeAccount = async (accountId: string) => {
    try {
      const {
        error
      } = await supabase.from("facebook_ad_accounts").delete().eq("id", accountId).eq("user_id", user?.id);
      if (error) throw error;
      setLinkedAccounts(prev => prev.filter(acc => acc.id !== accountId));
      toast({
        title: "Conta removida",
        description: "A conta de anúncios foi desvinculada"
      });
    } catch (error) {
      toast({
        title: "Erro ao remover conta",
        description: "Não foi possível remover a conta",
        variant: "destructive"
      });
    }
  };
  const formatCurrency = (value: number, currency: string = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency
    }).format(value);
  };
  const getFundingSourceName = (type?: number) => {
    const types: Record<number, string> = {
      0: "Cartão de crédito",
      1: "Boleto bancário",
      2: "PayPal",
      3: "Cupom",
      4: "Fatura",
      5: "Crédito do Facebook"
    };
    return types[type || 0] || "Fonte não identificada";
  };
  if (loading) {
    return <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>)}
        </div>
      </div>;
  }
  return <div className="space-y-6">
      {/* Status de Conexão */}
      

      {/* Filtros de Período */}
      {hasToken && linkedAccounts.length > 0 && <Card className="p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-4">
          {/* Conta de Anúncios */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Conta:</span>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-[250px] bg-background">
                <SelectValue placeholder="Todas as contas" />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-lg z-50">
                <SelectItem value="all">Todas as contas</SelectItem>
                {linkedAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.ad_account_id}>
                    {account.account_name || account.ad_account_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Período */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Período:</span>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue placeholder="Selecione o período" />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-lg z-50">
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="yesterday">Ontem</SelectItem>
                <SelectItem value="last_7_days">Últimos 7 dias</SelectItem>
                <SelectItem value="last_30_days">Últimos 30 dias</SelectItem>
                <SelectItem value="this_week">Esta semana</SelectItem>
                <SelectItem value="last_week">Semana passada</SelectItem>
                <SelectItem value="this_month">Este mês</SelectItem>
                <SelectItem value="last_month">Mês passado</SelectItem>
                <SelectItem value="max">Máximo</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {periodFilter === "custom" && (
            <DateRangeCalendars
              dateStart={dateStart}
              dateEnd={dateEnd}
              onDateStartChange={setDateStart}
              onDateEndChange={setDateEnd}
            />
          )}

          <Button 
            variant="outline" 
            onClick={() => linkedAccounts.forEach(account => fetchAccountData(account.ad_account_id))}
            disabled={Object.values(loadingAccounts).some(Boolean)}
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${Object.values(loadingAccounts).some(Boolean) ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </Card>}

      {/* Cards de Resumo */}
      {hasToken && linkedAccounts.length > 0 && <div className="grid gap-4 md:grid-cols-3">
          {/* Card de Saldo na Conta */}
          <Card className={cn(
            "bg-gradient-to-r border",
            totalBalance >= 0 
              ? "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20" 
              : "from-red-500/10 to-red-500/5 border-red-500/20"
          )}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "p-3 rounded-full",
                  totalBalance >= 0 ? "bg-emerald-500/20" : "bg-red-500/20"
                )}>
                  <Wallet className={cn(
                    "h-6 w-6",
                    totalBalance >= 0 ? "text-emerald-500" : "text-red-500"
                  )} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Saldo na Conta</p>
                  <p className={cn(
                    "text-3xl font-bold",
                    totalBalance >= 0 ? "text-emerald-600" : "text-red-600"
                  )}>
                    {formatCurrency(totalBalance, "BRL")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Soma dos saldos de todas as contas
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card de Orçamento Diário */}
          <Card className="bg-gradient-to-r from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-blue-500/20">
                  <Target className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Orçamento Diário Ativo</p>
                  <p className="text-3xl font-bold text-blue-600">
                    {formatCurrency(totalDailyBudget, "BRL")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Soma dos orçamentos ativos
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card de Gasto no Período */}
          <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/20">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Gasto no Período</p>
                  <p className="text-3xl font-bold">
                    {formatCurrency(totalSpendInPeriod, "BRL")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {linkedAccounts.length} conta{linkedAccounts.length > 1 ? "s" : ""} • {format(dateStart, "dd/MM", {
                  locale: ptBR
                })} a {format(dateEnd, "dd/MM", {
                  locale: ptBR
                })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>}

      {/* Seção de Contas Vinculadas */}
      {hasToken && <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Contas de Anúncios Vinculadas</h2>
          </div>

          {filteredAccounts.length === 0 ? <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Megaphone className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-center mb-4">
                  Nenhuma conta de anúncios vinculada.
                </p>
                <Button variant="outline" onClick={() => navigate("/configuracoes")}>
                  Ir para Conexões
                </Button>
              </CardContent>
            </Card> : <div className="overflow-x-auto pb-2 max-w-full"><div className="grid grid-flow-col auto-cols-[minmax(320px,360px)] gap-4">
              {filteredAccounts.map(account => {
          const data = accountData[account.ad_account_id];
          const isLoading = loadingAccounts[account.ad_account_id];
          return <Card key={account.id} className="relative">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">
                            {isLoading ? <Skeleton className="h-5 w-32" /> : data?.name || account.account_name || "Carregando..."}
                          </CardTitle>
                          <CardDescription className="text-xs font-mono">
                            {account.ad_account_id}
                          </CardDescription>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fetchAccountData(account.ad_account_id)} disabled={isLoading}>
                            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover conta?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Isso irá desvincular esta conta de anúncios. Você poderá adicioná-la novamente depois.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => removeAccount(account.id)}>
                                  Remover
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {isLoading ? <div className="space-y-3">
                          <Skeleton className="h-12 w-full" />
                          <Skeleton className="h-6 w-24" />
                          <Skeleton className="h-6 w-32" />
                        </div> : data ? <>
                          {/* Tipo de Conta */}
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {data.is_prepay_account ? "Conta pré-paga" : "Conta pós-paga"}
                            </span>
                          </div>

                          {/* Saldo */}
                          <div className={cn(
                            "flex items-center gap-3 p-3 rounded-lg",
                            data.balance >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"
                          )}>
                            <Wallet className={cn(
                              "h-5 w-5",
                              data.balance >= 0 ? "text-emerald-500" : "text-red-500"
                            )} />
                            <div>
                              <p className="text-xs text-muted-foreground">Saldo da Conta</p>
                              <p className={cn(
                                "text-xl font-bold",
                                data.balance >= 0 ? "text-emerald-600" : "text-red-600"
                              )}>
                                {formatCurrency(data.balance, data.currency)}
                              </p>
                            </div>
                            {data.balance < 0 && <AlertTriangle className="h-5 w-5 text-red-500 ml-auto" />}
                          </div>

                          {/* Orçamento Diário Ativo */}
                          {data.daily_budget !== undefined && data.daily_budget > 0 && (
                            <div className="flex items-center gap-3 p-3 bg-blue-500/10 rounded-lg">
                              <Target className="h-5 w-5 text-blue-500" />
                              <div>
                                <p className="text-xs text-muted-foreground">Orçamento Diário Ativo</p>
                                <p className="text-lg font-bold text-blue-600">
                                  {formatCurrency(data.daily_budget, data.currency)}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Gasto no Período */}
                          {data.spend_in_period !== undefined && (
                            <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg">
                              <TrendingUp className="h-5 w-5 text-primary" />
                              <div>
                                <p className="text-xs text-muted-foreground">Gasto no Período</p>
                                <p className="text-lg font-bold text-primary">
                                  {formatCurrency(data.spend_in_period, data.currency)}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Total Gasto (desde o início) */}
                          <div className="pt-2 border-t">
                            <p className="text-xs text-muted-foreground">
                              Total gasto (desde o início): {formatCurrency(data.amount_spent, data.currency)}
                            </p>
                          </div>
                        </> : <div className="text-center py-4 text-muted-foreground">
                          <XCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Erro ao carregar dados</p>
                          <Button variant="link" size="sm" onClick={() => fetchAccountData(account.ad_account_id)}>
                            Tentar novamente
                          </Button>
                        </div>}
                    </CardContent>
                  </Card>;
        })}
            </div></div>}
        </div>}
    </div>;
}