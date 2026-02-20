import { useState, useRef, useCallback } from "react";
import { Upload, FileText, ArrowRight, X, Check, ChevronDown, Database, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { normalizePhoneNumber } from "@/utils/whatsapp";

// ── Campos do sistema para mapear ──────────────────────────────────────────
const CAMPOS_SISTEMA = [
  { key: "telefone", label: "Telefone", required: true },
  { key: "nome", label: "Nome" },
  { key: "email", label: "Email" },
  { key: "cidade", label: "Cidade" },
  { key: "ignorar", label: "Ignorar coluna" },
];

interface ImportarListaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onListaImportada: () => void;
}

interface ColunaMapeamento {
  colunaCsv: string;
  campoSistema: string; // key do CAMPOS_SISTEMA ou ""
}

type Etapa = "upload" | "mapeamento" | "confirmacao";

export function ImportarListaDialog({ open, onOpenChange, onListaImportada }: ImportarListaDialogProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [nomeLista, setNomeLista] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapeamentos, setMapeamentos] = useState<ColunaMapeamento[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // ── Parsing CSV ─────────────────────────────────────────────────────────
  const parseCsv = (text: string): { headers: string[]; rows: string[][] } => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if ((ch === "," || ch === ";") && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseRow(lines[0]);
    const rows = lines.slice(1).map(parseRow);
    return { headers, rows };
  };

  // ── Auto-detect column mapping ──────────────────────────────────────────
  const autoDetectMappings = (headers: string[]): ColunaMapeamento[] => {
    return headers.map((h) => {
      const lower = h.toLowerCase();
      let campoSistema = "";

      if (/tel|fone|phone|cel|whats|numero|número|mobile/i.test(lower)) campoSistema = "telefone";
      else if (/nome|name|primeiro|first/i.test(lower)) campoSistema = "nome";
      else if (/email|e-mail|mail/i.test(lower)) campoSistema = "email";
      else if (/cidad|city|municipio|município/i.test(lower)) campoSistema = "cidade";

      return { colunaCsv: h, campoSistema };
    });
  };

  // ── File upload ─────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Use filename (without extension) as suggested list name
    const suggested = file.name.replace(/\.[^/.]+$/, "");
    if (!nomeLista) setNomeLista(suggested);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const { headers, rows } = parseCsv(text);

      if (headers.length === 0) {
        toast.error("Arquivo vazio ou inválido");
        return;
      }

      setCsvHeaders(headers);
      setCsvRows(rows);
      setMapeamentos(autoDetectMappings(headers));
      setEtapa("mapeamento");
    };
    reader.readAsText(file, "UTF-8");

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Mapeamento helpers ──────────────────────────────────────────────────
  const updateMapeamento = (colunaCsv: string, campoSistema: string) => {
    setMapeamentos((prev) =>
      prev.map((m) => (m.colunaCsv === colunaCsv ? { ...m, campoSistema } : m))
    );
  };

  const campoJaMapeado = (campoKey: string, colunaCsvAtual: string): boolean => {
    if (campoKey === "ignorar" || campoKey === "") return false;
    return mapeamentos.some((m) => m.campoSistema === campoKey && m.colunaCsv !== colunaCsvAtual);
  };

  // ── Contatos parseados (preview + submit) ───────────────────────────────
  const getContatosFromCsv = useCallback((): Array<{
    nome?: string;
    telefone: string;
    email?: string;
    cidade?: string;
    dados_extras?: Record<string, string>;
  }> => {
    const telefoneCol = mapeamentos.find((m) => m.campoSistema === "telefone")?.colunaCsv;
    if (!telefoneCol) return [];

    const telefoneIdx = csvHeaders.indexOf(telefoneCol);
    if (telefoneIdx === -1) return [];

    return csvRows
      .map((row) => {
        const get = (campo: string) => {
          const coluna = mapeamentos.find((m) => m.campoSistema === campo)?.colunaCsv;
          if (!coluna) return undefined;
          const idx = csvHeaders.indexOf(coluna);
          return idx !== -1 ? row[idx]?.trim() || undefined : undefined;
        };

        const rawPhone = row[telefoneIdx]?.trim() || "";
        const telefone = normalizePhoneNumber(rawPhone);
        if (telefone.length < 8) return null;

        // Extras: columns not mapped to any system field (and not ignored)
        const dados_extras: Record<string, string> = {};
        mapeamentos.forEach((m) => {
          if (!m.campoSistema || m.campoSistema === "ignorar") return;
          if (["telefone", "nome", "email", "cidade"].includes(m.campoSistema)) return;
          const idx = csvHeaders.indexOf(m.colunaCsv);
          if (idx !== -1 && row[idx]) {
            dados_extras[m.colunaCsv] = row[idx].trim();
          }
        });

        return {
          telefone,
          nome: get("nome"),
          email: get("email"),
          cidade: get("cidade"),
          dados_extras: Object.keys(dados_extras).length > 0 ? dados_extras : undefined,
        };
      })
      .filter(Boolean) as any[];
  }, [csvHeaders, csvRows, mapeamentos]);

  const contatosValidos = getContatosFromCsv();

  // ── Salvar lista no banco ───────────────────────────────────────────────
  const handleSalvar = async () => {
    if (!user) return;
    if (!nomeLista.trim()) {
      toast.error("Digite o nome da lista");
      return;
    }
    if (contatosValidos.length === 0) {
      toast.error("Nenhum contato válido. Verifique se a coluna de Telefone está mapeada.");
      return;
    }

    setIsLoading(true);
    try {
      // 1. Criar a lista
      const { data: lista, error: listaError } = await supabase
        .from("listas_importadas")
        .insert({
          user_id: user.id,
          nome: nomeLista.trim(),
          total_contatos: contatosValidos.length,
          colunas_mapeamento: mapeamentos as any,
        })
        .select()
        .single();

      if (listaError) throw listaError;

      // 2. Inserir contatos em batches de 500
      const BATCH = 500;
      for (let i = 0; i < contatosValidos.length; i += BATCH) {
        const batch = contatosValidos.slice(i, i + BATCH).map((c) => ({
          lista_id: lista.id,
          user_id: user.id,
          telefone: c.telefone,
          nome: c.nome || null,
          email: c.email || null,
          cidade: c.cidade || null,
          dados_extras: c.dados_extras || null,
        }));

        const { error: contatosError } = await supabase
          .from("lista_importada_contatos")
          .insert(batch);

        if (contatosError) throw contatosError;
      }

      toast.success(`Lista "${nomeLista}" importada com ${contatosValidos.length} contatos!`);
      onListaImportada();
      handleClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao salvar lista");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setEtapa("upload");
    setNomeLista("");
    setCsvHeaders([]);
    setCsvRows([]);
    setMapeamentos([]);
    onOpenChange(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Importar Lista de Contatos
          </DialogTitle>
        </DialogHeader>

        {/* ─── ETAPA 1: Upload ─────────────────────────────── */}
        {etapa === "upload" && (
          <div className="flex-1 flex flex-col gap-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome-lista">Nome da lista</Label>
              <Input
                id="nome-lista"
                placeholder="Ex: Leads Instagram – Fevereiro 2026"
                value={nomeLista}
                onChange={(e) => setNomeLista(e.target.value)}
              />
            </div>

            <div
              className="border-2 border-dashed border-border rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-10 h-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Clique para selecionar um arquivo CSV</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Arquivos .csv separados por vírgula ou ponto-e-vírgula
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          </div>
        )}

        {/* ─── ETAPA 2: Mapeamento ─────────────────────────── */}
        {etapa === "mapeamento" && (
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            <div className="space-y-2">
              <Label htmlFor="nome-lista-map">Nome da lista</Label>
              <Input
                id="nome-lista-map"
                value={nomeLista}
                onChange={(e) => setNomeLista(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              <span>{csvRows.length} linhas detectadas · {csvHeaders.length} colunas</span>
            </div>

            {/* Header labels */}
            <div className="grid grid-cols-2 gap-4 text-xs font-medium text-muted-foreground px-1">
              <span>Coluna do CSV</span>
              <span>Campo do sistema</span>
            </div>

            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-3">
                {mapeamentos.map((m) => {
                  // preview value from first data row
                  const colIdx = csvHeaders.indexOf(m.colunaCsv);
                  const preview = csvRows[0]?.[colIdx]?.trim() || "";

                  return (
                    <div key={m.colunaCsv} className="grid grid-cols-2 gap-4 items-center">
                      {/* Left: CSV column */}
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium truncate">{m.colunaCsv}</p>
                        {preview && (
                          <p className="text-xs text-muted-foreground truncate">
                            Ex: {preview}
                          </p>
                        )}
                      </div>

                      {/* Arrow + Select */}
                      <div className="flex items-center gap-2">
                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        <Select
                          value={m.campoSistema || "__nenhum__"}
                          onValueChange={(val) =>
                            updateMapeamento(m.colunaCsv, val === "__nenhum__" ? "" : val)
                          }
                        >
                          <SelectTrigger
                            className={
                              m.campoSistema && m.campoSistema !== "ignorar"
                                ? "border-green-500 bg-green-500/5"
                                : m.campoSistema === "ignorar"
                                ? "border-muted"
                                : "border-destructive/50"
                            }
                          >
                            <SelectValue placeholder="Selecionar campo…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__nenhum__">
                              <span className="text-muted-foreground">— Não mapear —</span>
                            </SelectItem>
                            {CAMPOS_SISTEMA.map((c) => (
                              <SelectItem
                                key={c.key}
                                value={c.key}
                                disabled={campoJaMapeado(c.key, m.colunaCsv)}
                              >
                                <div className="flex items-center gap-2">
                                  {c.label}
                                  {c.required && (
                                    <Badge variant="destructive" className="text-[10px] px-1 py-0">
                                      obrigatório
                                    </Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Preview count */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-sm text-muted-foreground">
                {contatosValidos.length} contato(s) válido(s) serão importados
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEtapa("upload")}>
                  Voltar
                </Button>
                <Button
                  onClick={handleSalvar}
                  disabled={isLoading || contatosValidos.length === 0 || !nomeLista.trim()}
                >
                  {isLoading ? "Salvando…" : `Importar ${contatosValidos.length} contatos`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
