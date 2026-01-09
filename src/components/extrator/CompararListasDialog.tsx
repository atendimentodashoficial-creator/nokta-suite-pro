import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  GitCompare,
  Loader2,
  Phone,
  Copy,
  Download,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
} from "lucide-react";

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

interface ListaExtrator {
  id: string;
  nome: string;
  dados: ExtractedBusiness[];
  total_contatos: number;
}

interface CompararListasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompararListasDialog({ open, onOpenChange }: CompararListasDialogProps) {
  const { user } = useAuth();
  const [listas, setListas] = useState<ListaExtrator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

  useEffect(() => {
    if (open && user) {
      loadListas();
    }
  }, [open, user]);

  const loadListas = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("listas_extrator")
        .select("id, nome, dados, total_contatos")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const parsed = (data || []).map(lista => ({
        ...lista,
        dados: typeof lista.dados === 'string' 
          ? JSON.parse(lista.dados) 
          : (lista.dados as unknown as ExtractedBusiness[])
      }));
      setListas(parsed);
    } catch (error) {
      console.error("Error loading listas:", error);
      toast.error("Erro ao carregar listas");
    } finally {
      setIsLoading(false);
    }
  };

  const normalizePhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    return digits.slice(-8);
  };

  const comparisonResult = useMemo(() => {
    if (selectedLists.length < 2) return null;

    const selectedListsData = listas.filter(l => selectedLists.includes(l.id));
    
    // Build phone count map across all selected lists
    const phoneOccurrences = new Map<string, { count: number; lists: string[]; business: ExtractedBusiness }>();
    
    selectedListsData.forEach(lista => {
      const seenInThisList = new Set<string>();
      lista.dados.forEach(business => {
        if (!business.phone) return;
        const normalized = normalizePhone(business.phone);
        if (seenInThisList.has(normalized)) return; // Skip duplicates within same list
        seenInThisList.add(normalized);
        
        const existing = phoneOccurrences.get(normalized);
        if (existing) {
          existing.count++;
          existing.lists.push(lista.nome);
        } else {
          phoneOccurrences.set(normalized, { 
            count: 1, 
            lists: [lista.nome], 
            business 
          });
        }
      });
    });

    const duplicates: { business: ExtractedBusiness; lists: string[] }[] = [];
    const unique: { business: ExtractedBusiness; list: string }[] = [];

    phoneOccurrences.forEach((value) => {
      if (value.count > 1) {
        duplicates.push({ business: value.business, lists: value.lists });
      } else {
        unique.push({ business: value.business, list: value.lists[0] });
      }
    });

    return { duplicates, unique, total: phoneOccurrences.size };
  }, [selectedLists, listas]);

  const toggleList = (listId: string) => {
    setSelectedLists(prev => 
      prev.includes(listId) 
        ? prev.filter(id => id !== listId)
        : [...prev, listId]
    );
    setShowResults(false);
  };

  const handleCompare = () => {
    if (selectedLists.length < 2) {
      toast.error("Selecione pelo menos 2 listas para comparar");
      return;
    }
    setShowResults(true);
  };

  const copyPhones = (isDuplicates: boolean) => {
    if (!comparisonResult) return;
    
    const phones = isDuplicates 
      ? comparisonResult.duplicates.map(d => d.business.phone)
      : comparisonResult.unique.map(u => u.business.phone);
    
    if (phones.length === 0) {
      toast.error("Nenhum telefone disponível");
      return;
    }
    navigator.clipboard.writeText(phones.join("\n"));
    toast.success(`${phones.length} telefones copiados!`);
  };

  const exportCsv = (isDuplicates: boolean) => {
    if (!comparisonResult) return;
    
    const items = isDuplicates 
      ? comparisonResult.duplicates.map(d => ({ ...d.business, listas: d.lists.join("; ") }))
      : comparisonResult.unique.map(u => ({ ...u.business, listas: u.list }));

    const headers = ["Nome", "Telefone", "Email", "Listas"];
    const rows = items.map(b => [
      b.name || "",
      b.phone || "",
      (b as ExtractedBusiness).email || "",
      (b as any).listas || ""
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `comparacao_${isDuplicates ? "repetidos" : "unicos"}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    toast.success("CSV exportado!");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            Comparar Listas
          </DialogTitle>
          <DialogDescription>
            Selecione 2 ou mais listas para identificar contatos repetidos e únicos
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : listas.length < 2 ? (
          <div className="text-center py-8 text-muted-foreground">
            Você precisa ter pelo menos 2 listas salvas para comparar
          </div>
        ) : !showResults ? (
          <div className="space-y-4">
            <Label className="text-sm font-medium">Selecione as listas para comparar:</Label>
            <div className="grid gap-2 max-h-[300px] overflow-y-auto">
              {listas.map(lista => (
                <div 
                  key={lista.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedLists.includes(lista.id) 
                      ? "border-primary bg-primary/5" 
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => toggleList(lista.id)}
                >
                  <Checkbox 
                    checked={selectedLists.includes(lista.id)}
                    onCheckedChange={() => toggleList(lista.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{lista.nome}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    <Phone className="h-3 w-3 mr-1" />
                    {lista.total_contatos}
                  </Badge>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleCompare} 
                disabled={selectedLists.length < 2}
              >
                <GitCompare className="h-4 w-4 mr-2" />
                Comparar ({selectedLists.length} listas)
              </Button>
            </div>
          </div>
        ) : comparisonResult && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold">{comparisonResult.total}</p>
                <p className="text-xs text-muted-foreground">Total únicos</p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg text-center border border-green-200 dark:border-green-800">
                <p className="text-2xl font-bold text-green-600">{comparisonResult.unique.length}</p>
                <p className="text-xs text-muted-foreground">Só em 1 lista</p>
              </div>
              <div className="p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg text-center border border-orange-200 dark:border-orange-800">
                <p className="text-2xl font-bold text-orange-600">{comparisonResult.duplicates.length}</p>
                <p className="text-xs text-muted-foreground">Repetidos</p>
              </div>
            </div>

            {/* Toggle View */}
            <div className="flex items-center justify-between">
              <Button
                variant={showDuplicatesOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
              >
                {showDuplicatesOnly ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
                {showDuplicatesOnly ? "Mostrando repetidos" : "Mostrando únicos"}
              </Button>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => copyPhones(showDuplicatesOnly)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar Telefones
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportCsv(showDuplicatesOnly)}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </div>

            {/* Results List */}
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {showDuplicatesOnly ? (
                  comparisonResult.duplicates.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      Nenhum contato repetido encontrado!
                    </div>
                  ) : (
                    comparisonResult.duplicates.map((item, index) => (
                      <div key={index} className="p-3 border rounded-lg border-orange-200 bg-orange-50/50 dark:bg-orange-950/20">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{item.business.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{item.business.phone}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px] border-orange-400 text-orange-600 shrink-0">
                            Em {item.lists.length} listas
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {item.lists.join(", ")}
                        </p>
                      </div>
                    ))
                  )
                ) : (
                  comparisonResult.unique.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <XCircle className="h-8 w-8 mx-auto mb-2 text-orange-500" />
                      Todos os contatos estão repetidos!
                    </div>
                  ) : (
                    comparisonResult.unique.map((item, index) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{item.business.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{item.business.phone}</p>
                          </div>
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {item.list}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )
                )}
              </div>
            </ScrollArea>

            <div className="flex justify-between pt-4 border-t">
              <Button variant="ghost" onClick={() => setShowResults(false)}>
                ← Voltar
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
