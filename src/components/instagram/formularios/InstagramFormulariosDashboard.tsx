import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, CheckCircle, Clock } from "lucide-react";
import { PeriodFilter, usePeriodFilter } from "@/components/filters/PeriodFilter";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function InstagramFormulariosDashboard() {
  const { periodFilter, dateStart, dateEnd, setPeriodFilter, setDateStart, setDateEnd } = usePeriodFilter();
  
  const { data: respostas, isLoading } = useQuery({
    queryKey: ["instagram-formularios-dashboard", dateStart, dateEnd],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      
      let query = supabase
        .from("instagram_formularios_respostas")
        .select(`
          *,
          instagram_formularios(nome)
        `)
        .eq("user_id", user.id);
      
      if (dateStart) {
        query = query.gte("created_at", dateStart);
      }
      if (dateEnd) {
        query = query.lte("created_at", dateEnd);
      }
      
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: formularios } = useQuery({
    queryKey: ["instagram-formularios-count"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      
      const { data, error } = await supabase
        .from("instagram_formularios")
        .select("id, ativo")
        .eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
  });

  const stats = useMemo(() => {
    const total = respostas?.length || 0;
    const ativos = formularios?.filter(f => f.ativo).length || 0;
    const totalFormularios = formularios?.length || 0;
    
    return {
      totalLeads: total,
      formularios: totalFormularios,
      formulariosAtivos: ativos,
    };
  }, [respostas, formularios]);

  // Leads por dia (últimos 7 dias)
  const leadsPorDia = useMemo(() => {
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const data = subDays(new Date(), i);
      const dataStr = format(data, "yyyy-MM-dd");
      const leads = respostas?.filter(r => 
        format(parseISO(r.created_at), "yyyy-MM-dd") === dataStr
      ).length || 0;
      
      dias.push({
        date: format(data, "dd/MM", { locale: ptBR }),
        leads,
      });
    }
    return dias;
  }, [respostas]);

  const cards = [
    { title: "Total de Leads", value: stats.totalLeads, icon: Users, color: "text-primary" },
    { title: "Formulários", value: stats.formularios, icon: FileText, color: "text-blue-500" },
    { title: "Formulários Ativos", value: stats.formulariosAtivos, icon: CheckCircle, color: "text-green-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h2 className="text-lg font-semibold">Visão Geral</h2>
        <PeriodFilter
          value={periodFilter}
          onChange={setPeriodFilter}
          dateStart={dateStart}
          dateEnd={dateEnd}
          onDateStartChange={setDateStart}
          onDateEndChange={setDateEnd}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((card, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              {isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted ${card.color}`}>
                    <card.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    <p className="text-2xl font-bold">{card.value}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Leads nos Últimos 7 Dias</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={leadsPorDia}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
