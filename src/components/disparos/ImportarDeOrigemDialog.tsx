import { useState, useEffect } from "react";
import { Users, Database, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { normalizePhoneNumber } from "@/utils/whatsapp";

interface ImportarDeOrigemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onListaImportada: () => void;
}

interface KanbanColumn {
  id: string;
  nome: string;
  cor: string;
}

interface ListaExtrator {
  id: string;
  nome: string;
  dados: any[];
  total_contatos: number;
}

interface ListaImportada {
  id: string;
  nome: string;
  total_contatos: number;
}

interface ContatoRaw {
  numero: string;
  nome?: string;
}

type StepType = "escolher" | "filtrar";
type OrigemType =
  | "leads"
  | "clientes"
  | "kanban_whatsapp"
  | "kanban_disparos"
  | "kanban_whatsapp_leads"
  | "kanban_disparos_leads";

export function ImportarDeOrigemDialog({ open, onOpenChange, onListaImportada }: ImportarDeOrigemDialogProps) {
  const { user } = useAuth();

  const [step, setStep] = useState<StepType>("escolher");
  const [origemType, setOrigemType] = useState<OrigemType | null>(null);
  const [selectedKanbanColumnId, setSelectedKanbanColumnId] = useState<string | null>(null);
  const [selectedListaExtrator, setSelectedListaExtrator] = useState<ListaExtrator | null>(null);
  const [selectedListaImportada, setSelectedListaImportada] = useState<ListaImportada | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [nomeLista, setNomeLista] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Data
  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumn[]>([]);
  const [disparosKanbanColumns, setDisparosKanbanColumns] = useState<KanbanColumn[]>([]);
  const [listasExtrator, setListasExtrator] = useState<ListaExtrator[]>([]);
  const [listasImportadas, setListasImportadas] = useState<ListaImportada[]>([]);

  useEffect(() => {
    if (!open || !user) return;
    loadData();
  }, [open, user]);

  const loadData = async () => {
    if (!user) return;
    const [kanbanRes, disparosKanbanRes, extratorRes, importadasRes] = await Promise.all([
      supabase.from("whatsapp_kanban_columns").select("id, nome, cor").eq("user_id", user.id).eq("ativo", true).order("ordem"),
      supabase.from("disparos_kanban_columns").select("id, nome, cor").eq("user_id", user.id).eq("ativo", true).order("ordem"),
      supabase.from("listas_extrator").select("id, nome, dados, total_contatos").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("listas_importadas").select("id, nome, total_contatos").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    setKanbanColumns((kanbanRes.data ?? []) as KanbanColumn[]);
    setDisparosKanbanColumns((disparosKanbanRes.data ?? []) as KanbanColumn[]);
    setListasExtrator((extratorRes.data ?? []) as unknown as ListaExtrator[]);
    setListasImportadas((importadasRes.data ?? []) as ListaImportada[]);
  };

  const handleClose = () => {
    setStep("escolher");
    setOrigemType(null);
    setSelectedKanbanColumnId(null);
    setSelectedListaExtrator(null);
    setSelectedListaImportada(null);
    setDateFrom("");
    setDateTo("");
    setNomeLista("");
    onOpenChange(false);
  };

  // Seleção de origem que não precisa de filtro de data
  const handleOrigemDireta = async (lista: ListaExtrator | ListaImportada, isExtrator: boolean) => {
    if (isExtrator) {
      const l = lista as ListaExtrator;
      const contatos: ContatoRaw[] = (l.dados || [])
        .filter((item: any) => item.phone)
        .map((item: any) => ({ numero: normalizePhoneNumber(item.phone), nome: item.name }))
        .filter((c: ContatoRaw) => c.numero.length >= 8);
      if (contatos.length === 0) { toast.info("Nenhum contato válido"); return; }
      await salvarLista(l.nome, contatos);
    } else {
      const l = lista as ListaImportada;
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("lista_importada_contatos")
          .select("telefone, nome")
          .eq("lista_id", l.id)
          .eq("user_id", user!.id);
        if (error) throw error;
        const contatos: ContatoRaw[] = (data || [])
          .filter((c: any) => c.telefone)
          .map((c: any) => ({ numero: normalizePhoneNumber(c.telefone), nome: c.nome || undefined }))
          .filter((c: ContatoRaw) => c.numero.length >= 8);
        if (contatos.length === 0) { toast.info("Nenhum contato válido"); return; }
        await salvarLista(`Cópia de ${l.nome}`, contatos);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleOrigemComFiltro = (tipo: OrigemType, columnId?: string, nome?: string) => {
    setOrigemType(tipo);
    setSelectedKanbanColumnId(columnId ?? null);
    setNomeLista(nome ?? "");
    setStep("filtrar");
  };

  const executarImport = async (withDate: boolean) => {
    if (!user || !origemType) return;
    setIsLoading(true);
    try {
      let contatos: ContatoRaw[] = [];

      if (origemType === "leads") {
        let q = supabase.from("leads").select("nome, telefone").eq("user_id", user.id).eq("status", "lead").is("deleted_at", null);
        if (withDate && dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
        if (withDate && dateTo) q = q.lte("created_at", `${dateTo}T23:59:59`);
        const { data, error } = await q;
        if (error) throw error;
        contatos = (data || []).filter((l: any) => l.telefone).map((l: any) => ({ numero: normalizePhoneNumber(l.telefone), nome: l.nome })).filter((c: ContatoRaw) => c.numero.length >= 8);
      } else if (origemType === "clientes") {
        let q = supabase.from("leads").select("nome, telefone").eq("user_id", user.id).eq("status", "cliente").is("deleted_at", null);
        if (withDate && dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
        if (withDate && dateTo) q = q.lte("created_at", `${dateTo}T23:59:59`);
        const { data, error } = await q;
        if (error) throw error;
        contatos = (data || []).filter((l: any) => l.telefone).map((l: any) => ({ numero: normalizePhoneNumber(l.telefone), nome: l.nome })).filter((c: ContatoRaw) => c.numero.length >= 8);
      } else if (origemType === "kanban_whatsapp" && selectedKanbanColumnId) {
        const { data: k } = await supabase.from("whatsapp_chat_kanban").select("chat_id").eq("user_id", user.id).eq("column_id", selectedKanbanColumnId);
        const ids = (k || []).map((x: any) => x.chat_id);
        if (ids.length > 0) {
          let q = supabase.from("whatsapp_chats").select("contact_name, contact_number, last_message_time").in("id", ids).is("deleted_at", null);
          if (withDate && dateFrom) q = q.gte("last_message_time", `${dateFrom}T00:00:00`);
          if (withDate && dateTo) q = q.lte("last_message_time", `${dateTo}T23:59:59`);
          const { data, error } = await q;
          if (error) throw error;
          contatos = (data || []).filter((c: any) => c.contact_number).map((c: any) => ({ numero: normalizePhoneNumber(c.contact_number), nome: c.contact_name })).filter((c: ContatoRaw) => c.numero.length >= 8);
        }
      } else if (origemType === "kanban_disparos" && selectedKanbanColumnId) {
        const { data: k } = await supabase.from("disparos_chat_kanban").select("chat_id").eq("user_id", user.id).eq("column_id", selectedKanbanColumnId);
        const ids = (k || []).map((x: any) => x.chat_id);
        if (ids.length > 0) {
          let q = supabase.from("disparos_chats").select("contact_name, contact_number, last_message_time").in("id", ids).is("deleted_at", null);
          if (withDate && dateFrom) q = q.gte("last_message_time", `${dateFrom}T00:00:00`);
          if (withDate && dateTo) q = q.lte("last_message_time", `${dateTo}T23:59:59`);
          const { data, error } = await q;
          if (error) throw error;
          contatos = (data || []).filter((c: any) => c.contact_number).map((c: any) => ({ numero: normalizePhoneNumber(c.contact_number), nome: c.contact_name })).filter((c: ContatoRaw) => c.numero.length >= 8);
        }
      } else if (origemType === "kanban_whatsapp_leads") {
        const { data: assigned } = await supabase.from("whatsapp_chat_kanban").select("chat_id").eq("user_id", user.id);
        const assignedIds = new Set((assigned || []).map((x: any) => x.chat_id));
        let q = supabase.from("whatsapp_chats").select("id, contact_name, contact_number, last_message_time").eq("user_id", user.id).is("deleted_at", null);
        if (withDate && dateFrom) q = q.gte("last_message_time", `${dateFrom}T00:00:00`);
        if (withDate && dateTo) q = q.lte("last_message_time", `${dateTo}T23:59:59`);
        const { data, error } = await q;
        if (error) throw error;
        contatos = (data || []).filter((c: any) => !assignedIds.has(c.id) && c.contact_number).map((c: any) => ({ numero: normalizePhoneNumber(c.contact_number), nome: c.contact_name })).filter((c: ContatoRaw) => c.numero.length >= 8);
      } else if (origemType === "kanban_disparos_leads") {
        const { data: assigned } = await supabase.from("disparos_chat_kanban").select("chat_id").eq("user_id", user.id);
        const assignedIds = new Set((assigned || []).map((x: any) => x.chat_id));
        let q = supabase.from("disparos_chats").select("id, contact_name, contact_number, last_message_time").eq("user_id", user.id).is("deleted_at", null);
        if (withDate && dateFrom) q = q.gte("last_message_time", `${dateFrom}T00:00:00`);
        if (withDate && dateTo) q = q.lte("last_message_time", `${dateTo}T23:59:59`);
        const { data, error } = await q;
        if (error) throw error;
        contatos = (data || []).filter((c: any) => !assignedIds.has(c.id) && c.contact_number).map((c: any) => ({ numero: normalizePhoneNumber(c.contact_number), nome: c.contact_name })).filter((c: ContatoRaw) => c.numero.length >= 8);
      }

      if (contatos.length === 0) { toast.info("Nenhum contato válido encontrado" + (withDate ? " no período" : "")); return; }
      await salvarLista(nomeLista || "Lista importada", contatos);
    } catch (err: any) {
      toast.error("Erro ao importar: " + (err.message || ""));
    } finally {
      setIsLoading(false);
    }
  };

  const salvarLista = async (nome: string, contatos: ContatoRaw[]) => {
    if (!user) return;
    const nomeUsado = nomeLista.trim() || nome;
    setIsLoading(true);
    try {
      const { data: lista, error: listaError } = await supabase
        .from("listas_importadas")
        .insert({ user_id: user.id, nome: nomeUsado, total_contatos: contatos.length })
        .select()
        .single();
      if (listaError) throw listaError;

      const BATCH = 500;
      for (let i = 0; i < contatos.length; i += BATCH) {
        const batch = contatos.slice(i, i + BATCH).map(c => ({
          lista_id: lista.id,
          user_id: user.id,
          telefone: c.numero,
          nome: c.nome || null,
        }));
        const { error } = await supabase.from("lista_importada_contatos").insert(batch);
        if (error) throw error;
      }

      toast.success(`Lista "${nomeUsado}" salva com ${contatos.length} contatos!`);
      onListaImportada();
      handleClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        {step === "escolher" && (
          <>
            <DialogHeader>
              <DialogTitle>Importar Contatos como Lista</DialogTitle>
              <DialogDescription>Escolha a origem dos contatos para salvar como nova lista</DialogDescription>
            </DialogHeader>

            {/* Nome da lista */}
            <div className="space-y-1.5">
              <Label className="text-xs">Nome da lista (opcional)</Label>
              <Input
                placeholder="Ex: Leads Instagram – Fev 2026"
                value={nomeLista}
                onChange={e => setNomeLista(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <ScrollArea className="max-h-[55vh]">
              <div className="space-y-1 pr-2">
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleOrigemComFiltro("leads", undefined, nomeLista || "Todos os Leads")}>
                  <Users className="h-4 w-4 mr-2" />Todos os Contatos (Leads)
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleOrigemComFiltro("clientes", undefined, nomeLista || "Clientes")}>
                  <Users className="h-4 w-4 mr-2" />Apenas Clientes
                </Button>

                <div className="border-t my-2" />
                <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Kanban WhatsApp</p>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleOrigemComFiltro("kanban_whatsapp_leads", undefined, nomeLista || "WA: Leads")}>
                  <div className="w-3 h-3 rounded-full mr-2 bg-muted-foreground/40" />Leads (não atribuídos)
                </Button>
                {kanbanColumns.map(col => (
                  <Button key={col.id} variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleOrigemComFiltro("kanban_whatsapp", col.id, nomeLista || `WA: ${col.nome}`)}>
                    <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: col.cor }} />{col.nome}
                  </Button>
                ))}

                <div className="border-t my-2" />
                <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Kanban Disparos</p>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleOrigemComFiltro("kanban_disparos_leads", undefined, nomeLista || "Disp: Leads")}>
                  <div className="w-3 h-3 rounded-full mr-2 bg-muted-foreground/40" />Leads (não atribuídos)
                </Button>
                {disparosKanbanColumns.map(col => (
                  <Button key={col.id} variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleOrigemComFiltro("kanban_disparos", col.id, nomeLista || `Disp: ${col.nome}`)}>
                    <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: col.cor }} />{col.nome}
                  </Button>
                ))}

                {listasExtrator.length > 0 && (
                  <>
                    <div className="border-t my-2" />
                    <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Listas do Extrator</p>
                    {listasExtrator.map(lista => (
                      <Button key={lista.id} variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleOrigemDireta(lista, true)} disabled={isLoading}>
                        <Database className="h-3 w-3 mr-2 text-purple-600" />{lista.nome}
                        <Badge variant="secondary" className="ml-auto text-xs">{lista.total_contatos}</Badge>
                      </Button>
                    ))}
                  </>
                )}

                {listasImportadas.length > 0 && (
                  <>
                    <div className="border-t my-2" />
                    <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Copiar de Lista Existente</p>
                    {listasImportadas.map(lista => (
                      <Button key={lista.id} variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleOrigemDireta(lista, false)} disabled={isLoading}>
                        <Database className="h-3 w-3 mr-2 text-blue-600" />{lista.nome}
                        <Badge variant="secondary" className="ml-auto text-xs">{lista.total_contatos}</Badge>
                      </Button>
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          </>
        )}

        {step === "filtrar" && (
          <>
            <DialogHeader>
              <DialogTitle>Filtrar por Período</DialogTitle>
              <DialogDescription>
                {origemType === "leads" && "Importe apenas leads criados em um período específico"}
                {origemType === "clientes" && "Importe apenas clientes criados em um período específico"}
                {(origemType === "kanban_whatsapp" || origemType === "kanban_disparos" ||
                  origemType === "kanban_whatsapp_leads" || origemType === "kanban_disparos_leads") &&
                  "Importe contatos com última interação no período selecionado"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome da lista</Label>
                <Input value={nomeLista} onChange={e => setNomeLista(e.target.value)} className="h-8 text-sm" placeholder="Nome da lista..." />
              </div>
              <div className="space-y-2">
                <Label>Data inicial (opcional)</Label>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data final (opcional)</Label>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep("escolher")} className="flex-1">
                  Voltar
                </Button>
                <Button variant="outline" size="sm" onClick={() => executarImport(false)} disabled={isLoading} className="flex-1">
                  Importar Todos
                </Button>
                <Button size="sm" onClick={() => executarImport(true)} disabled={isLoading || (!dateFrom && !dateTo)} className="flex-1">
                  {isLoading ? "Salvando..." : "Importar Filtrado"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
