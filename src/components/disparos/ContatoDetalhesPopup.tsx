import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TIPOS_CAMPO } from "./CamposSistemaManager";
import {
  Phone, Mail, MapPin, User, ExternalLink, AtSign,
  Building2, IdCard, Globe, Calendar, Hash, DollarSign,
  Percent, Star, Tag, FileText, Clock, ToggleLeft, Milestone, List
} from "lucide-react";

interface Contato {
  id: string;
  nome?: string | null;
  telefone: string;
  email?: string | null;
  cidade?: string | null;
  dados_extras?: Record<string, string> | null;
}

interface ContatoDetalhesPopupProps {
  contato: Contato | null;
  camposMapeados: Record<string, string>; // chave -> nome do campo
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

function isSocial(tipo: string) {
  return ["instagram","facebook","tiktok","youtube","linkedin","twitter","whatsapp","kwai"].includes(tipo);
}

function isLinkType(tipo: string) {
  return isSocial(tipo) || tipo === "link";
}

function buildUrl(tipo: string, valor: string): string {
  const prefix = SOCIAL_PREFIXES[tipo] ?? "";
  if (!prefix) return valor.startsWith("http") ? valor : `https://${valor}`;
  // se o usuário já incluiu o prefixo, não duplicar
  if (valor.startsWith("http")) return valor;
  return prefix + valor.replace(/^@/, "");
}

function getTipoIcon(tipo: string) {
  const map: Record<string, React.ElementType> = {
    texto: FileText, textarea: FileText, numero: Hash, moeda: DollarSign,
    percentual: Percent, booleano: ToggleLeft, select: List, data: Calendar,
    hora: Clock, avaliacao: Star, tag: Tag, email: Mail, telefone: Phone,
    link: ExternalLink, cep: MapPin, cidade: Globe, estado: Milestone,
    endereco: MapPin, cpf: IdCard, cnpj: Building2, rg: IdCard,
    instagram: AtSign, facebook: AtSign, tiktok: AtSign, youtube: AtSign,
    linkedin: AtSign, twitter: AtSign, whatsapp: Phone, kwai: AtSign,
  };
  const Icon = map[tipo] ?? FileText;
  return <Icon className="w-4 h-4 text-muted-foreground shrink-0" />;
}

function getTipoLabel(tipo: string) {
  return TIPOS_CAMPO.find((t) => t.value === tipo)?.label ?? tipo;
}

export function ContatoDetalhesPopup({ contato, camposMapeados, open, onOpenChange }: ContatoDetalhesPopupProps) {
  if (!contato) return null;

  const extras = contato.dados_extras ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            {contato.nome || contato.telefone}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Campos padrão */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Informações principais
            </p>
            <div className="space-y-2">
              {contato.nome && (
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Nome</p>
                    <p className="text-sm font-medium">{contato.nome}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Telefone</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{contato.telefone}</p>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      asChild
                    >
                      <a href={`https://wa.me/${contato.telefone}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
              {contato.email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">E-mail</p>
                    <p className="text-sm font-medium">{contato.email}</p>
                  </div>
                </div>
              )}
              {contato.cidade && (
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Cidade</p>
                    <p className="text-sm font-medium">{contato.cidade}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Campos extras mapeados */}
          {Object.entries(extras).length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Campos personalizados
                </p>
                <div className="space-y-2">
                  {Object.entries(extras).map(([chave, valor]) => {
                    const tipoInfo = TIPOS_CAMPO.find((t) => t.value === chave) ??
                      TIPOS_CAMPO.find((t) => t.value === camposMapeados[chave]);
                    const tipo = tipoInfo?.value ?? "texto";
                    const nomeLabel = camposMapeados[chave] ?? chave;

                    return (
                      <div key={chave} className="flex items-start gap-3">
                        {getTipoIcon(tipo)}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">{nomeLabel}</p>
                          {isLinkType(tipo) ? (
                            <a
                              href={buildUrl(tipo, valor)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                            >
                              {valor}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <p className="text-sm font-medium truncate">{valor}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-[10px] py-0 shrink-0">
                          {getTipoLabel(tipo)}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
