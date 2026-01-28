import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { History, Search, CheckCircle2, XCircle, Calendar, Clock, User, MessageSquare, RefreshCw, Loader2, Trash2, MessageCircle, CheckSquare, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatInTimeZone } from "date-fns-tz";
import { formatPhoneDisplay } from "@/utils/phoneFormat";
import { navigateToChat } from "@/utils/chatRouting";
import { subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { startOfDayBrasilia, TIMEZONE_BRASILIA } from "@/utils/timezone";

interface AvisoEnviadoLog {
  id: string;
  user_id: string;
  aviso_id: string | null;
  agendamento_id: string | null;
  cliente_id: string | null;
  cliente_nome: string;
  cliente_telefone: string;
  aviso_nome: string;
  dias_antes: number;
  mensagem_enviada: string;
  status: string;
  erro: string | null;
  enviado_em: string;
  created_at: string;
  cliente_origem?: string | null;
}

export function HistoricoAvisosTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<AvisoEnviadoLog[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("1");
  const [selectedLog, setSelectedLog] = useState<AvisoEnviadoLog | null>(null);
  const [logToDelete, setLogToDelete] = useState<AvisoEnviadoLog | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  const handleDeleteLog = async () => {
    if (!logToDelete) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('avisos_enviados_log')
        .delete()
        .eq('id', logToDelete.id);

      if (error) throw error;

      setLogs(prev => prev.filter(l => l.id !== logToDelete.id));
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(logToDelete.id);
        return newSet;
      });
      toast.success('Registro excluído com sucesso');
      setLogToDelete(null);
    } catch (error) {
      console.error('Error deleting log:', error);
      toast.error('Erro ao excluir registro');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    setIsDeleting(true);
    try {
      const idsToDelete = Array.from(selectedIds);
      const { error } = await supabase
        .from('avisos_enviados_log')
        .delete()
        .in('id', idsToDelete);

      if (error) throw error;

      setLogs(prev => prev.filter(l => !selectedIds.has(l.id)));
      toast.success(`${idsToDelete.length} registro(s) excluído(s) com sucesso`);
      setSelectedIds(new Set());
      setShowBulkDeleteDialog(false);
    } catch (error) {
      console.error('Error bulk deleting logs:', error);
      toast.error('Erro ao excluir registros');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredLogs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLogs.map(l => l.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  const loadLogs = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const daysAgo = parseInt(dateFilter);
      const startDate = subDays(startOfDayBrasilia(), daysAgo);
      
      let query = supabase
        .from('avisos_enviados_log')
        .select('*, leads:cliente_id(origem)')
        .eq('user_id', user.id)
        .gte('enviado_em', startDate.toISOString())
        .order('enviado_em', { ascending: false })
        .limit(500);

      if (statusFilter !== "all") {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Map the joined data to include cliente_origem
      const logsWithOrigem = (data || []).map((log: any) => ({
        ...log,
        cliente_origem: log.leads?.origem || null,
      }));
      setLogs(logsWithOrigem);
    } catch (error) {
      console.error('Error loading logs:', error);
      toast.error('Erro ao carregar histórico');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadLogs();
    }
  }, [user, statusFilter, dateFilter]);
  // Filter logs by search term
  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      log.cliente_nome.toLowerCase().includes(searchLower) ||
      log.cliente_telefone.includes(searchTerm) ||
      log.aviso_nome.toLowerCase().includes(searchLower)
    );
  });

  // Stats
  const stats = {
    total: logs.length,
    enviados: logs.filter(l => l.status === 'enviado').length,
    erros: logs.filter(l => l.status === 'erro').length,
  };

  const formatPeriodo = (dias: number) => {
    if (dias === 0) return 'No dia';
    if (dias === 1) return '1 dia antes';
    return `${dias} dias antes`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Avisos Enviados
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhe todos os lembretes enviados para pacientes
          </p>
        </div>
        <Button variant="outline" onClick={loadLogs} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        {/* Total */}
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {stats.total}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Total</p>
        </div>

        {/* Enviados */}
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {stats.enviados}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Enviados</p>
        </div>

        {/* Erros */}
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {stats.erros}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Erros</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Mobile: Filters first (stacked), then search */}
            <div className="flex flex-col gap-3 sm:hidden order-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap w-16">Período:</span>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Hoje</SelectItem>
                    <SelectItem value="7">Últimos 7 dias</SelectItem>
                    <SelectItem value="30">Últimos 30 dias</SelectItem>
                    <SelectItem value="90">Últimos 90 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap w-16">Status:</span>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="enviado">Enviados</SelectItem>
                    <SelectItem value="erro">Erros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Desktop: Filters before search (left side) */}
            <div className="hidden sm:flex items-center gap-2 order-1">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Período:</span>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Hoje</SelectItem>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="hidden sm:flex items-center gap-2 order-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Status:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="enviado">Enviados</SelectItem>
                  <SelectItem value="erro">Erros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Search bar - right side on desktop */}
            <div className="flex-1 min-w-[200px] order-2 sm:order-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente ou aviso..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Registros ({filteredLogs.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              {isSelectionMode ? (
                <>
                  {selectedIds.size > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowBulkDeleteDialog(true)}
                    >
                      <Trash2 className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Excluir {selectedIds.size}</span>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exitSelectionMode}
                  >
                    <X className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Cancelar</span>
                  </Button>
                </>
              ) : (
                filteredLogs.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsSelectionMode(true)}
                  >
                    <CheckSquare className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Selecionar</span>
                  </Button>
                )
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum registro encontrado</p>
              <p className="text-sm mt-1">Os avisos enviados aparecerão aqui</p>
            </div>
          ) : (
            <>
              {/* Select All Header - Only visible in selection mode */}
              {isSelectionMode && (
                <div className="flex items-center gap-3 pb-3 mb-2 border-b">
                  <Checkbox
                    checked={selectedIds.size === filteredLogs.length && filteredLogs.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.size === filteredLogs.length ? "Desmarcar todos" : "Selecionar todos"}
                  </span>
                </div>
              )}
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer group ${
                        selectedIds.has(log.id) ? 'ring-2 ring-primary bg-accent/30' : ''
                      }`}
                      onClick={() => isSelectionMode ? toggleSelectOne(log.id) : setSelectedLog(log)}
                    >
                      {/* Mobile: Stack layout, Desktop: Row layout */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        {/* Left side: Checkbox (if selection mode) + Status icon + Info */}
                        <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                          {isSelectionMode && (
                            <Checkbox
                              checked={selectedIds.has(log.id)}
                              onCheckedChange={() => toggleSelectOne(log.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-shrink-0 mt-1 sm:mt-0"
                            />
                          )}
                          <div className={`h-10 w-10 rounded-full flex-shrink-0 flex items-center justify-center ${
                            log.status === 'enviado' 
                              ? 'bg-green-100 dark:bg-green-900/30' 
                              : 'bg-red-100 dark:bg-red-900/30'
                          }`}>
                            {log.status === 'enviado' ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium truncate">{log.cliente_nome}</p>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="hidden sm:inline-flex h-7 w-7 flex-shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateToChat(navigate, log.cliente_telefone, log.cliente_origem);
                                }}
                              >
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                              <Badge variant="outline" className="text-xs flex-shrink-0 hidden sm:inline-flex">
                                {log.aviso_nome}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatPhoneDisplay(log.cliente_telefone)}
                            </p>
                          </div>
                        </div>
                      
                      {/* Right side: Date/Time + Delete button */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between sm:justify-end gap-2 sm:gap-3 pl-13 sm:pl-0">
                        {/* Badge on mobile - above date */}
                        <Badge variant="outline" className="text-xs sm:hidden">
                          {log.aviso_nome}
                        </Badge>
                        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                          <div className="flex items-center gap-3 text-muted-foreground">
                            {/* Mobile: Data primeiro, Desktop: Horário primeiro */}
                            <div className="flex items-center gap-1 text-sm sm:order-2">
                              <Calendar className="h-3.5 w-3.5" />
                              {formatInTimeZone(log.enviado_em, 'America/Sao_Paulo', "dd/MM/yyyy")}
                            </div>
                            <div className="flex items-center gap-1 text-xs sm:order-1">
                              <Clock className="h-3 w-3" />
                              {formatInTimeZone(log.enviado_em, 'America/Sao_Paulo', "HH:mm")}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="sm:hidden h-8 w-8 flex-shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigateToChat(navigate, log.cliente_telefone, log.cliente_origem);
                              }}
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLogToDelete(log);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </CardContent>
      </Card>

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLog?.status === 'enviado' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              Detalhes do Aviso
            </DialogTitle>
            <DialogDescription>
              {selectedLog?.status === 'enviado' ? 'Enviado com sucesso' : 'Falha no envio'}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Cliente</p>
                  <p className="font-medium">{selectedLog.cliente_nome}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Telefone</p>
                  <p className="font-medium">{formatPhoneDisplay(selectedLog.cliente_telefone)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Aviso</p>
                  <p className="font-medium">{selectedLog.aviso_nome}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Tipo</p>
                  <p className="font-medium">{formatPeriodo(selectedLog.dias_antes)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Data/Hora</p>
                  <p className="font-medium">
                    {formatInTimeZone(selectedLog.enviado_em, 'America/Sao_Paulo', "dd 'de' MMMM 'de' yyyy 'às' HH:mm:ss", { locale: ptBR })}
                  </p>
                </div>
              </div>

              {selectedLog.erro && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Erro</p>
                  <p className="text-sm text-red-700 dark:text-red-300">{selectedLog.erro}</p>
                </div>
              )}

              <div>
                <p className="text-xs text-muted-foreground mb-2">Mensagem Enviada</p>
                <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                  {selectedLog.mensagem_enviada}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!logToDelete} onOpenChange={() => setLogToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o registro de aviso para "{logToDelete?.cliente_nome}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLog}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registros selecionados</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedIds.size} registro(s)? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Excluir {selectedIds.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
