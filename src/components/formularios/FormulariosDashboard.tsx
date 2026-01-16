import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserX, UserPlus, Phone, CheckCircle, XCircle, Percent, Clock } from "lucide-react";
import { PeriodFilter, usePeriodFilter } from "@/components/filters/PeriodFilter";
import { useFormulariosDashboard } from "@/hooks/useFormularios";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export default function FormulariosDashboard() {
  const { periodFilter, dateStart, dateEnd, setPeriodFilter, setDateStart, setDateEnd } = usePeriodFilter();
  const { data: stats, isLoading } = useFormulariosDashboard(dateStart, dateEnd);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const cards = [
    { title: "Total de Leads", value: stats?.totalLeads || 0, icon: Users, color: "text-primary" },
    { title: "Abandonados", value: stats?.abandonados || 0, icon: UserX, color: "text-destructive" },
    { title: "Novos", value: stats?.novos || 0, icon: UserPlus, color: "text-blue-500" },
    { title: "Contactados", value: stats?.contactados || 0, icon: Phone, color: "text-yellow-500" },
    { title: "Fechados", value: stats?.fechados || 0, icon: CheckCircle, color: "text-green-500" },
    { title: "Negados", value: stats?.negados || 0, icon: XCircle, color: "text-red-500" },
    { title: "Taxa de Conversão", value: `${stats?.taxaConversao || 0}%`, icon: Percent, color: "text-purple-500" },
    { title: "Tempo Médio", value: formatTime(stats?.tempoMedio || 0), icon: Clock, color: "text-orange-500" },
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <BarChart data={stats?.leadsPorDia || []}>
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
