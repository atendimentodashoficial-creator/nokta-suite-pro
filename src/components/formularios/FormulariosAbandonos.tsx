import { useState } from "react";
import { format, differenceInSeconds } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Eye, AlertTriangle, Clock, Target, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { PeriodFilter, usePeriodFilter } from "@/components/filters/PeriodFilter";
import { useFormulariosSessoes, useFormulariosTemplates, useDeleteSessao, FormularioSessao, FormularioEtapa } from "@/hooks/useFormularios";
import { Skeleton } from "@/components/ui/skeleton";
import AbandonoDetailsDialog from "./AbandonoDetailsDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function FormulariosAbandonos() {
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [selectedSessao, setSelectedSessao] = useState<FormularioSessao | null>(null);
  const [sessaoToDelete, setSessaoToDelete] = useState<string | null>(null);
  
  const { periodFilter, dateStart, dateEnd, setPeriodFilter, setDateStart, setDateEnd } = usePeriodFilter();
  
  const { data: templates } = useFormulariosTemplates();
  const { data: sessoes, isLoading } = useFormulariosSessoes({
    templateId: templateFilter !== "all" ? templateFilter : undefined,
    dateStart,
    dateEnd,
  });
  const deleteSessao = useDeleteSessao();

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Calcular estatísticas de abandono por etapa
  const abandonosPorEtapa = sessoes?.reduce((acc, sessao) => {
    const etapa = sessao.etapa_atual;
    acc[etapa] = (acc[etapa] || 0) + 1;
    return acc;
  }, {} as Record<number, number>) || {};

  const etapaMaisAbandonada = Object.entries(abandonosPorEtapa).sort((a, b) => b[1] - a[1])[0];
  
  const tempoMedioAbandono = sessoes?.length 
    ? Math.round(
        sessoes.reduce((acc, s) => {
          if (s.abandoned_at) {
            return acc + differenceInSeconds(new Date(s.abandoned_at), new Date(s.started_at));
          }
          return acc;
        }, 0) / sessoes.length
      )
    : 0;

  return (
    <div className="space-y-6">
      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Etapa com Mais Abandonos</p>
                <p className="text-2xl font-bold">
                  {etapaMaisAbandonada ? `Etapa ${etapaMaisAbandonada[0]}` : "-"}
                </p>
                {etapaMaisAbandonada && (
                  <p className="text-xs text-muted-foreground">{etapaMaisAbandonada[1]} abandonos</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Abandonos</p>
                <p className="text-2xl font-bold">{sessoes?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tempo Médio até Abandono</p>
                <p className="text-2xl font-bold">{formatDuration(tempoMedioAbandono)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <CardTitle>Formulários Abandonados</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <Select value={templateFilter} onValueChange={setTemplateFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por formulário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {templates?.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <PeriodFilter
              value={periodFilter}
              onChange={setPeriodFilter}
              dateStart={dateStart}
              dateEnd={dateEnd}
              onDateStartChange={setDateStart}
              onDateEndChange={setDateEnd}
              showLabel={false}
            />
          </div>

          {isLoading ? (
            <Skeleton className="h-[400px] w-full" />
          ) : sessoes?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum abandono encontrado
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Início</TableHead>
                    <TableHead>Abandono</TableHead>
                    <TableHead>Etapa Abandonada</TableHead>
                    <TableHead>Progresso</TableHead>
                    <TableHead>Tempo na Sessão</TableHead>
                    <TableHead>Formulário</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessoes?.map((sessao) => {
                    const totalEtapas = sessao.formularios_templates?.formularios_etapas?.length || 1;
                    const progresso = Math.round((sessao.etapa_atual / totalEtapas) * 100);
                    const tempoSessao = sessao.abandoned_at 
                      ? differenceInSeconds(new Date(sessao.abandoned_at), new Date(sessao.started_at))
                      : 0;
                    
                    return (
                      <TableRow key={sessao.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(sessao.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {sessao.abandoned_at 
                            ? format(new Date(sessao.abandoned_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                            : "-"
                          }
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                            Etapa {sessao.etapa_atual}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={progresso} className="w-20 h-2" />
                            <span className="text-sm text-muted-foreground">
                              {sessao.etapa_atual}/{totalEtapas}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{formatDuration(tempoSessao)}</TableCell>
                        <TableCell>{sessao.formularios_templates?.nome || "-"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedSessao(sessao)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSessaoToDelete(sessao.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AbandonoDetailsDialog
        sessao={selectedSessao}
        open={!!selectedSessao}
        onOpenChange={(open) => !open && setSelectedSessao(null)}
      />

      <AlertDialog open={!!sessaoToDelete} onOpenChange={(open) => !open && setSessaoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro de abandono?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O registro será permanentemente removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (sessaoToDelete) {
                  deleteSessao.mutate(sessaoToDelete);
                  setSessaoToDelete(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
