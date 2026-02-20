import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Clock, Search, Users, AlertCircle, WifiOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Contato {
  id: string;
  numero: string;
  nome: string | null;
  status: string;
  enviado_em: string | null;
  erro: string | null;
}

interface ContatosCampanhaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaId: string | null;
  campanhaNome: string;
}

export function ContatosCampanhaDialog({
  open,
  onOpenChange,
  campanhaId,
  campanhaNome
}: ContatosCampanhaDialogProps) {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    if (open && campanhaId) {
      loadContatos();
    }
  }, [open, campanhaId]);

  const loadContatos = async () => {
    if (!campanhaId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("disparos_campanha_contatos")
        .select("*")
        .eq("campanha_id", campanhaId)
        .eq("archived", false)
        .order("enviado_em", { ascending: false, nullsFirst: false });

      if (error) throw error;
      setContatos(data || []);
    } catch (error) {
      console.error("Error loading contacts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const isSemWhatsApp = (contato: Contato) => {
    if (contato.status !== "failed" || !contato.erro) return false;
    const lower = contato.erro.toLowerCase();
    return (
      lower.includes("sem_whatsapp:") ||
      lower.includes("not on whatsapp") ||
      lower.includes("number not exists") ||
      lower.includes("not registered") ||
      lower.includes("phone not registered") ||
      lower.includes("invalid phone")
    );
  };

  const filteredContatos = contatos.filter(contato => {
    const matchesSearch =
      contato.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (contato.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

    if (activeTab === "all") return matchesSearch;
    if (activeTab === "sent") return matchesSearch && contato.status === "sent";
    if (activeTab === "failed") return matchesSearch && contato.status === "failed";
    if (activeTab === "no_whatsapp") return matchesSearch && isSemWhatsApp(contato);
    if (activeTab === "pending") return matchesSearch && contato.status === "pending";
    return matchesSearch;
  });

  const counts = {
    all: contatos.length,
    sent: contatos.filter(c => c.status === "sent").length,
    failed: contatos.filter(c => c.status === "failed").length,
    no_whatsapp: contatos.filter(c => isSemWhatsApp(c)).length,
    pending: contatos.filter(c => c.status === "pending").length,
  };

  const getStatusBadge = (contato: Contato) => {
    if (isSemWhatsApp(contato)) {
      return (
        <Badge variant="outline" className="gap-1 border-orange-400 text-orange-500">
          <WifiOff className="h-3 w-3" /> Sem WhatsApp
        </Badge>
      );
    }
    switch (contato.status) {
      case "sent":
        return <Badge className="gap-1 bg-green-500 text-white border-transparent"><CheckCircle className="h-3 w-3" /> Enviado</Badge>;
      case "failed":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Falhou</Badge>;
      case "pending":
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>;
      default:
        return <Badge variant="outline">{contato.status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Contatos - {campanhaNome}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou número..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Mobile: Dropdown Select */}
          <div className="sm:hidden">
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    Todos <Badge variant="secondary">{counts.all}</Badge>
                  </span>
                </SelectItem>
                <SelectItem value="sent">
                  <span className="flex items-center gap-2">
                    Enviados <Badge variant="secondary">{counts.sent}</Badge>
                  </span>
                </SelectItem>
                <SelectItem value="failed">
                  <span className="flex items-center gap-2">
                    Falhas <Badge variant="secondary">{counts.failed}</Badge>
                  </span>
                </SelectItem>
                <SelectItem value="no_whatsapp">
                  <span className="flex items-center gap-2">
                    Sem WhatsApp <Badge variant="secondary">{counts.no_whatsapp}</Badge>
                  </span>
                </SelectItem>
                <SelectItem value="pending">
                  <span className="flex items-center gap-2">
                    Pendentes <Badge variant="secondary">{counts.pending}</Badge>
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Desktop: Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="hidden sm:block">
            <TabsList className="h-8">
              <TabsTrigger value="all" className="gap-1 text-xs px-3 h-7">
                Todos <Badge variant="secondary" className="ml-1 text-[10px]">{counts.all}</Badge>
              </TabsTrigger>
              <TabsTrigger value="sent" className="gap-1 text-xs px-3 h-7">
                Enviados <Badge variant="secondary" className="ml-1 text-[10px]">{counts.sent}</Badge>
              </TabsTrigger>
              <TabsTrigger value="failed" className="gap-1 text-xs px-3 h-7">
                Falhas <Badge variant="secondary" className="ml-1 text-[10px]">{counts.failed}</Badge>
              </TabsTrigger>
              <TabsTrigger value="no_whatsapp" className="gap-1 text-xs px-3 h-7">
                Sem WhatsApp <Badge variant="secondary" className="ml-1 text-[10px]">{counts.no_whatsapp}</Badge>
              </TabsTrigger>
              <TabsTrigger value="pending" className="gap-1 text-xs px-3 h-7">
                Pendentes <Badge variant="secondary" className="ml-1 text-[10px]">{counts.pending}</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Content - shared between mobile dropdown and desktop tabs */}
          <div className="mt-4">
            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  Carregando...
                </div>
              ) : filteredContatos.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <Users className="h-8 w-8 mb-2" />
                  <p>Nenhum contato encontrado</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Número</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="whitespace-nowrap">Tentativa em</TableHead>
                      <TableHead className="w-10 text-center">Erro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContatos.map((contato) => (
                      <TableRow key={contato.id}>
                        <TableCell className="font-medium">
                          {contato.nome || "-"}
                        </TableCell>
                        <TableCell>{contato.numero}</TableCell>
                        <TableCell>{getStatusBadge(contato)}</TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          {contato.enviado_em
                            ? format(new Date(contato.enviado_em), "dd/MM/yy HH:mm", { locale: ptBR })
                            : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          {contato.erro ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertCircle className="h-4 w-4 text-destructive cursor-pointer mx-auto" />
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-[300px]">
                                  <p className="text-xs break-words">{contato.erro}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
