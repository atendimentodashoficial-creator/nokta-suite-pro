import { useState, useRef, useCallback } from "react";
import { Upload, FileText, ArrowRight, Database } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { normalizePhoneNumber } from "@/utils/whatsapp";
import { useQuery } from "@tanstack/react-query";
import { CAMPOS_FIXOS, TIPOS_CAMPO, CampoSistema } from "./CamposSistemaManager";

interface ImportarListaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onListaImportada: () => void;
}

interface ColunaMapeamento {
  colunaCsv: string;
  campoSistema: string;
}

type Etapa = "upload" | "mapeamento";

function getTipoIcon(tipo: string) {
  const found = TIPOS_CAMPO.find((t) => t.value === tipo);
  const Icon = found?.icon;
  if (!Icon) return null;
  return <Icon className="w-3.5 h-3.5 text-muted-foreground" />;
}

export function ImportarListaDialog({ open, onOpenChange, onListaImportada }: ImportarListaDialogProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [nomeLista, setNomeLista] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapeamentos, setMapeamentos] = useState<ColunaMapeamento[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Busca campos personalizados ativos
  const { data: camposCustom = [] } = useQuery<CampoSistema[]>({
    queryKey: ["lista-campos-sistema", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lista_campos_sistema" as any)
        .select("*")
        .eq("user_id", user!.id)
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CampoSistema[];
    },
    enabled: !!user?.id && open,
  });

  // Todos os campos disponíveis para mapeamento
  const todosCampos = [
    ...CAMPOS_FIXOS.map((f) => ({ key: f.key, label: f.label, required: f.required, tipo: f.tipo, isFixed: true })),
    ...camposCustom.map((c) => ({ key: c.chave, label: c.nome, required: c.obrigatorio, tipo: c.tipo, isFixed: false })),
    { key: "ignorar", label: "Ignorar coluna", required: false, tipo: "", isFixed: true },
  ];

  // ── Parsing CSV ─────────────────────────────────────────────────────────
  // Suporta campos com quebras de linha dentro de aspas (ex: campo Descrição)
  const parseCsv = (text: string): { headers: string[]; rows: string[][] } => {
    const parseAllRows = (input: string): string[][] => {
      const rows: string[][] = [];
      let row: string[] = [];
      let current = "";
      let inQuotes = false;
      // Detecta delimitador predominante
      const firstLine = input.slice(0, input.indexOf("\n") || input.length);
      const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";

      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        const next = input[i + 1];

        if (ch === '"') {
          if (inQuotes && next === '"') {
            // Escaped quote ""
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === delimiter && !inQuotes) {
          row.push(current.trim());
          current = "";
        } else if ((ch === "\n" || (ch === "\r" && next === "\n")) && !inQuotes) {
          if (ch === "\r") i++; // skip \n after \r
          row.push(current.trim());
          current = "";
          if (row.some((c) => c !== "")) rows.push(row);
          row = [];
        } else if (ch === "\r" && !inQuotes) {
          // lone \r
          row.push(current.trim());
          current = "";
          if (row.some((c) => c !== "")) rows.push(row);
          row = [];
        } else {
          current += ch;
        }
      }
      // Last field
      if (current.trim() || row.length > 0) {
        row.push(current.trim());
        if (row.some((c) => c !== "")) rows.push(row);
      }
      return rows;
    };

    const allRows = parseAllRows(text);
    if (allRows.length === 0) return { headers: [], rows: [] };
    const headers = allRows[0];
    const rows = allRows.slice(1);
    return { headers, rows };
  };

  // ── Auto-detect ──────────────────────────────────────────────────────────
  const autoDetectMappings = (headers: string[]): ColunaMapeamento[] => {
    return headers.map((h) => {
      const lower = h.toLowerCase();
      let campoSistema = "";

      if (/tel|fone|phone|cel|whats|numero|número|mobile/i.test(lower)) campoSistema = "telefone";
      else if (/nome|name|primeiro|first/i.test(lower)) campoSistema = "nome";
      else if (/email|e-mail|mail/i.test(lower)) campoSistema = "email";
      else if (/cidad|city|municipio|município/i.test(lower)) campoSistema = "cidade";
      else {
        // Tenta detectar entre campos customizados
        const match = camposCustom.find((c) => {
          const chk = c.chave.toLowerCase();
          const nom = c.nome.toLowerCase();
          return lower.includes(chk) || chk.includes(lower) || lower.includes(nom) || nom.includes(lower);
        });
        if (match) campoSistema = match.chave;
      }

      return { colunaCsv: h, campoSistema };
    });
  };

  // ── File upload ─────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

  const updateMapeamento = (colunaCsv: string, campoSistema: string) => {
    setMapeamentos((prev) =>
      prev.map((m) => (m.colunaCsv === colunaCsv ? { ...m, campoSistema } : m))
    );
  };

  const campoJaMapeado = (campoKey: string, colunaCsvAtual: string): boolean => {
    if (campoKey === "ignorar" || campoKey === "") return false;
    return mapeamentos.some((m) => m.campoSistema === campoKey && m.colunaCsv !== colunaCsvAtual);
  };

  // ── Contatos parseados ───────────────────────────────────────────────────
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

        // Campos customizados → dados_extras
        const dados_extras: Record<string, string> = {};
        mapeamentos.forEach((m) => {
          if (!m.campoSistema || m.campoSistema === "ignorar") return;
          if (["telefone", "nome", "email", "cidade"].includes(m.campoSistema)) return;
          const idx = csvHeaders.indexOf(m.colunaCsv);
          if (idx !== -1 && row[idx]) {
            dados_extras[m.campoSistema] = row[idx].trim();
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

  // ── Contatos ignorados (sem telefone válido) ─────────────────────────────
  const getContatosIgnorados = useCallback((): number => {
    const telefoneCol = mapeamentos.find((m) => m.campoSistema === "telefone")?.colunaCsv;
    if (!telefoneCol) return 0;
    const telefoneIdx = csvHeaders.indexOf(telefoneCol);
    if (telefoneIdx === -1) return 0;

    return csvRows.filter((row) => {
      const rawPhone = row[telefoneIdx]?.trim() || "";
      const telefone = normalizePhoneNumber(rawPhone);
      return telefone.length < 8;
    }).length;
  }, [csvHeaders, csvRows, mapeamentos]);

  const contatosValidos = getContatosFromCsv();
  const contatosIgnorados = getContatosIgnorados();

  // ── Salvar ──────────────────────────────────────────────────────────────
  const handleSalvar = async () => {
    if (!user) return;
    if (!nomeLista.trim()) { toast.error("Digite o nome da lista"); return; }
    if (contatosValidos.length === 0) {
      toast.error("Nenhum contato válido. Verifique se a coluna de Telefone está mapeada.");
      return;
    }

    setIsLoading(true);
    try {
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Importar Lista de Contatos
          </DialogTitle>
        </DialogHeader>

        {/* ─── ETAPA 1: Upload ─────────────────────────── */}
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

        {/* ─── ETAPA 2: Mapeamento ─────────────────────── */}
        {etapa === "mapeamento" && (
          <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
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
              <span>{csvRows.length} linhas · {csvHeaders.length} colunas</span>
              {camposCustom.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  +{camposCustom.length} campo(s) personalizado(s) disponível(is)
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs font-medium text-muted-foreground px-1">
              <span>Coluna do CSV</span>
              <span>Campo do sistema</span>
            </div>

            <div className="flex-1 overflow-y-auto pr-4 min-h-0">
              <div className="space-y-3">
                {mapeamentos.map((m) => {
                  const colIdx = csvHeaders.indexOf(m.colunaCsv);
                  const preview = csvRows[0]?.[colIdx]?.trim() || "";
                  const campoInfo = todosCampos.find((c) => c.key === m.campoSistema);

                  return (
                    <div key={m.colunaCsv} className="grid grid-cols-2 gap-4 items-center">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium truncate">{m.colunaCsv}</p>
                        {preview && (
                          <p className="text-xs text-muted-foreground truncate">Ex: {preview}</p>
                        )}
                      </div>

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

                            {/* Campos fixos */}
                            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                              Campos padrão
                            </div>
                            {CAMPOS_FIXOS.map((c) => (
                              <SelectItem
                                key={c.key}
                                value={c.key}
                                disabled={campoJaMapeado(c.key, m.colunaCsv)}
                              >
                                <div className="flex items-center gap-2">
                                  {getTipoIcon(c.tipo)}
                                  {c.label}
                                  {c.required && (
                                    <Badge variant="destructive" className="text-[10px] px-1 py-0">
                                      obrigatório
                                    </Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}

                            {/* Campos customizados */}
                            {camposCustom.length > 0 && (
                              <>
                                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">
                                  Campos personalizados
                                </div>
                                {camposCustom.map((c) => (
                                  <SelectItem
                                    key={c.chave}
                                    value={c.chave}
                                    disabled={campoJaMapeado(c.chave, m.colunaCsv)}
                                  >
                                    <div className="flex items-center gap-2">
                                      {getTipoIcon(c.tipo)}
                                      {c.nome}
                                      {c.obrigatorio && (
                                        <Badge variant="destructive" className="text-[10px] px-1 py-0">
                                          obrigatório
                                        </Badge>
                                      )}
                                    </div>
                                  </SelectItem>
                                ))}
                              </>
                            )}

                            <SelectItem value="ignorar">
                              <span className="text-muted-foreground">Ignorar coluna</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex flex-col gap-0.5">
                <span className="text-sm text-muted-foreground">
                  {contatosValidos.length} contato(s) válido(s) serão importados
                </span>
                {contatosIgnorados > 0 && (
                  <span className="text-xs text-destructive">
                    {contatosIgnorados} linha(s) ignorada(s) por telefone vazio ou inválido
                  </span>
                )}
              </div>
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
