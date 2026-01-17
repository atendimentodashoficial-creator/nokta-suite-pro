import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, Eye, Trash2, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { PeriodFilter, usePeriodFilter } from "@/components/filters/PeriodFilter";
import { useFormulariosLeads, useFormulariosTemplates, useUpdateLeadStatus, useDeleteLead, FormularioLead } from "@/hooks/useFormularios";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import LeadDetailsDialog from "./LeadDetailsDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatPhoneDisplay } from "@/utils/phoneFormat";
import WhatsAppInstanceSelector from "./WhatsAppInstanceSelector";

const statusColors: Record<string, string> = {
  novo: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  contactado: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  fechado: "bg-green-500/10 text-green-500 border-green-500/20",
  negado: "bg-red-500/10 text-red-500 border-red-500/20",
};

const statusLabels: Record<string, string> = {
  novo: "Novo",
  contactado: "Contactado",
  fechado: "Fechado",
  negado: "Negado",
};

export default function FormulariosLeads() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [selectedLead, setSelectedLead] = useState<FormularioLead | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  
  const { periodFilter, dateStart, dateEnd, setPeriodFilter, setDateStart, setDateEnd } = usePeriodFilter();
  
  const { data: templates } = useFormulariosTemplates();
  const { data: leads, isLoading } = useFormulariosLeads({
    status: statusFilter !== "all" ? statusFilter : undefined,
    templateId: templateFilter !== "all" ? templateFilter : undefined,
    dateStart,
    dateEnd,
  });
  
  const updateStatus = useUpdateLeadStatus();
  const deleteLead = useDeleteLead();

  const filteredLeads = leads?.filter(lead => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      lead.nome?.toLowerCase().includes(searchLower) ||
      lead.email?.toLowerCase().includes(searchLower) ||
      lead.telefone?.includes(search)
    );
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLeads(filteredLeads?.map(l => l.id) || []);
    } else {
      setSelectedLeads([]);
    }
  };

  const handleSelectLead = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedLeads([...selectedLeads, id]);
    } else {
      setSelectedLeads(selectedLeads.filter(i => i !== id));
    }
  };

  const handleBulkStatusChange = (status: string) => {
    selectedLeads.forEach(id => {
      updateStatus.mutate({ id, status });
    });
    setSelectedLeads([]);
  };

  const handleExport = () => {
    const data = (selectedLeads.length > 0 
      ? filteredLeads?.filter(l => selectedLeads.includes(l.id))
      : filteredLeads
    ) || [];
    
    const csv = [
      ["Nome", "Email", "Telefone", "Status", "Formulário", "Data"],
      ...data.map(l => [
        l.nome || "",
        l.email || "",
        l.telefone || "",
        statusLabels[l.status] || l.status,
        l.formularios_templates?.nome || "",
        format(new Date(l.created_at), "dd/MM/yyyy HH:mm"),
      ]),
    ].map(row => row.join(",")).join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportação concluída!");
  };

  const handleDelete = () => {
    if (leadToDelete) {
      deleteLead.mutate(leadToDelete);
      setLeadToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedLeads.length;
    try {
      for (const id of selectedLeads) {
        await deleteLead.mutateAsync(id);
      }
      toast.success(`${count} lead(s) excluído(s) com sucesso`);
    } catch (error) {
      toast.error("Erro ao excluir alguns leads");
    } finally {
      setSelectedLeads([]);
      setBulkDeleteDialogOpen(false);
    }
  };

  // Pagination logic
  const totalItems = filteredLeads?.length || 0;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLeads = filteredLeads?.slice(startIndex, endIndex);

  // Reset to first page when filters change
  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <CardTitle>Leads Capturados</CardTitle>
            <div className="flex flex-wrap gap-2">
              {selectedLeads.length > 0 && (
                <>
                  <span className="text-sm text-muted-foreground self-center">
                    {selectedLeads.length} selecionado(s)
                  </span>
                  <Select onValueChange={handleBulkStatusChange}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Alterar status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="novo">Novo</SelectItem>
                      <SelectItem value="contactado">Contactado</SelectItem>
                      <SelectItem value="fechado">Fechado</SelectItem>
                      <SelectItem value="negado">Negado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setBulkDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir ({selectedLeads.length})
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="novo">Novo</SelectItem>
                <SelectItem value="contactado">Contactado</SelectItem>
                <SelectItem value="fechado">Fechado</SelectItem>
                <SelectItem value="negado">Negado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={templateFilter} onValueChange={setTemplateFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Formulário" />
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
          ) : filteredLeads?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum lead encontrado
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedLeads.length === paginatedLeads?.length && paginatedLeads?.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedLeads(paginatedLeads?.map(l => l.id) || []);
                          } else {
                            setSelectedLeads([]);
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Formulário</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedLeads?.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedLeads.includes(lead.id)}
                          onCheckedChange={(checked) => handleSelectLead(lead.id, !!checked)}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(lead.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>{lead.nome || "-"}</TableCell>
                      <TableCell>{lead.telefone ? formatPhoneDisplay(lead.telefone) : "-"}</TableCell>
                      <TableCell>{lead.email || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[lead.status]}>
                          {statusLabels[lead.status] || lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{lead.formularios_templates?.nome || "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {lead.telefone && (
                            <WhatsAppInstanceSelector telefone={lead.telefone} />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedLead(lead)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setLeadToDelete(lead.id);
                              setDeleteDialogOpen(true);
                            }}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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

      <LeadDetailsDialog
        lead={selectedLead}
        open={!!selectedLead}
        onOpenChange={(open) => !open && setSelectedLead(null)}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Leads em Massa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedLeads.length} lead(s) selecionado(s)? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground">
              Excluir ({selectedLeads.length})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
