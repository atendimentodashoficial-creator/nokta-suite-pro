import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, Settings2, GripVertical,
  Type, Hash, Mail, Link, Phone, Calendar, FileText, List, MapPin, IdCard, AtSign,
  Building2, DollarSign, Percent, Star, Tag, Globe, Milestone, ToggleLeft, Clock
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface CampoSistema {
  id: string;
  nome: string;
  chave: string;
  tipo: string;
  obrigatorio: boolean;
  ordem: number;
  ativo: boolean;
}

export const TIPOS_CAMPO = [
  // Texto / Numérico
  { value: "texto",       label: "Texto",           icon: Type,       grupo: "basico" },
  { value: "textarea",    label: "Texto longo",      icon: FileText,   grupo: "basico" },
  { value: "numero",      label: "Número",           icon: Hash,       grupo: "basico" },
  { value: "moeda",       label: "Moeda (R$)",       icon: DollarSign, grupo: "basico" },
  { value: "percentual",  label: "Percentual (%)",   icon: Percent,    grupo: "basico" },
  { value: "booleano",    label: "Sim / Não",        icon: ToggleLeft, grupo: "basico" },
  { value: "select",      label: "Seleção",          icon: List,       grupo: "basico" },
  { value: "data",        label: "Data",             icon: Calendar,   grupo: "basico" },
  { value: "hora",        label: "Hora",             icon: Clock,      grupo: "basico" },
  { value: "avaliacao",   label: "Avaliação (1–5)",  icon: Star,       grupo: "basico" },
  { value: "tag",         label: "Tags",             icon: Tag,        grupo: "basico" },
  // Contato / Localização
  { value: "email",       label: "E-mail",           icon: Mail,       grupo: "contato" },
  { value: "telefone",    label: "Telefone",         icon: Phone,      grupo: "contato" },
  { value: "link",        label: "Link / URL",       icon: Link,       grupo: "contato" },
  { value: "cep",         label: "CEP",              icon: MapPin,     grupo: "contato" },
  { value: "cidade",      label: "Cidade",           icon: Globe,      grupo: "contato" },
  { value: "estado",      label: "Estado (UF)",      icon: Milestone,  grupo: "contato" },
  { value: "endereco",    label: "Endereço",         icon: MapPin,     grupo: "contato" },
  // Documentos
  { value: "cpf",         label: "CPF",              icon: IdCard,     grupo: "documento" },
  { value: "cnpj",        label: "CNPJ",             icon: Building2,  grupo: "documento" },
  { value: "rg",          label: "RG",               icon: IdCard,     grupo: "documento" },
  // Redes sociais
  { value: "instagram",   label: "Instagram",        icon: AtSign,     grupo: "social", prefix: "instagram.com/" },
  { value: "facebook",    label: "Facebook",         icon: AtSign,     grupo: "social", prefix: "facebook.com/" },
  { value: "tiktok",      label: "TikTok",           icon: AtSign,     grupo: "social", prefix: "tiktok.com/@" },
  { value: "youtube",     label: "YouTube",          icon: AtSign,     grupo: "social", prefix: "youtube.com/@" },
  { value: "linkedin",    label: "LinkedIn",         icon: AtSign,     grupo: "social", prefix: "linkedin.com/in/" },
  { value: "twitter",     label: "X / Twitter",      icon: AtSign,     grupo: "social", prefix: "x.com/" },
  { value: "whatsapp",    label: "WhatsApp",         icon: Phone,      grupo: "social", prefix: "wa.me/" },
  { value: "kwai",        label: "Kwai",             icon: AtSign,     grupo: "social", prefix: "kwai.com/@" },
];

// Campos fixos (não cadastráveis, sempre existem)
export const CAMPOS_FIXOS = [
  { key: "telefone", label: "Telefone", required: true, tipo: "telefone" },
  { key: "nome",     label: "Nome",     required: false, tipo: "texto" },
  { key: "email",    label: "E-mail",   required: false, tipo: "email" },
  { key: "cidade",   label: "Cidade",   required: false, tipo: "texto" },
];

function getTipoIcon(tipo: string) {
  const found = TIPOS_CAMPO.find((t) => t.value === tipo);
  const Icon = found?.icon ?? Type;
  return <Icon className="w-3.5 h-3.5" />;
}

function getTipoLabel(tipo: string) {
  return TIPOS_CAMPO.find((t) => t.value === tipo)?.label ?? tipo;
}

