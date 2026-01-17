import { useState } from "react";
import { format, differenceInSeconds } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Eye, AlertTriangle, Clock, Target, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { PeriodFilter, usePeriodFilter } from "@/components/filters/PeriodFilter";
import { useFormulariosSessoes, useFormulariosTemplates, useDeleteSessao, FormularioSessao, FormularioEtapa } from "@/hooks/useFormularios";
import { Skeleton } from "@/components/ui/skeleton";
import AbandonoDetailsDialog from "./AbandonoDetailsDialog";
import { formatPhoneDisplay } from "@/utils/phoneFormat";
import WhatsAppInstanceSelector from "./WhatsAppInstanceSelector";
import { toast } from "sonner";
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
  const [selectedSessoes, setSelectedSessoes] = useState<string[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  
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

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSessoes(sessoes?.map(s => s.id) || []);
    } else {
      setSelectedSessoes([]);
    }
  };

  const handleSelectSessao = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedSessoes([...selectedSessoes, id]);
    } else {
      setSelectedSessoes(selectedSessoes.filter(i => i !== id));
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedSessoes.length;
    try {
      for (const id of selectedSessoes) {
        await deleteSessao.mutateAsync(id);
      }
      toast.success(`${count} registro(s) excluído(s) com sucesso`);
    } catch (error) {
      toast.error("Erro ao excluir alguns registros");
    } finally {
      setSelectedSessoes([]);
      setBulkDeleteDialogOpen(false);
    }
  };

  // Pagination logic
  const totalItems = sessoes?.length || 0;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedSessoes = sessoes?.slice(startIndex, endIndex);

  // Reset to first page when filters change
  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

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
            <div className="flex flex-wrap gap-2">
              {selectedSessoes.length > 0 && (
                <>
                  <span className="text-sm text-muted-foreground self-center">
                    {selectedSessoes.length} selecionado(s)
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setBulkDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir ({selectedSessoes.length})
                  </Button>
                </>
              )}
            </div>
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
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedSessoes.length === paginatedSessoes?.length && paginatedSessoes?.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedSessoes(paginatedSessoes?.map(s => s.id) || []);
                          } else {
                            setSelectedSessoes([]);
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Abandono</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Progresso</TableHead>
                    <TableHead>Tempo</TableHead>
                    <TableHead>Formulário</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {paginatedSessoes?.map((sessao) => {
                    const isSinglePage = sessao.formularios_templates?.layout_tipo === "single_page";
                    // Para single_page, sempre mostra 0/1 (pois é uma única etapa)
                    // Para multi_step, mostra etapas completadas / total de etapas
                    const totalEtapas = isSinglePage ? 1 : (sessao.formularios_templates?.formularios_etapas?.length || 1);
                    // Para abandonos em single_page, sempre 0 completadas
                    // Para multi_step, mostramos etapas completadas (etapa_atual - 1)
                    const etapasCompletadas = isSinglePage ? 0 : Math.max(0, sessao.etapa_atual - 1);
                    const progresso = Math.round((etapasCompletadas / totalEtapas) * 100);
                    const tempoSessao = sessao.abandoned_at 
                      ? differenceInSeconds(new Date(sessao.abandoned_at), new Date(sessao.started_at))
                      : 0;
                    
                    // Extrair nome, e-mail e telefone dos dados parciais baseado no tipo da etapa
                    const dadosParciais = sessao.dados_parciais as Record<string, any> || {};
                    const etapas = sessao.formularios_templates?.formularios_etapas as FormularioEtapa[] || [];
                    
                    // Encontrar valores por tipo de etapa ou título
                    let nome = "-";
                    let email = "-";
                    let telefone = "-";
                    
                    for (const etapa of etapas) {
                      const valor = dadosParciais[etapa.id];
                      if (!valor) continue;
                      
                      const tipoLower = etapa.tipo?.toLowerCase() || "";
                      const tituloLower = etapa.titulo?.toLowerCase() || "";
                      
                      // Identificar por tipo
                      if (tipoLower === "email") {
                        email = valor;
                      } else if (tipoLower === "telefone") {
                        telefone = valor;
                      } else if (tipoLower === "texto" || tipoLower === "nome") {
                        // Verificar se o título indica que é um campo de nome
                        if (tituloLower.includes("nome") || tituloLower.includes("name")) {
                          nome = valor;
                        }
                      }
                    }
                    
                    return (
                      <TableRow key={sessao.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedSessoes.includes(sessao.id)}
                            onCheckedChange={(checked) => handleSelectSessao(sessao.id, !!checked)}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(sessao.started_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {sessao.abandoned_at 
                            ? format(new Date(sessao.abandoned_at), "dd/MM/yy HH:mm", { locale: ptBR })
                            : "-"
                          }
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate" title={nome}>
                          {nome}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {telefone !== "-" ? formatPhoneDisplay(telefone) : "-"}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate" title={email}>
                          {email}
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
                              {etapasCompletadas}/{totalEtapas}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{formatDuration(tempoSessao)}</TableCell>
                        <TableCell>{sessao.formularios_templates?.nome || "-"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {telefone !== "-" && (
                              <WhatsAppInstanceSelector telefone={telefone} />
                            )}
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
          
          {/* Pagination */}
          {totalItems > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Itens por página:</span>
                <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                  <SelectTrigger className="w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">
                  {startIndex + 1}-{Math.min(endIndex, totalItems)} de {totalItems}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Página {currentPage} de {totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
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

      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedSessoes.length} registro(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os registros selecionados serão permanentemente removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
