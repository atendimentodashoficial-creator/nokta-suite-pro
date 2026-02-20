import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ContatoDetalhesPopup } from "./ContatoDetalhesPopup";
import { TIPOS_CAMPO } from "./CamposSistemaManager";
import {
  ArrowLeft, Search, Users, ExternalLink, Info, Phone,
  Instagram, AtSign
} from "lucide-react";

interface Contato {
  id: string;
  nome?: string | null;
  telefone: string;
  email?: string | null;
  cidade?: string | null;
  dados_extras?: Record<string, string> | null;
}

interface ColunaMapeamento {
  colunaCsv: string;
  campoSistema: string;
}

interface Lista {
  id: string;
  nome: string;
  total_contatos: number;
  colunas_mapeamento?: ColunaMapeamento[] | null;
}

interface ListaContatosViewProps {
  lista: Lista;
  onVoltar: () => void;
}

const SOCIAL_TIPOS = ["instagram","facebook","tiktok","youtube","linkedin","twitter","whatsapp","kwai","link"];

const SOCIAL_PREFIXES: Record<string, string> = {
  instagram: "https://instagram.com/",
  facebook:  "https://facebook.com/",
  tiktok:    "https://tiktok.com/@",
  youtube:   "https://youtube.com/@",
  linkedin:  "https://linkedin.com/in/",
  twitter:   "https://x.com/",
  whatsapp:  "https://wa.me/",
  kwai:      "https://kwai.com/@",
  link:      "",
};

function buildUrl(tipo: string, valor: string): string {
  const prefix = SOCIAL_PREFIXES[tipo] ?? "";
  if (!prefix) return valor.startsWith("http") ? valor : `https://${valor}`;
  if (valor.startsWith("http")) return valor;
  return prefix + valor.replace(/^@/, "");
}

function getSocialIcon(tipo: string) {
  // usar AtSign genérico para redes, Phone para whatsapp
  if (tipo === "whatsapp") return Phone;
  return AtSign;
}

function getSocialLabel(tipo: string) {
  return TIPOS_CAMPO.find((t) => t.value === tipo)?.label ?? tipo;
}

// Monta mapa chave -> nome amigável a partir do mapeamento da lista
function buildCamposMapeados(mapeamento: ColunaMapeamento[]): Record<string, string> {
  const map: Record<string, string> = {};
  mapeamento.forEach((m) => {
    if (m.campoSistema && m.campoSistema !== "ignorar") {
      map[m.campoSistema] = m.colunaCsv;
    }
  });
  return map;
}

const PAGE_SIZE = 50;

export function ListaContatosView({ lista, onVoltar }: ListaContatosViewProps) {
  const { user } = useAuth();
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [contatoAberto, setContatoAberto] = useState<Contato | null>(null);

  const camposMapeados = buildCamposMapeados(lista.colunas_mapeamento ?? []);

  // Chaves extras que são do tipo social/link
  const camposSociais = (lista.colunas_mapeamento ?? [])
    .filter((m) => SOCIAL_TIPOS.includes(m.campoSistema))
    .map((m) => m.campoSistema);

  const loadContatos = async (p: number, search: string) => {
    if (!user) return;
    setIsLoading(true);
    try {
      let query = supabase
        .from("lista_importada_contatos")
        .select("id, nome, telefone, email, cidade, dados_extras", { count: "exact" })
        .eq("lista_id", lista.id)
        .eq("user_id", user.id)
        .order("id")
        .range(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE - 1);

      if (search.trim()) {
        query = query.or(`nome.ilike.%${search}%,telefone.ilike.%${search}%,email.ilike.%${search}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      setContatos((data ?? []) as unknown as Contato[]);
      setTotal(count ?? 0);
    } catch {
      toast.error("Erro ao carregar contatos");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setPage(0);
    loadContatos(0, busca);
  }, [lista.id, busca]);

  useEffect(() => {
    loadContatos(page, busca);
  }, [page]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onVoltar}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold truncate">{lista.nome}</h2>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span>{lista.total_contatos.toLocaleString("pt-BR")} contatos</span>
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone ou e-mail…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Lista */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-1">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))
          ) : contatos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhum contato encontrado.
            </div>
          ) : (
            contatos.map((contato) => {
              const extras = contato.dados_extras ?? {};
              const sociaisDoContato = camposSociais.filter(
                (chave) => extras[chave] && extras[chave].trim()
              );

              return (
                <Card key={contato.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {/* Avatar letra */}
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-primary">
                        {(contato.nome || contato.telefone).charAt(0).toUpperCase()}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {contato.nome || <span className="text-muted-foreground">Sem nome</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{contato.telefone}</p>
                      {contato.cidade && (
                        <p className="text-xs text-muted-foreground truncate">{contato.cidade}</p>
                      )}
                    </div>

                    {/* Botões de redes sociais */}
                    <div className="flex items-center gap-1 shrink-0">
                      {sociaisDoContato.map((chave) => {
                        const valor = extras[chave];
                        const url = buildUrl(chave, valor);
                        const Icon = getSocialIcon(chave);
                        const label = getSocialLabel(chave);
                        return (
                          <Button
                            key={chave}
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            title={`${label}: ${valor}`}
                            asChild
                          >
                            <a href={url} target="_blank" rel="noreferrer">
                              <Icon className="w-3.5 h-3.5" />
                            </a>
                          </Button>
                        );
                      })}

                      {/* Site/link genérico */}
                      {extras["link"] && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          title={extras["link"]}
                          asChild
                        >
                          <a href={buildUrl("link", extras["link"])} target="_blank" rel="noreferrer">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </Button>
                      )}

                      {/* Popup de detalhes */}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setContatoAberto(contato)}
                      >
                        <Info className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Paginação */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-3">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* Popup de detalhes */}
      <ContatoDetalhesPopup
        contato={contatoAberto}
        camposMapeados={camposMapeados}
        open={!!contatoAberto}
        onOpenChange={(o) => !o && setContatoAberto(null)}
      />
    </div>
  );
}