function gerarChave(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

interface FormState {
  nome: string;
  tipo: string;
  obrigatorio: boolean;
}

const FORM_VAZIO: FormState = { nome: "", tipo: "texto", obrigatorio: false };

export function CamposSistemaManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<CampoSistema | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [modoEdicao, setModoEdicao] = useState(false);

  const { data: campos = [], isLoading } = useQuery({
    queryKey: ["lista-campos-sistema", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lista_campos_sistema" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CampoSistema[];
    },
    enabled: !!user?.id && open,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["lista-campos-sistema"] });

  const createMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const chave = gerarChave(f.nome);
      const maxOrdem = campos.reduce((m, c) => Math.max(m, c.ordem), 0);
      const { error } = await supabase
        .from("lista_campos_sistema" as any)
        .insert({ user_id: user!.id, nome: f.nome, chave, tipo: f.tipo, obrigatorio: f.obrigatorio, ordem: maxOrdem + 1 });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setForm(FORM_VAZIO); toast.success("Campo criado"); },
    onError: (e: any) => toast.error(e.message?.includes("unique") ? "Já existe um campo com esse nome" : "Erro ao criar campo"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, f }: { id: string; f: FormState }) => {
      const { error } = await supabase
        .from("lista_campos_sistema" as any)
        .update({ nome: f.nome, tipo: f.tipo, obrigatorio: f.obrigatorio })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditando(null); setModoEdicao(false); toast.success("Campo atualizado"); },
    onError: () => toast.error("Erro ao atualizar campo"),
  });

  const toggleAtivoMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("lista_campos_sistema" as any)
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("lista_campos_sistema" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Campo removido"); },
    onError: () => toast.error("Erro ao remover campo"),
  });

  const handleSalvar = () => {
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (modoEdicao && editando) {
      updateMutation.mutate({ id: editando.id, f: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const iniciarEdicao = (campo: CampoSistema) => {
    setEditando(campo);
    setForm({ nome: campo.nome, tipo: campo.tipo, obrigatorio: campo.obrigatorio });
    setModoEdicao(true);
  };

  const cancelarEdicao = () => {
    setEditando(null);
    setModoEdicao(false);
    setForm(FORM_VAZIO);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="w-4 h-4" />
          Campos do Sistema
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Campos do Sistema</DialogTitle>
          <DialogDescription>
            Configure os campos personalizados disponíveis para mapeamento ao importar listas de contatos.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-5 min-h-0 py-2">
          {/* ── Formulário ── */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              <h4 className="text-sm font-medium">
                {modoEdicao ? "Editar Campo" : "Novo Campo"}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <Label htmlFor="campo-nome">Nome do campo</Label>
                  <Input
                    id="campo-nome"
                    placeholder="Ex: Instagram, Bairro, Profissão…"
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  />
                  {form.nome && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Chave: <code className="bg-muted px-1 rounded">{gerarChave(form.nome)}</code>
                    </p>
                  )}
                </div>
                <div>
                  <Label>Tipo de dado</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {[
                        { grupo: "basico",    label: "Básico" },
                        { grupo: "contato",   label: "Contato / Localização" },
                        { grupo: "documento", label: "Documentos" },
                        { grupo: "social",    label: "Redes Sociais" },
                      ].map(({ grupo, label }) => {
                        const itens = TIPOS_CAMPO.filter((t) => t.grupo === grupo);
                        return (
                          <div key={grupo}>
                            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                              {label}
                            </div>
                            {itens.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                <div className="flex items-center gap-2">
                                  <t.icon className="w-4 h-4 text-muted-foreground" />
                                  <span>{t.label}</span>
                                  {"prefix" in t && (
                                    <span className="text-xs text-muted-foreground">{t.prefix}…</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </div>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="obrigatorio"
                  checked={form.obrigatorio}
                  onCheckedChange={(v) => setForm({ ...form, obrigatorio: v })}
                />
                <Label htmlFor="obrigatorio" className="cursor-pointer text-sm">
                  Campo obrigatório no mapeamento
                </Label>
              </div>
              <div className="flex gap-2 justify-end">
                {modoEdicao && (
                  <Button variant="ghost" size="sm" onClick={cancelarEdicao}>
                    Cancelar
                  </Button>
                )}
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={handleSalvar}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  <Plus className="w-4 h-4" />
                  {modoEdicao ? "Salvar alterações" : "Adicionar campo"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Lista de campos fixos ── */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Campos padrão (não editáveis)
            </p>
            <div className="flex flex-wrap gap-2">
              {CAMPOS_FIXOS.map((c) => (
                <Badge key={c.key} variant="secondary" className="gap-1.5 py-1 px-2">
                  {getTipoIcon(c.tipo)}
                  {c.label}
                  {c.required && <span className="text-destructive">*</span>}
                </Badge>
              ))}
            </div>
          </div>

          {/* ── Lista de campos personalizados ── */}
          <div className="flex-1 min-h-0 flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Campos personalizados ({campos.length})
            </p>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : campos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum campo personalizado ainda. Adicione acima.
              </p>
            ) : (
              <ScrollArea className="flex-1 pr-1">
                <div className="space-y-2">
                  {campos.map((campo) => (
                    <Card key={campo.id} className={!campo.ativo ? "opacity-50" : ""}>
                      <CardContent className="py-2.5 px-3">
                        <div className="flex items-center gap-3">
                          <GripVertical className="w-4 h-4 text-muted-foreground shrink-0 cursor-grab" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{campo.nome}</span>
                              <Badge variant="outline" className="gap-1 text-xs py-0">
                                {getTipoIcon(campo.tipo)}
                                {getTipoLabel(campo.tipo)}
                              </Badge>
                              {campo.obrigatorio && (
                                <Badge variant="destructive" className="text-[10px] py-0 px-1">
                                  obrigatório
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              <code>{campo.chave}</code>
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Switch
                              checked={campo.ativo}
                              onCheckedChange={(v) => toggleAtivoMutation.mutate({ id: campo.id, ativo: v })}
                              className="scale-75"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => iniciarEdicao(campo)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteMutation.mutate(campo.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
