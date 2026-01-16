import { useEffect, useRef, useState } from "react";
import { useTabPersistence } from "@/hooks/useTabPersistence";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Search,
  Download,
  MapPin,
  Phone,
  Building2,
  Copy,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Globe,
  Settings2,
  ChevronDown,
  Instagram,
  Facebook,
  Youtube,
  Save,
  Database,
  GitCompare,
  Eye,
  EyeOff
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ListasSalvasCard } from "@/components/extrator/ListasSalvasCard";
import { CompararListasDialog } from "@/components/extrator/CompararListasDialog";

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
  _isDuplicate?: boolean;
}

interface ListaExtrator {
  id: string;
  nome: string;
  dados: ExtractedBusiness[];
  total_contatos: number;
}

interface SocialMediaOptions {
  facebooks: boolean;
  instagrams: boolean;
  tiktoks: boolean;
  twitters: boolean;
  youtubes: boolean;
}

export default function Extrator() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Basic search options
  const [searchQuery, setSearchQuery] = useState("");
  const [location, setLocation] = useState("");
  const [maxResults, setMaxResults] = useState("20");
  const [language, setLanguage] = useState("pt-BR");
  
  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [skipClosedPlaces, setSkipClosedPlaces] = useState(true);
  const [scrapeContacts, setScrapeContacts] = useState(true);
  const [scrapePlaceDetailPage, setScrapePlaceDetailPage] = useState(true);
  
  // Filtros
  const [placeMinimumStars, setPlaceMinimumStars] = useState("_none");
  const [websiteFilter, setWebsiteFilter] = useState("allPlaces");
  const [searchMatching, setSearchMatching] = useState("all");
  
  // Social media options - all enabled by default
  const [scrapeSocialMedia, setScrapeSocialMedia] = useState<SocialMediaOptions>({
    facebooks: true,
    instagrams: true,
    tiktoks: true,
    twitters: true,
    youtubes: true,
  });

  // State
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressTimerRef = useRef<number | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedBusiness[]>([]);
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null);
  
  // Save list state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [listName, setListName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [listasRefreshTrigger, setListasRefreshTrigger] = useState(0);

  // Compare lists state
  const [savedLists, setSavedLists] = useState<ListaExtrator[]>([]);
  const [compareListIds, setCompareListIds] = useState<string[]>([]);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [duplicateStats, setDuplicateStats] = useState<{ total: number; duplicates: number; unique: number } | null>(null);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [showCompareListsDropdown, setShowCompareListsDropdown] = useState(false);

  // Load saved lists for comparison
  useEffect(() => {
    const loadSavedLists = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from("listas_extrator")
        .select("id, nome, dados, total_contatos")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      if (!error && data) {
        const parsed = data.map(lista => ({
          ...lista,
          dados: typeof lista.dados === 'string' ? JSON.parse(lista.dados) : (lista.dados as unknown as ExtractedBusiness[])
        }));
        setSavedLists(parsed);
      }
    };
    loadSavedLists();
  }, [user, listasRefreshTrigger]);

  // Normalize phone for comparison (last 8 digits)
  const normalizePhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    return digits.slice(-8);
  };

  // Compare extracted data with selected lists
  useEffect(() => {
    if (extractedData.length === 0 || compareListIds.length === 0) {
      setDuplicateStats(null);
      // Remove duplicate flags
      setExtractedData(prev => prev.map(b => ({ ...b, _isDuplicate: undefined })));
      return;
    }

    const selectedLists = savedLists.filter(l => compareListIds.includes(l.id));
    if (selectedLists.length === 0) return;

    // Build set of normalized phones from all selected lists
    const existingPhones = new Set<string>();
    selectedLists.forEach(list => {
      list.dados
        .filter(b => b.phone)
        .forEach(b => existingPhones.add(normalizePhone(b.phone)));
    });

    // Mark duplicates
    let duplicateCount = 0;
    const markedData = extractedData.map(business => {
      if (!business.phone) return { ...business, _isDuplicate: false };
      const normalized = normalizePhone(business.phone);
      const isDuplicate = existingPhones.has(normalized);
      if (isDuplicate) duplicateCount++;
      return { ...business, _isDuplicate: isDuplicate };
    });

    setExtractedData(markedData);
    setDuplicateStats({
      total: extractedData.length,
      duplicates: duplicateCount,
      unique: extractedData.length - duplicateCount
    });
  }, [compareListIds, savedLists]);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    };
  }, []);

  const startProgress = () => {
    setProgress(8);
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    progressTimerRef.current = window.setInterval(() => {
      setProgress((p) => {
        // Simulado (não temos progresso real do provider)
        if (p >= 92) return p;
        const step = p < 40 ? 6 : p < 70 ? 3 : 1;
        return Math.min(92, p + step);
      });
    }, 900);
  };

  const stopProgress = (finalValue: number) => {
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    progressTimerRef.current = null;
    setProgress(finalValue);
    window.setTimeout(() => setProgress(0), 600);
  };

  const handleExtract = async () => {
    if (!searchQuery.trim() || !location.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha a busca e a localização",
        variant: "destructive",
      });
      return;
    }

    setIsExtracting(true);
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    setProgress(10);
    setExtractionStatus("Iniciando extração...");
    setExtractedData([]);

    try {
      const { data: session } = await supabase.auth.getSession();

      // 1) Start run
      const start = await supabase.functions.invoke("apify-google-maps", {
        body: {
          searchStringsArray: [searchQuery.trim()],
          locationQuery: location.trim(),
          maxCrawledPlacesPerSearch: parseInt(maxResults),
          language,
          skipClosedPlaces,
          scrapeContacts,
          scrapePlaceDetailPage,
          scrapeSocialMediaProfiles: scrapeSocialMedia,
          placeMinimumStars: placeMinimumStars === "_none" ? undefined : placeMinimumStars,
          website: websiteFilter,
          searchMatching,
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (start.error) throw new Error(start.error.message || "Erro ao iniciar extração");
      if (!start.data?.success) throw new Error(start.data?.error || "Erro ao iniciar extração");

      const runId = start.data.runId as string;
      setExtractionStatus("Extraindo... (0%)");

      // 2) Poll status
      const maxAttempts = 40; // ~2min (3s)
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 3000));

        const statusResp = await supabase.functions.invoke("apify-google-maps", {
          body: { 
            runId,
            filters: {
              scrapeSocialMediaProfiles: scrapeSocialMedia,
              placeMinimumStars: placeMinimumStars === "_none" ? undefined : placeMinimumStars,
              websiteFilter,
              searchMatching,
              searchQuery: searchQuery.trim(),
              scrapeContacts,
            },
          },
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
          },
        });

        if (statusResp.error) throw new Error(statusResp.error.message || "Erro ao consultar status");

        const payload = statusResp.data;
        if (!payload?.success) throw new Error(payload?.error || "Erro ao consultar status");

        const status = payload.status as string;

        // progresso aproximado por status/tentativas
        const pct = Math.min(92, 15 + Math.round(((i + 1) / maxAttempts) * 77));
        setProgress(pct);
        setExtractionStatus(
          status === "READY" ? `Na fila... (${pct}%)` : status === "RUNNING" ? `Extraindo... (${pct}%)` : `Processando... (${pct}%)`,
        );

        if (payload.done && payload.data) {
          const businesses = payload.data || [];
          setExtractedData(businesses);
          setExtractionStatus(`Extração concluída! ${businesses.length} resultados encontrados.`);
          stopProgress(100);
          toast({
            title: "Extração concluída!",
            description: `${businesses.length} negócios encontrados`,
          });
          return;
        }
      }

      throw new Error("Tempo limite na extração (tente menos resultados ou filtros mais simples)");
    } catch (error: unknown) {
      console.error("Error extracting:", error);
      const errorMessage = error instanceof Error ? error.message : "Erro ao extrair dados";
      setExtractionStatus(`Erro: ${errorMessage}`);
      stopProgress(0);
      toast({
        title: "Erro na extração",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    sonnerToast.success("Copiado para a área de transferência!");
  };

  const copyAllPhones = () => {
    const phones = extractedData
      .filter(b => b.phone)
      .map(b => b.phone)
      .join("\n");
    
    if (!phones) {
      toast({
        title: "Sem telefones",
        description: "Nenhum telefone disponível para copiar",
        variant: "destructive",
      });
      return;
    }
    
    navigator.clipboard.writeText(phones);
    sonnerToast.success(`${extractedData.filter(b => b.phone).length} telefones copiados!`);
  };

  const exportToCsv = () => {
    if (extractedData.length === 0) return;

    const headers = ["Nome", "Telefone", "Email", "Endereço", "Categoria", "Avaliação", "Qtd Avaliações", "Website", "Facebook", "Instagram", "Twitter", "YouTube", "TikTok"];
    const rows = extractedData.map(b => [
      b.name || "",
      b.phone || "",
      b.email || "",
      b.address || "",
      b.category || "",
      b.rating?.toString() || "",
      b.reviewCount?.toString() || "",
      b.website || "",
      b.facebook || "",
      b.instagram || "",
      b.twitter || "",
      b.youtube || "",
      b.tiktok || ""
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `extrator_${searchQuery}_${location}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    
    sonnerToast.success("Arquivo CSV exportado!");
  };

  const clearResults = () => {
    setExtractedData([]);
    setExtractionStatus(null);
  };

  const toggleSocialMedia = (key: keyof SocialMediaOptions) => {
    setScrapeSocialMedia(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSaveList = async () => {
    if (!user || !listName.trim() || extractedData.length === 0) return;
    
    setIsSaving(true);
    try {
      const filtrosUsados = {
        maxResults: parseInt(maxResults),
        language,
        skipClosedPlaces,
        scrapeContacts,
        scrapePlaceDetailPage,
        placeMinimumStars: placeMinimumStars === "_none" ? null : placeMinimumStars,
        websiteFilter,
        searchMatching,
        scrapeSocialMedia,
      };

      const { error } = await supabase.from("listas_extrator").insert({
        user_id: user.id,
        nome: listName.trim(),
        dados: JSON.parse(JSON.stringify(extractedData)),
        total_contatos: extractedData.length,
        busca_original: searchQuery,
        localizacao: location,
        filtros_usados: filtrosUsados,
      } as any);

      if (error) throw error;

      sonnerToast.success("Lista salva com sucesso!");
      setShowSaveDialog(false);
      setListName("");
      setListasRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error("Error saving list:", error);
      sonnerToast.error("Erro ao salvar lista");
    } finally {
      setIsSaving(false);
    }
  };

  const openSaveDialog = () => {
    setListName(`${searchQuery} - ${location}`);
    setShowSaveDialog(true);
  };

  const [activeTab, setActiveTab] = useTabPersistence("tab", "extrator");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Database className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Extrator</h1>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8">
          <TabsTrigger value="extrator" className="gap-1.5 text-xs px-3 h-7">
            <MapPin className="h-3.5 w-3.5" />
            Extrator
          </TabsTrigger>
          <TabsTrigger value="listas" className="gap-1.5 text-xs px-3 h-7">
            <Database className="h-3.5 w-3.5" />
            Listas Salvas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="extrator" className="space-y-6 mt-6">

      {/* Search Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
              <MapPin className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Google Meu Negócio</CardTitle>
              <CardDescription>
                Busque empresas por categoria e localização
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Basic Options - Linha 1 */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Busca:</span>
              <Input
                id="searchQuery"
                placeholder="Ex: dentistas, restaurantes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[200px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Localização:</span>
              <Input
                id="location"
                placeholder="Ex: São Paulo, SP"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-[180px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Quantidade:</span>
              <Select value={["5", "10", "20", "50", "100", "200"].includes(maxResults) ? maxResults : "_custom"} onValueChange={(val) => val !== "_custom" && setMaxResults(val)}>
                <SelectTrigger className="w-[100px] bg-background">
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  {!["5", "10", "20", "50", "100", "200"].includes(maxResults) && (
                    <SelectItem value="_custom" disabled>{maxResults} (custom)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Idioma:</span>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-[140px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="pt-BR">Português (BR)</SelectItem>
                  <SelectItem value="pt">Português</SelectItem>
                  <SelectItem value="en">Inglês</SelectItem>
                  <SelectItem value="es">Espanhol</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Advanced Options */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings2 className="h-4 w-4" />
                Opções Avançadas
                <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-4">
              {/* Filtros - Linha 2 */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Avaliação mín.:</span>
                  <Select value={placeMinimumStars} onValueChange={setPlaceMinimumStars}>
                    <SelectTrigger className="w-[100px] bg-background">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      <SelectItem value="_none">Todas</SelectItem>
                      <SelectItem value="two">⭐ 2+</SelectItem>
                      <SelectItem value="twoAndHalf">⭐ 2.5+</SelectItem>
                      <SelectItem value="three">⭐ 3+</SelectItem>
                      <SelectItem value="threeAndHalf">⭐ 3.5+</SelectItem>
                      <SelectItem value="four">⭐ 4+</SelectItem>
                      <SelectItem value="fourAndHalf">⭐ 4.5+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Website:</span>
                  <Select value={websiteFilter} onValueChange={setWebsiteFilter}>
                    <SelectTrigger className="w-[130px] bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      <SelectItem value="allPlaces">Todos</SelectItem>
                      <SelectItem value="withWebsite">Com website</SelectItem>
                      <SelectItem value="withoutWebsite">Sem website</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Correspondência:</span>
                  <Select value={searchMatching} onValueChange={setSearchMatching}>
                    <SelectTrigger className="w-[150px] bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="only_includes">Nome contém busca</SelectItem>
                      <SelectItem value="only_exact">Nome exato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {savedLists.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Excluir repetidos:</span>
                    <Popover open={showCompareListsDropdown} onOpenChange={setShowCompareListsDropdown}>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="justify-between font-normal w-[120px]"
                        >
                          <span className="truncate">
                            {compareListIds.length === 0 
                              ? "Nenhuma" 
                              : `${compareListIds.length} lista${compareListIds.length > 1 ? "s" : ""}`}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[250px] p-0 bg-background border shadow-lg z-50" align="start">
                        <ScrollArea className="max-h-[200px]">
                          <div className="p-1">
                            {savedLists.map(lista => (
                              <div 
                                key={lista.id}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer text-sm ${
                                  compareListIds.includes(lista.id) 
                                    ? "bg-accent" 
                                    : "hover:bg-accent"
                                }`}
                                onClick={() => {
                                  setCompareListIds(prev => 
                                    prev.includes(lista.id) 
                                      ? prev.filter(id => id !== lista.id)
                                      : [...prev, lista.id]
                                  );
                                }}
                              >
                                <Checkbox 
                                  checked={compareListIds.includes(lista.id)}
                                  className="h-4 w-4"
                                />
                                <span className="truncate flex-1">{lista.nome}</span>
                                <span className="text-xs text-muted-foreground">{lista.total_contatos}</span>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                        {compareListIds.length > 0 && (
                          <div className="p-1 border-t">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="w-full text-xs h-7"
                              onClick={() => setCompareListIds([])}
                            >
                              Limpar
                            </Button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>

              {/* Opções de Extração */}
              <div className="grid gap-3 md:grid-cols-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label htmlFor="scrapeContacts" className="font-normal text-sm">Extrair Contatos</Label>
                  <Switch id="scrapeContacts" checked={scrapeContacts} onCheckedChange={setScrapeContacts} />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label htmlFor="scrapePlaceDetailPage" className="font-normal text-sm">Página de Detalhes</Label>
                  <Switch id="scrapePlaceDetailPage" checked={scrapePlaceDetailPage} onCheckedChange={setScrapePlaceDetailPage} />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <Label htmlFor="skipClosedPlaces" className="font-normal text-sm">Pular Fechados</Label>
                  <Switch id="skipClosedPlaces" checked={skipClosedPlaces} onCheckedChange={setSkipClosedPlaces} />
                </div>
              </div>

              {/* Social Media Options */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Redes Sociais</Label>
                <div className="grid gap-3 md:grid-cols-5">
                  <div className="flex items-center justify-between space-x-2 p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <Facebook className="h-4 w-4 text-blue-600" />
                      <Label htmlFor="facebook" className="font-normal text-sm">Facebook</Label>
                    </div>
                    <Switch
                      id="facebook"
                      checked={scrapeSocialMedia.facebooks}
                      onCheckedChange={() => toggleSocialMedia("facebooks")}
                    />
                  </div>
                  <div className="flex items-center justify-between space-x-2 p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <Instagram className="h-4 w-4 text-pink-600" />
                      <Label htmlFor="instagram" className="font-normal text-sm">Instagram</Label>
                    </div>
                    <Switch
                      id="instagram"
                      checked={scrapeSocialMedia.instagrams}
                      onCheckedChange={() => toggleSocialMedia("instagrams")}
                    />
                  </div>
                  <div className="flex items-center justify-between space-x-2 p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <Youtube className="h-4 w-4 text-red-600" />
                      <Label htmlFor="youtube" className="font-normal text-sm">YouTube</Label>
                    </div>
                    <Switch
                      id="youtube"
                      checked={scrapeSocialMedia.youtubes}
                      onCheckedChange={() => toggleSocialMedia("youtubes")}
                    />
                  </div>
                  <div className="flex items-center justify-between space-x-2 p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">𝕏</span>
                      <Label htmlFor="twitter" className="font-normal text-sm">Twitter/X</Label>
                    </div>
                    <Switch
                      id="twitter"
                      checked={scrapeSocialMedia.twitters}
                      onCheckedChange={() => toggleSocialMedia("twitters")}
                    />
                  </div>
                  <div className="flex items-center justify-between space-x-2 p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🎵</span>
                      <Label htmlFor="tiktok" className="font-normal text-sm">TikTok</Label>
                    </div>
                    <Switch
                      id="tiktok"
                      checked={scrapeSocialMedia.tiktoks}
                      onCheckedChange={() => toggleSocialMedia("tiktoks")}
                    />
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Extract Button */}
          <div className="flex flex-col items-end gap-3">
            <Button 
              onClick={handleExtract} 
              disabled={isExtracting}
              size="lg"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Extraindo...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Extrair Dados
                </>
              )}
            </Button>

            {isExtracting && (
              <div className="w-full max-w-md">
                <Progress value={progress} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Coletando resultados...
                </p>
              </div>
            )}
          </div>

          {extractionStatus && (
            <div className={`p-3 rounded-lg border flex items-center gap-2 ${
              extractionStatus.includes("Erro") 
                ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800" 
                : extractionStatus.includes("concluída")
                ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
                : "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800"
            }`}>
              {extractionStatus.includes("Erro") ? (
                <AlertCircle className="h-4 w-4 text-red-600" />
              ) : extractionStatus.includes("concluída") ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
              )}
              <span className="text-sm">{extractionStatus}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {extractedData.length > 0 && (
        <div className="space-y-4">
          {/* Compare with List */}
          <Card className="border-dashed">
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <GitCompare className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Comparar com listas:</Label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {savedLists.map(lista => (
                    <Badge 
                      key={lista.id}
                      variant={compareListIds.includes(lista.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => {
                        setCompareListIds(prev => 
                          prev.includes(lista.id) 
                            ? prev.filter(id => id !== lista.id)
                            : [...prev, lista.id]
                        );
                      }}
                    >
                      {lista.nome} ({lista.total_contatos})
                    </Badge>
                  ))}
                  {savedLists.length === 0 && (
                    <span className="text-sm text-muted-foreground">Nenhuma lista salva</span>
                  )}
                </div>

                {duplicateStats && (
                  <>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Total: <strong className="text-foreground">{duplicateStats.total}</strong>
                      </span>
                      <span className="text-green-600">
                        Novos: <strong>{duplicateStats.unique}</strong>
                      </span>
                      <span className="text-orange-600">
                        Repetidos: <strong>{duplicateStats.duplicates}</strong>
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-auto">
                      <Button 
                        variant={showDuplicatesOnly ? "default" : "outline"} 
                        size="sm"
                        onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
                      >
                        {showDuplicatesOnly ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
                        {showDuplicatesOnly ? "Mostrando repetidos" : "Mostrar só repetidos"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {duplicateStats && showDuplicatesOnly 
                  ? duplicateStats.duplicates
                  : duplicateStats && !showDuplicatesOnly && compareListIds.length > 0
                  ? duplicateStats.unique
                  : extractedData.length
                }
              </span> {duplicateStats && showDuplicatesOnly ? "repetidos" : duplicateStats && compareListIds.length > 0 ? "novos" : "resultados encontrados"}
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button variant="default" size="sm" onClick={openSaveDialog}>
                <Save className="h-4 w-4 mr-2" />
                Salvar Lista
              </Button>
              <Button variant="outline" size="sm" onClick={copyAllPhones}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar Telefones
              </Button>
              <Button variant="outline" size="sm" onClick={exportToCsv}>
                <Download className="h-4 w-4 mr-2" />
                Baixar CSV
              </Button>
              <Button variant="ghost" size="sm" onClick={clearResults}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Results Grid */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {extractedData
              .filter(business => {
                if (compareListIds.length === 0) return true;
                if (showDuplicatesOnly) return business._isDuplicate === true;
                return business._isDuplicate !== true;
              })
              .map((business, index) => (
              <div 
                key={index} 
                className={`p-4 border rounded-xl bg-card hover:shadow-sm transition-shadow ${
                  business._isDuplicate ? "border-orange-300 bg-orange-50/50 dark:bg-orange-950/20" : ""
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-sm truncate">{business.name}</h3>
                      {business._isDuplicate && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-400 text-orange-600 shrink-0">
                          Repetido
                        </Badge>
                      )}
                    </div>
                    {business.category && (
                      <p className="text-xs text-muted-foreground truncate">{business.category}</p>
                    )}
                  </div>
                  {business.rating && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-yellow-500 text-sm">★</span>
                      <span className="text-xs font-medium">{business.rating}</span>
                    </div>
                  )}
                </div>

                {/* Contact Info */}
                <div className="space-y-1.5 mb-3">
                  {business.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-mono truncate">{business.phone}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 ml-auto"
                        onClick={() => copyToClipboard(business.phone)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {business.email && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs shrink-0">@</span>
                      <span className="text-sm truncate">{business.email}</span>
                    </div>
                  )}
                  {business.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground truncate">{business.address}</span>
                    </div>
                  )}
                </div>

                {/* Links */}
                <div className="flex items-center gap-1 pt-2 border-t">
                  {business.website && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => window.open(business.website, "_blank")}
                    >
                      <Globe className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {business.facebook && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => window.open(business.facebook, "_blank")}
                    >
                      <Facebook className="h-3.5 w-3.5 text-blue-600" />
                    </Button>
                  )}
                  {business.instagram && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => window.open(business.instagram, "_blank")}
                    >
                      <Instagram className="h-3.5 w-3.5 text-pink-600" />
                    </Button>
                  )}
                  {business.youtube && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => window.open(business.youtube, "_blank")}
                    >
                      <Youtube className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {extractedData.length === 0 && !isExtracting && !extractionStatus && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground text-sm">
            Preencha os campos e clique em "Extrair Dados"
          </p>
        </div>
      )}
        </TabsContent>

        <TabsContent value="listas" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowCompareDialog(true)}>
              <GitCompare className="h-4 w-4 mr-2" />
              Comparar Listas
            </Button>
          </div>
          <ListasSalvasCard refreshTrigger={listasRefreshTrigger} />
        </TabsContent>
      </Tabs>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar Lista</DialogTitle>
            <DialogDescription>
              Salve esta lista para usar em campanhas de disparo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="listName">Nome da Lista</Label>
              <Input
                id="listName"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="Ex: Dentistas SP"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {extractedData.length} contatos serão salvos
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveList} disabled={isSaving || !listName.trim()}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Compare Lists Dialog */}
      <CompararListasDialog 
        open={showCompareDialog} 
        onOpenChange={setShowCompareDialog} 
      />
    </div>
  );
}
