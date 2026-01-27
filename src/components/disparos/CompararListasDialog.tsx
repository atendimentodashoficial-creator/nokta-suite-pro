import { useState, useEffect, useRef } from "react";
import { 
  ListFilter, 
  Download, 
  CheckCircle, 
  XCircle, 
  Users,
  FileText,
  ArrowRight,
  FileUp,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type ModoComparacao = "lista" | "campanhas";

interface Campanha {
  id: string;
  nome: string;
  total_contatos: number;
  enviados: number;
  created_at: string;
}

interface ContatoComparacao {
  numero: string;
  nome?: string;
  enviado: boolean;
  campanhasEnviadas: string[];
}

interface ContatoDuplicado {
  numero: string;
  nome?: string;
  campanhas: string[];
  vezes: number;
}

interface CompararListasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompararListasDialog({
  open,
  onOpenChange
}: CompararListasDialogProps) {
  const [modo, setModo] = useState<ModoComparacao>("lista");
  const [step, setStep] = useState<"mode" | "input" | "select" | "result">("mode");
  const [listaInput, setListaInput] = useState("");
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [selectedCampanhas, setSelectedCampanhas] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [resultado, setResultado] = useState<ContatoComparacao[]>([]);
  const [duplicados, setDuplicados] = useState<ContatoDuplicado[]>([]);
  const [activeResultTab, setActiveResultTab] = useState("nao_enviados");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      loadCampanhas();
      setModo("lista");
      setStep("mode");
      setListaInput("");
      setSelectedCampanhas(new Set());
      setResultado([]);
      setDuplicados([]);
    }
  }, [open]);

  const loadCampanhas = async () => {
    try {
      const { data, error } = await supabase
        .from("disparos_campanhas")
        .select("id, nome, total_contatos, enviados, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCampanhas(data || []);
    } catch (error) {
      console.error("Error loading campaigns:", error);
      toast.error("Erro ao carregar campanhas");
    }
  };

  const parseListaContatos = (input: string): { numero: string; nome?: string }[] => {
    const lines = input.split("\n").filter(line => line.trim());
    const contatos: { numero: string; nome?: string }[] = [];

    for (const line of lines) {
      const parts = line.split(/[;,\t]/).map(p => p.trim());
      
      if (parts.length >= 2) {
        const isFirstNumber = /^\d+$/.test(parts[0].replace(/\D/g, '')) && parts[0].replace(/\D/g, '').length >= 8;
        const isSecondNumber = /^\d+$/.test(parts[1].replace(/\D/g, '')) && parts[1].replace(/\D/g, '').length >= 8;
        
        if (isFirstNumber && !isSecondNumber) {
          contatos.push({ numero: parts[0].replace(/\D/g, ''), nome: parts[1] });
        } else if (isSecondNumber) {
          contatos.push({ numero: parts[1].replace(/\D/g, ''), nome: parts[0] });
        } else if (isFirstNumber) {
          contatos.push({ numero: parts[0].replace(/\D/g, '') });
        }
      } else if (parts.length === 1) {
        const numero = parts[0].replace(/\D/g, '');
        if (numero.length >= 8) {
          contatos.push({ numero });
        }
      }
    }

    return contatos;
  };

  // Normalize phone for comparison - returns array of possible matches
  // to handle 9th digit inconsistencies in Brazilian numbers
  const getPhoneVariants = (phone: string): string[] => {
    const digits = phone.replace(/\D/g, '');
    const last8 = digits.slice(-8);
    const last9 = digits.slice(-9);
    
    // If the 9th-to-last digit is '9', also check without it
    // This handles cases where one list has 9 and other doesn't
    const variants = [last8];
    
    if (last9.startsWith('9') && last9.length === 9) {
      // Number has 9th digit - also compare with last 8 (without the 9)
      variants.push(last9);
    } else if (digits.length >= 8) {
      // Number might not have 9th digit - also check with 9 prepended
      variants.push('9' + last8);
    }
    
    return variants;
  };

  const getLast8Digits = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    return digits.slice(-8);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setListaInput(prev => prev ? `${prev}\n${content}` : content);
      toast.success(`Arquivo "${file.name}" carregado`);
    };
    reader.onerror = () => {
      toast.error("Erro ao ler arquivo");
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAvancar = () => {
    const contatos = parseListaContatos(listaInput);
    if (contatos.length === 0) {
      toast.error("Nenhum contato válido encontrado na lista");
      return;
    }
    setStep("select");
  };

  const handleComparar = async () => {
    if (selectedCampanhas.size === 0) {
      toast.error("Selecione pelo menos uma campanha");
      return;
    }

    setIsLoading(true);
    try {
      const contatosLista = parseListaContatos(listaInput);
      
      // Include both active and archived contacts for complete history comparison
      const { data: contatosCampanha, error } = await supabase
        .from("disparos_campanha_contatos")
        .select("numero, campanha_id, archived")
        .in("campanha_id", Array.from(selectedCampanhas));

      if (error) throw error;

      // Build map using all phone variants for better matching
      const contatosVariantsMap = new Map<string, string[]>();
      
      for (const contato of contatosCampanha || []) {
        const variants = getPhoneVariants(contato.numero);
        const campanha = campanhas.find(c => c.id === contato.campanha_id);
        
        for (const variant of variants) {
          if (!contatosVariantsMap.has(variant)) {
            contatosVariantsMap.set(variant, []);
          }
          if (campanha && !contatosVariantsMap.get(variant)!.includes(campanha.nome)) {
            contatosVariantsMap.get(variant)!.push(campanha.nome);
          }
        }
      }

      const resultado: ContatoComparacao[] = contatosLista.map(contato => {
        const variants = getPhoneVariants(contato.numero);
        
        // Check all variants for matches
        let campanhasEncontradas: string[] = [];
        for (const variant of variants) {
          const found = contatosVariantsMap.get(variant) || [];
          for (const camp of found) {
            if (!campanhasEncontradas.includes(camp)) {
              campanhasEncontradas.push(camp);
            }
          }
        }
        
        return {
          numero: contato.numero,
          nome: contato.nome,
          enviado: campanhasEncontradas.length > 0,
          campanhasEnviadas: campanhasEncontradas
        };
      });

      setResultado(resultado);
      setStep("result");
    } catch (error) {
      console.error("Error comparing lists:", error);
      toast.error("Erro ao comparar listas");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompararEntreCampanhas = async () => {
    if (selectedCampanhas.size < 2) {
      toast.error("Selecione pelo menos duas campanhas para comparar");
      return;
    }

    setIsLoading(true);
    try {
      // Include both active and archived contacts for complete history comparison
      const { data: contatosCampanha, error } = await supabase
        .from("disparos_campanha_contatos")
        .select("numero, nome, campanha_id, archived")
        .in("campanha_id", Array.from(selectedCampanhas));

      if (error) throw error;

      // Use normalized key (last 8 digits) for grouping duplicates
      const contatosMap = new Map<string, { numero: string; nome?: string; campanhas: Set<string> }>();
      
      for (const contato of contatosCampanha || []) {
        // Use last 8 as primary key for grouping
        const last8 = getLast8Digits(contato.numero);
        const campanha = campanhas.find(c => c.id === contato.campanha_id);
        
        if (!contatosMap.has(last8)) {
          contatosMap.set(last8, { 
            numero: contato.numero, 
            nome: contato.nome || undefined,
            campanhas: new Set() 
          });
        }
        
        if (campanha) {
          contatosMap.get(last8)!.campanhas.add(campanha.nome);
        }
      }

      const duplicados: ContatoDuplicado[] = [];
      contatosMap.forEach((value) => {
        if (value.campanhas.size > 1) {
          duplicados.push({
            numero: value.numero,
            nome: value.nome,
            campanhas: Array.from(value.campanhas),
            vezes: value.campanhas.size
          });
        }
      });

      duplicados.sort((a, b) => b.vezes - a.vezes);

      setDuplicados(duplicados);
      setStep("result");
    } catch (error) {
      console.error("Error comparing campaigns:", error);
      toast.error("Erro ao comparar campanhas");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCampanha = (campanhaId: string) => {
    setSelectedCampanhas(prev => {
      const next = new Set(prev);
      if (next.has(campanhaId)) {
        next.delete(campanhaId);
      } else {
        next.add(campanhaId);
      }
      return next;
    });
  };

  const selectAllCampanhas = () => {
    setSelectedCampanhas(new Set(campanhas.map(c => c.id)));
  };

  const deselectAllCampanhas = () => {
    setSelectedCampanhas(new Set());
  };

  const naoEnviados = resultado.filter(c => !c.enviado);
  const enviados = resultado.filter(c => c.enviado);

  const exportarNaoEnviados = () => {
    if (naoEnviados.length === 0) {
      toast.error("Não há contatos para exportar");
      return;
    }

    const content = naoEnviados
      .map(c => c.nome ? `${c.nome};${c.numero}` : c.numero)
      .join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contatos_nao_enviados_${format(new Date(), "yyyy-MM-dd_HH-mm")}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success(`${naoEnviados.length} contatos exportados`);
  };

  const copiarNaoEnviados = () => {
    if (naoEnviados.length === 0) {
      toast.error("Não há contatos para copiar");
      return;
    }

    const content = naoEnviados
      .map(c => c.nome ? `${c.nome};${c.numero}` : c.numero)
      .join("\n");

    navigator.clipboard.writeText(content);
    toast.success(`${naoEnviados.length} contatos copiados`);
  };

  const exportarDuplicados = () => {
    if (duplicados.length === 0) {
      toast.error("Não há contatos duplicados para exportar");
      return;
    }

    const content = duplicados
      .map(c => `${c.nome || c.numero};${c.numero};${c.campanhas.join(", ")}`)
      .join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contatos_duplicados_${format(new Date(), "yyyy-MM-dd_HH-mm")}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success(`${duplicados.length} contatos duplicados exportados`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListFilter className="h-5 w-5" />
            Comparar Listas
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {step === "mode" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setModo("lista");
                    setStep("input");
                  }}
                  className="border rounded-lg p-6 text-left hover:bg-accent/50 transition-colors space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="font-medium">Comparar Lista</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Compare uma lista de contatos com campanhas já enviadas para ver quais ainda não receberam
                  </p>
                </button>

                <button
                  onClick={() => {
                    setModo("campanhas");
                    setStep("select");
                  }}
                  className="border rounded-lg p-6 text-left hover:bg-accent/50 transition-colors space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-orange-500" />
                    <span className="font-medium">Encontrar Duplicados</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Descubra contatos que receberam mensagens em mais de uma campanha
                  </p>
                </button>
              </div>
            </div>
          )}

          {step === "input" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Lista de contatos</Label>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="gap-1"
                    >
                      <FileUp className="h-4 w-4" />
                      Anexar arquivo
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Cole ou anexe sua lista. Formatos: número, nome;número, ou número;nome (um por linha)
                </p>
                <Textarea
                  placeholder="11999999999&#10;João Silva;11988888888&#10;11977777777;Maria Santos"
                  value={listaInput}
                  onChange={(e) => setListaInput(e.target.value)}
                  className="min-h-[200px] font-mono text-sm"
                />
              </div>

              {listaInput && (
                <p className="text-sm text-muted-foreground">
                  {parseListaContatos(listaInput).length} contatos detectados
                </p>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep("mode")}>
                  Voltar
                </Button>
                <Button 
                  onClick={handleAvancar}
                  disabled={!listaInput.trim()}
                >
                  Avançar
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {step === "select" && (
            <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <div>
                <Label>
                  {modo === "lista" 
                    ? "Selecione as campanhas para comparar" 
                    : "Selecione as campanhas para buscar duplicados"}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {modo === "lista"
                    ? "Os contatos serão verificados contra as campanhas selecionadas"
                    : "Selecione pelo menos 2 campanhas para encontrar contatos duplicados"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={selectAllCampanhas}>
                  Selecionar todas
                </Button>
                <Button size="sm" variant="ghost" onClick={deselectAllCampanhas}>
                  Limpar seleção
                </Button>
                <Badge variant="secondary" className="ml-auto">
                  {selectedCampanhas.size} selecionadas
                </Badge>
              </div>

              <ScrollArea className="flex-1 border rounded-lg">
                <div className="p-2 space-y-1">
                  {campanhas.map((campanha) => (
                    <div
                      key={campanha.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${
                        selectedCampanhas.has(campanha.id) ? "bg-accent/50" : ""
                      }`}
                      onClick={() => toggleCampanha(campanha.id)}
                    >
                      <Checkbox
                        checked={selectedCampanhas.has(campanha.id)}
                        onCheckedChange={() => toggleCampanha(campanha.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{campanha.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {campanha.enviados} enviados de {campanha.total_contatos} • 
                          {format(new Date(campanha.created_at), " dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {campanhas.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhuma campanha encontrada
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(modo === "lista" ? "input" : "mode")}>
                  Voltar
                </Button>
                {modo === "lista" ? (
                  <Button 
                    onClick={handleComparar}
                    disabled={selectedCampanhas.size === 0 || isLoading}
                  >
                    {isLoading ? "Comparando..." : "Comparar"}
                  </Button>
                ) : (
                  <Button 
                    onClick={handleCompararEntreCampanhas}
                    disabled={selectedCampanhas.size < 2 || isLoading}
                  >
                    {isLoading ? "Buscando..." : "Buscar Duplicados"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {step === "result" && modo === "lista" && (
            <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-card border rounded-lg p-4 text-center">
                  <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-2xl font-bold">{resultado.length}</p>
                  <p className="text-xs text-muted-foreground">Total na lista</p>
                </div>
                <div className="bg-card border rounded-lg p-4 text-center">
                  <CheckCircle className="h-5 w-5 mx-auto mb-1 text-green-500" />
                  <p className="text-2xl font-bold text-green-600">{enviados.length}</p>
                  <p className="text-xs text-muted-foreground">Já enviados</p>
                </div>
                <div className="bg-card border rounded-lg p-4 text-center">
                  <XCircle className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                  <p className="text-2xl font-bold text-orange-600">{naoEnviados.length}</p>
                  <p className="text-xs text-muted-foreground">Não enviados</p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={exportarNaoEnviados}
                  disabled={naoEnviados.length === 0}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Exportar não enviados
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={copiarNaoEnviados}
                  disabled={naoEnviados.length === 0}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Copiar
                </Button>
              </div>

              <Tabs value={activeResultTab} onValueChange={setActiveResultTab} className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="h-8">
                  <TabsTrigger value="nao_enviados" className="gap-1 text-xs px-3 h-7">
                    Não Enviados <Badge variant="secondary" className="ml-1 text-[10px]">{naoEnviados.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="enviados" className="gap-1 text-xs px-3 h-7">
                    Já Enviados <Badge variant="secondary" className="ml-1 text-[10px]">{enviados.length}</Badge>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="nao_enviados" className="flex-1 overflow-hidden mt-2">
                  <ScrollArea className="h-[250px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Número</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {naoEnviados.map((contato, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{contato.nome || "-"}</TableCell>
                            <TableCell>{contato.numero}</TableCell>
                          </TableRow>
                        ))}
                        {naoEnviados.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                              Todos os contatos já foram enviados!
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="enviados" className="flex-1 overflow-hidden mt-2">
                  <ScrollArea className="h-[250px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Número</TableHead>
                          <TableHead>Campanhas</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {enviados.map((contato, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{contato.nome || "-"}</TableCell>
                            <TableCell>{contato.numero}</TableCell>
                            <TableCell className="max-w-[200px]">
                              <div className="flex flex-wrap gap-1">
                                {contato.campanhasEnviadas.map((nome, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {nome}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {enviados.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                              Nenhum contato foi enviado ainda
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </TabsContent>
              </Tabs>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep("mode")}>
                  Nova comparação
                </Button>
                <Button onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          )}

          {step === "result" && modo === "campanhas" && (
            <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card border rounded-lg p-4 text-center">
                  <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-2xl font-bold">{selectedCampanhas.size}</p>
                  <p className="text-xs text-muted-foreground">Campanhas analisadas</p>
                </div>
                <div className="bg-card border rounded-lg p-4 text-center">
                  <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                  <p className="text-2xl font-bold text-orange-600">{duplicados.length}</p>
                  <p className="text-xs text-muted-foreground">Contatos duplicados</p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={exportarDuplicados}
                  disabled={duplicados.length === 0}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Exportar duplicados
                </Button>
              </div>

              <ScrollArea className="flex-1 border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Número</TableHead>
                      <TableHead>Vezes</TableHead>
                      <TableHead>Campanhas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {duplicados.map((contato, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{contato.nome || "-"}</TableCell>
                        <TableCell>{contato.numero}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">{contato.vezes}x</Badge>
                        </TableCell>
                        <TableCell className="max-w-[250px]">
                          <div className="flex flex-wrap gap-1">
                            {contato.campanhas.map((nome, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {nome}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {duplicados.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Nenhum contato duplicado encontrado entre as campanhas selecionadas
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep("mode")}>
                  Nova comparação
                </Button>
                <Button onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
