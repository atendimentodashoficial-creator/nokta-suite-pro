import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { 
  FolderOpen, 
  MoreVertical, 
  Pencil, 
  Trash2, 
  Eye, 
  Phone, 
  MapPin, 
  Calendar,
  Copy,
  Download,
  Loader2,
  Database,
  Globe,
  Mail,
  Instagram,
  Facebook,
  Youtube,
  Star,
  Filter,
  ExternalLink,
  Plus,
  FileText
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ExtractedBusiness {
  name: string;
  phone: string;
  address?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  website?: string;
  email?: string;
  facebook?: string;
  instagram?: string;
  twitter?: string;
  youtube?: string;
  tiktok?: string;
}

interface FiltrosUsados {
  maxResults?: number;
  language?: string;
  skipClosedPlaces?: boolean;
  scrapeContacts?: boolean;
  scrapePlaceDetailPage?: boolean;
  placeMinimumStars?: string;
  websiteFilter?: string;
  searchMatching?: string;
  scrapeSocialMedia?: {
    facebooks?: boolean;
    instagrams?: boolean;
    tiktoks?: boolean;
    twitters?: boolean;
    youtubes?: boolean;
  };
}

interface ListaExtrator {
  id: string;
  nome: string;
  dados: ExtractedBusiness[];
  total_contatos: number;
  busca_original: string | null;
  localizacao: string | null;
  created_at: string;
  filtros_usados: FiltrosUsados | null;
}

interface ListasSalvasCardProps {
  onListaCreated?: () => void;
  refreshTrigger?: number;
}

export function ListasSalvasCard({ onListaCreated, refreshTrigger }: ListasSalvasCardProps) {
  const { user } = useAuth();
  const [listas, setListas] = useState<ListaExtrator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLista, setSelectedLista] = useState<ListaExtrator | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  
  // Manual list creation
  const [isManualListDialogOpen, setIsManualListDialogOpen] = useState(false);
  const [manualListName, setManualListName] = useState("");
  const [manualListContacts, setManualListContacts] = useState("");
  const [isSavingManualList, setIsSavingManualList] = useState(false);

  useEffect(() => {
    if (user) {
      loadListas();
    }
  }, [user, refreshTrigger]);

  const loadListas = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("listas_extrator")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Parse JSON fields
      const parsedListas: ListaExtrator[] = (data || []).map(lista => ({
        id: lista.id,
        nome: lista.nome,
        dados: typeof lista.dados === 'string' ? JSON.parse(lista.dados) : (lista.dados as unknown as ExtractedBusiness[]),
        total_contatos: lista.total_contatos,
        busca_original: lista.busca_original,
        localizacao: lista.localizacao,
        created_at: lista.created_at,
        filtros_usados: typeof lista.filtros_usados === 'string' 
          ? JSON.parse(lista.filtros_usados) 
          : (lista.filtros_usados as unknown as FiltrosUsados | null)
      }));
      
      setListas(parsedListas);
    } catch (error) {
      console.error("Error loading listas:", error);
      toast.error("Erro ao carregar listas salvas");
    } finally {
      setIsLoading(false);
    }
  };

  const handleView = (lista: ListaExtrator) => {
    setSelectedLista(lista);
    setIsViewDialogOpen(true);
  };

  const handleRenameOpen = (lista: ListaExtrator) => {
    setSelectedLista(lista);
    setRenameValue(lista.nome);
    setIsRenameDialogOpen(true);
  };

  const handleRename = async () => {
    if (!selectedLista || !renameValue.trim()) return;
    
    setIsRenaming(true);
    try {
      const { error } = await supabase
        .from("listas_extrator")
        .update({ nome: renameValue.trim() })
        .eq("id", selectedLista.id);

      if (error) throw error;
      
      toast.success("Lista renomeada!");
      setIsRenameDialogOpen(false);
      loadListas();
    } catch (error) {
      console.error("Error renaming lista:", error);
      toast.error("Erro ao renomear lista");
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDelete = async (lista: ListaExtrator) => {
    if (!confirm(`Excluir a lista "${lista.nome}"?`)) return;
    
    try {
      const { error } = await supabase
        .from("listas_extrator")
        .delete()
        .eq("id", lista.id);

      if (error) throw error;
      
      toast.success("Lista excluída!");
      loadListas();
    } catch (error) {
      console.error("Error deleting lista:", error);
      toast.error("Erro ao excluir lista");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  const copyAllPhones = (dados: ExtractedBusiness[]) => {
    const phones = dados.filter(b => b.phone).map(b => b.phone).join("\n");
    if (!phones) {
      toast.error("Nenhum telefone disponível");
      return;
    }
    navigator.clipboard.writeText(phones);
    toast.success(`${dados.filter(b => b.phone).length} telefones copiados!`);
  };

  const exportToCsv = (lista: ListaExtrator) => {
    const headers = ["Nome", "Telefone", "Email", "Endereço", "Categoria"];
    const rows = lista.dados.map(b => [
      b.name || "",
      b.phone || "",
      b.email || "",
      b.address || "",
      b.category || ""
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${lista.nome.replace(/\s+/g, "_")}.csv`;
    link.click();
    
    toast.success("CSV exportado!");
  };

  const parseManualContacts = (text: string): ExtractedBusiness[] => {
    const lines = text.split("\n").filter(line => line.trim());
    const contacts: ExtractedBusiness[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Try to parse CSV format: nome,telefone or just telefone
      const parts = trimmed.split(/[,;\t]/).map(p => p.trim());
      
      if (parts.length >= 2) {
        // Format: nome,telefone or nome;telefone
        contacts.push({
          name: parts[0] || "Contato",
          phone: parts[1].replace(/\D/g, ""),
        });
      } else {
        // Just phone number
        const phoneOnly = trimmed.replace(/\D/g, "");
        if (phoneOnly.length >= 8) {
          contacts.push({
            name: "Contato",
            phone: phoneOnly,
          });
        }
      }
    }

    return contacts;
  };

  const handleSaveManualList = async () => {
    if (!user || !manualListName.trim()) {
      toast.error("Digite um nome para a lista");
      return;
    }

    const contacts = parseManualContacts(manualListContacts);
    if (contacts.length === 0) {
      toast.error("Nenhum contato válido encontrado");
      return;
    }

    setIsSavingManualList(true);
    try {
      const { error } = await supabase.from("listas_extrator").insert({
        user_id: user.id,
        nome: manualListName.trim(),
        dados: contacts as unknown as any,
        total_contatos: contacts.length,
        busca_original: "Lista Manual",
        localizacao: null,
        filtros_usados: null,
      });

      if (error) throw error;

      toast.success(`Lista criada com ${contacts.length} contatos!`);
      setIsManualListDialogOpen(false);
      setManualListName("");
      setManualListContacts("");
      loadListas();
      onListaCreated?.();
    } catch (error) {
      console.error("Error saving manual list:", error);
      toast.error("Erro ao salvar lista");
    } finally {
      setIsSavingManualList(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const previewContacts = parseManualContacts(manualListContacts);

  // Always show card for manual list creation option

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-950 rounded-lg">
                <Database className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Listas Salvas</CardTitle>
                <CardDescription>
                  {listas.length} lista{listas.length !== 1 ? "s" : ""} salva{listas.length !== 1 ? "s" : ""}
                </CardDescription>
              </div>
            </div>
            <Button onClick={() => setIsManualListDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Lista Manual
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {listas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Nenhuma lista salva ainda</p>
              <p className="text-xs mt-1">Extraia contatos ou crie uma lista manual</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {listas.map(lista => (
                <div 
                key={lista.id} 
                className="p-4 border rounded-xl bg-card hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm truncate">{lista.nome}</h3>
                    {lista.busca_original && lista.localizacao && (
                      <p className="text-xs text-muted-foreground truncate">
                        {lista.busca_original} • {lista.localizacao}
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleView(lista)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver Lista
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        setSelectedLista(lista);
                        setIsFilterDialogOpen(true);
                      }}>
                        <Filter className="h-4 w-4 mr-2" />
                        Ver Filtros
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleRenameOpen(lista)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportToCsv(lista)}>
                        <Download className="h-4 w-4 mr-2" />
                        Exportar CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => copyAllPhones(lista.dados)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copiar Telefones
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDelete(lista)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    <span>{lista.total_contatos} contatos</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{format(new Date(lista.created_at), "dd/MM/yy", { locale: ptBR })}</span>
                  </div>
                </div>

                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mt-3"
                  onClick={() => handleView(lista)}
                >
                  <Eye className="h-3.5 w-3.5 mr-2" />
                  Ver Lista
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual List Dialog */}
      <Dialog open={isManualListDialogOpen} onOpenChange={setIsManualListDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Criar Lista Manual
            </DialogTitle>
            <DialogDescription>
              Adicione contatos manualmente (um por linha: nome,telefone ou apenas telefone)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Nome da Lista</label>
              <Input
                value={manualListName}
                onChange={(e) => setManualListName(e.target.value)}
                placeholder="Ex: Leads Janeiro 2026"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">
                Contatos
                {previewContacts.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {previewContacts.length} contato{previewContacts.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </label>
              <textarea
                value={manualListContacts}
                onChange={(e) => setManualListContacts(e.target.value)}
                placeholder={`João Silva,11999998888\nMaria,21988887777\n5511977776666`}
                className="w-full h-48 p-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Formatos aceitos: nome,telefone | nome;telefone | apenas telefone
              </p>
            </div>

            {previewContacts.length > 0 && (
              <div className="p-3 bg-muted/50 rounded-lg max-h-32 overflow-y-auto">
                <p className="text-xs font-medium mb-2">Prévia:</p>
                <div className="space-y-1">
                  {previewContacts.slice(0, 5).map((c, i) => (
                    <div key={i} className="text-xs flex justify-between">
                      <span>{c.name}</span>
                      <span className="font-mono text-muted-foreground">{c.phone}</span>
                    </div>
                  ))}
                  {previewContacts.length > 5 && (
                    <p className="text-xs text-muted-foreground">...e mais {previewContacts.length - 5}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsManualListDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSaveManualList} 
                disabled={isSavingManualList || !manualListName.trim() || previewContacts.length === 0}
              >
                {isSavingManualList ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar Lista
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{selectedLista?.nome}</DialogTitle>
            <DialogDescription>
              {selectedLista?.total_contatos} contatos • {selectedLista?.busca_original} em {selectedLista?.localizacao}
            </DialogDescription>
          </DialogHeader>
          
          {/* Filtros Usados */}
          {selectedLista?.filtros_usados && Object.keys(selectedLista.filtros_usados).length > 0 && (
            <div className="p-3 bg-muted/50 rounded-lg border mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filtros usados na extração</span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {selectedLista.filtros_usados.maxResults && (
                  <Badge variant="outline">Máx: {selectedLista.filtros_usados.maxResults}</Badge>
                )}
                {selectedLista.filtros_usados.placeMinimumStars && (
                  <Badge variant="outline">
                    <Star className="h-3 w-3 mr-1" />
                    {selectedLista.filtros_usados.placeMinimumStars}+
                  </Badge>
                )}
                {selectedLista.filtros_usados.websiteFilter && selectedLista.filtros_usados.websiteFilter !== "allPlaces" && (
                  <Badge variant="outline">
                    {selectedLista.filtros_usados.websiteFilter === "withWebsite" ? "Com website" : "Sem website"}
                  </Badge>
                )}
                {selectedLista.filtros_usados.searchMatching && selectedLista.filtros_usados.searchMatching !== "all" && (
                  <Badge variant="outline">
                    {selectedLista.filtros_usados.searchMatching === "only_includes" ? "Nome contém busca" : "Nome exato"}
                  </Badge>
                )}
                {selectedLista.filtros_usados.language && (
                  <Badge variant="outline">Idioma: {selectedLista.filtros_usados.language}</Badge>
                )}
                {selectedLista.filtros_usados.scrapeSocialMedia && (
                  <>
                    {selectedLista.filtros_usados.scrapeSocialMedia.instagrams && (
                      <Badge variant="outline"><Instagram className="h-3 w-3 mr-1" />Instagram</Badge>
                    )}
                    {selectedLista.filtros_usados.scrapeSocialMedia.facebooks && (
                      <Badge variant="outline"><Facebook className="h-3 w-3 mr-1" />Facebook</Badge>
                    )}
                    {selectedLista.filtros_usados.scrapeSocialMedia.youtubes && (
                      <Badge variant="outline"><Youtube className="h-3 w-3 mr-1" />YouTube</Badge>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => selectedLista && copyAllPhones(selectedLista.dados)}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copiar Telefones
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => selectedLista && exportToCsv(selectedLista)}
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </div>

          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {selectedLista?.dados.map((business, index) => (
                <div key={index} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{business.name}</p>
                      {business.category && (
                        <p className="text-sm text-muted-foreground">{business.category}</p>
                      )}
                    </div>
                    {business.rating && (
                      <Badge variant="secondary" className="shrink-0">
                        <Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-400" />
                        {business.rating} {business.reviewCount ? `(${business.reviewCount})` : ""}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Contato principal */}
                  <div className="grid gap-2 text-sm">
                    {business.phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4 shrink-0" />
                        <span className="font-mono">{business.phone}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(business.phone)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {business.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4 shrink-0" />
                        <span>{business.email}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(business.email!)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {business.address && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span className="line-clamp-1">{business.address}</span>
                      </div>
                    )}
                    {business.website && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Globe className="h-4 w-4 shrink-0" />
                        <a 
                          href={business.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1 truncate"
                        >
                          {business.website.replace(/^https?:\/\//, '').split('/')[0]}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Redes Sociais */}
                  {(business.instagram || business.facebook || business.youtube || business.twitter || business.tiktok) && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                      {business.instagram && (
                        <a 
                          href={business.instagram} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md hover:opacity-90"
                        >
                          <Instagram className="h-3 w-3" />
                          Instagram
                        </a>
                      )}
                      {business.facebook && (
                        <a 
                          href={business.facebook} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded-md hover:opacity-90"
                        >
                          <Facebook className="h-3 w-3" />
                          Facebook
                        </a>
                      )}
                      {business.youtube && (
                        <a 
                          href={business.youtube} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-600 text-white rounded-md hover:opacity-90"
                        >
                          <Youtube className="h-3 w-3" />
                          YouTube
                        </a>
                      )}
                      {business.twitter && (
                        <a 
                          href={business.twitter} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-black text-white rounded-md hover:opacity-90"
                        >
                          𝕏 Twitter
                        </a>
                      )}
                      {business.tiktok && (
                        <a 
                          href={business.tiktok} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-black text-white rounded-md hover:opacity-90"
                        >
                          TikTok
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Filtros Dialog */}
      <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Configuração da Extração
            </DialogTitle>
            <DialogDescription>
              Filtros e opções usados na extração "{selectedLista?.nome}"
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Busca e Localização */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Busca</p>
                <p className="font-medium text-sm">{selectedLista?.busca_original || "—"}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Localização</p>
                <p className="font-medium text-sm">{selectedLista?.localizacao || "—"}</p>
              </div>
            </div>

            {selectedLista?.filtros_usados ? (
              <div className="space-y-3">
                {/* Configurações básicas */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Quantidade máxima</p>
                    <p className="font-medium text-sm">{selectedLista.filtros_usados.maxResults || "—"}</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Idioma</p>
                    <p className="font-medium text-sm">{selectedLista.filtros_usados.language || "—"}</p>
                  </div>
                </div>

                {/* Filtros aplicados */}
                <div className="p-3 border rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2">Filtros aplicados</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedLista.filtros_usados.placeMinimumStars && (
                      <Badge variant="secondary">
                        <Star className="h-3 w-3 mr-1" />
                        Mín. {selectedLista.filtros_usados.placeMinimumStars}
                      </Badge>
                    )}
                    {selectedLista.filtros_usados.websiteFilter && selectedLista.filtros_usados.websiteFilter !== "allPlaces" && (
                      <Badge variant="secondary">
                        <Globe className="h-3 w-3 mr-1" />
                        {selectedLista.filtros_usados.websiteFilter === "withWebsite" ? "Com website" : "Sem website"}
                      </Badge>
                    )}
                    {selectedLista.filtros_usados.searchMatching && selectedLista.filtros_usados.searchMatching !== "all" && (
                      <Badge variant="secondary">
                        {selectedLista.filtros_usados.searchMatching === "only_includes" ? "Nome contém busca" : "Nome exato"}
                      </Badge>
                    )}
                    {!selectedLista.filtros_usados.placeMinimumStars && 
                     (!selectedLista.filtros_usados.websiteFilter || selectedLista.filtros_usados.websiteFilter === "allPlaces") &&
                     (!selectedLista.filtros_usados.searchMatching || selectedLista.filtros_usados.searchMatching === "all") && (
                      <span className="text-sm text-muted-foreground">Nenhum filtro específico</span>
                    )}
                  </div>
                </div>

                {/* Redes sociais extraídas */}
                {selectedLista.filtros_usados.scrapeSocialMedia && (
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-muted-foreground mb-2">Redes sociais extraídas</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedLista.filtros_usados.scrapeSocialMedia.instagrams && (
                        <Badge variant="outline">
                          <Instagram className="h-3 w-3 mr-1" />
                          Instagram
                        </Badge>
                      )}
                      {selectedLista.filtros_usados.scrapeSocialMedia.facebooks && (
                        <Badge variant="outline">
                          <Facebook className="h-3 w-3 mr-1" />
                          Facebook
                        </Badge>
                      )}
                      {selectedLista.filtros_usados.scrapeSocialMedia.youtubes && (
                        <Badge variant="outline">
                          <Youtube className="h-3 w-3 mr-1" />
                          YouTube
                        </Badge>
                      )}
                      {selectedLista.filtros_usados.scrapeSocialMedia.twitters && (
                        <Badge variant="outline">𝕏 Twitter</Badge>
                      )}
                      {selectedLista.filtros_usados.scrapeSocialMedia.tiktoks && (
                        <Badge variant="outline">TikTok</Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                <p className="text-sm">Informações de configuração não disponíveis para esta lista.</p>
                <p className="text-xs mt-1">(Listas antigas podem não ter esses dados)</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear Lista</DialogTitle>
            <DialogDescription>
              Digite um novo nome para a lista
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Nome da lista"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleRename} disabled={isRenaming || !renameValue.trim()}>
                {isRenaming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
