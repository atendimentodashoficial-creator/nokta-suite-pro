import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Plus, Trash2, Loader2, GitBranch, Edit2, Play, 
  MessageCircle, Clock, ArrowRight, X, Save
} from "lucide-react";

interface FluxoNode {
  id: string;
  type: "start" | "message" | "delay" | "condition" | "end";
  data: {
    label?: string;
    text?: string;
    delaySeconds?: number;
    condition?: string;
  };
  position: { x: number; y: number };
}

interface FluxoEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface Fluxo {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  nodes: FluxoNode[];
  edges: FluxoEdge[];
  etapas: any[];
  created_at: string;
}

const nodeTypes = {
  start: { label: "Início", icon: Play, color: "bg-green-500" },
  message: { label: "Mensagem", icon: MessageCircle, color: "bg-blue-500" },
  delay: { label: "Aguardar", icon: Clock, color: "bg-yellow-500" },
  condition: { label: "Condição", icon: GitBranch, color: "bg-purple-500" },
  end: { label: "Fim", icon: ArrowRight, color: "bg-red-500" },
};

export function InstagramFluxosTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFluxo, setEditingFluxo] = useState<Fluxo | null>(null);
  const [fluxoNome, setFluxoNome] = useState("");
  const [fluxoDescricao, setFluxoDescricao] = useState("");
  const [nodes, setNodes] = useState<FluxoNode[]>([]);
  const [edges, setEdges] = useState<FluxoEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<FluxoNode | null>(null);
  const queryClient = useQueryClient();

  const { data: fluxos, isLoading } = useQuery({
    queryKey: ["instagram-fluxos"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data, error } = await supabase
        .from("instagram_fluxos")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      return (data || []).map((f: any) => ({
        ...f,
        nodes: Array.isArray(f.nodes) ? f.nodes : [],
        edges: Array.isArray(f.edges) ? f.edges : [],
      })) as Fluxo[];
    },
  });

  const createFluxo = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const initialNodes: FluxoNode[] = [
        {
          id: "start-1",
          type: "start",
          data: { label: "Início" },
          position: { x: 250, y: 50 },
        },
      ];

      const insertData: any = {
        user_id: user.id,
        nome: fluxoNome,
        descricao: fluxoDescricao || null,
        ativo: false,
        nodes: initialNodes,
        edges: [],
        etapas: [],
      };

      const { data, error } = await supabase
        .from("instagram_fluxos")
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["instagram-fluxos"] });
      toast.success("Fluxo criado com sucesso!");
      setDialogOpen(false);
      setFluxoNome("");
      setFluxoDescricao("");
      
      const fluxo: Fluxo = {
        ...data,
        nodes: Array.isArray(data.nodes) ? (data.nodes as unknown as FluxoNode[]) : [],
        edges: Array.isArray(data.edges) ? (data.edges as unknown as FluxoEdge[]) : [],
        etapas: Array.isArray(data.etapas) ? data.etapas : [],
      };
      openEditor(fluxo);
    },
    onError: (error) => {
      console.error("Erro ao criar fluxo:", error);
      toast.error("Erro ao criar fluxo");
    },
  });

  const saveFluxo = useMutation({
    mutationFn: async () => {
      if (!editingFluxo) throw new Error("Nenhum fluxo selecionado");

      const { error } = await supabase
        .from("instagram_fluxos")
        .update({
          nodes: nodes as any,
          edges: edges as any,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingFluxo.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-fluxos"] });
      toast.success("Fluxo salvo!");
    },
    onError: (error) => {
      console.error("Erro ao salvar fluxo:", error);
      toast.error("Erro ao salvar fluxo");
    },
  });

  const toggleFluxo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("instagram_fluxos")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-fluxos"] });
    },
  });

  const deleteFluxo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("instagram_fluxos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-fluxos"] });
      toast.success("Fluxo excluído");
    },
  });

  const openEditor = (fluxo: Fluxo) => {
    setEditingFluxo(fluxo);
    setNodes(fluxo.nodes || []);
    setEdges(fluxo.edges || []);
    setSelectedNode(null);
    setEditorOpen(true);
  };

  const addNode = (type: FluxoNode["type"]) => {
    const newNode: FluxoNode = {
      id: `${type}-${Date.now()}`,
      type,
      data: {
        label: nodeTypes[type].label,
        text: type === "message" ? "" : undefined,
        delaySeconds: type === "delay" ? 5 : undefined,
        condition: type === "condition" ? "" : undefined,
      },
      position: { x: 250, y: (nodes.length + 1) * 100 },
    };
    setNodes([...nodes, newNode]);

    if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1];
      const newEdge: FluxoEdge = {
        id: `edge-${Date.now()}`,
        source: lastNode.id,
        target: newNode.id,
      };
      setEdges([...edges, newEdge]);
    }
  };

  const updateNodeData = (nodeId: string, data: Partial<FluxoNode["data"]>) => {
    setNodes(nodes.map(n => 
      n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
    ));
    if (selectedNode?.id === nodeId) {
      setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, ...data } });
    }
  };

  const removeNode = (nodeId: string) => {
    setNodes(nodes.filter(n => n.id !== nodeId));
    setEdges(edges.filter(e => e.source !== nodeId && e.target !== nodeId));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Fluxos de Conversa</h2>
          <p className="text-xs text-muted-foreground">
            Crie sequências automatizadas de mensagens
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Novo Fluxo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Criar Novo Fluxo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nome do Fluxo</label>
                <Input
                  placeholder="Ex: Onboarding de novos seguidores"
                  value={fluxoNome}
                  onChange={(e) => setFluxoNome(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição (opcional)</label>
                <Textarea
                  placeholder="Descreva o objetivo deste fluxo..."
                  value={fluxoDescricao}
                  onChange={(e) => setFluxoDescricao(e.target.value)}
                  rows={2}
                  className="mt-1.5"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  size="sm"
                  onClick={() => createFluxo.mutate()}
                  disabled={!fluxoNome || createFluxo.isPending}
                >
                  {createFluxo.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Criar e Editar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Flow Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-5xl h-[80vh]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Editor de Fluxo: {editingFluxo?.nome}</DialogTitle>
              <Button onClick={() => saveFluxo.mutate()} disabled={saveFluxo.isPending}>
                {saveFluxo.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar
              </Button>
            </div>
          </DialogHeader>

          <div className="flex gap-4 h-full">
            {/* Node Palette */}
            <div className="w-48 border-r pr-4">
              <p className="text-sm font-medium mb-3">Adicionar Etapa</p>
              <div className="space-y-2">
                {(Object.entries(nodeTypes) as [FluxoNode["type"], typeof nodeTypes.start][]).map(([type, config]) => {
                  const Icon = config.icon;
                  return (
                    <Button
                      key={type}
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => addNode(type)}
                      disabled={type === "start" && nodes.some(n => n.type === "start")}
                    >
                      <div className={`w-3 h-3 rounded-full ${config.color} mr-2`} />
                      <Icon className="h-4 w-4 mr-2" />
                      {config.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 bg-muted/30 rounded-lg p-4 overflow-auto">
              <div className="space-y-2">
                {nodes.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Adicione etapas ao seu fluxo</p>
                    <p className="text-sm">Comece adicionando um nó de Início</p>
                  </div>
                ) : (
                  nodes.map((node, index) => {
                    const config = nodeTypes[node.type];
                    const Icon = config.icon;
                    const hasConnection = index > 0;

                    return (
                      <div key={node.id}>
                        {hasConnection && (
                          <div className="flex justify-center py-1">
                            <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
                          </div>
                        )}
                        <div
                          className={`
                            border rounded-lg p-3 cursor-pointer transition-all
                            ${selectedNode?.id === node.id ? "ring-2 ring-primary" : ""}
                            bg-background hover:shadow-md
                          `}
                          onClick={() => setSelectedNode(node)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${config.color}`} />
                              <Icon className="h-4 w-4" />
                              <span className="font-medium text-sm">{config.label}</span>
                            </div>
                            {node.type !== "start" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeNode(node.id);
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          
                          {node.type === "message" && node.data.text && (
                            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                              {node.data.text}
                            </p>
                          )}
                          {node.type === "delay" && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Aguardar {node.data.delaySeconds}s
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Properties Panel */}
            <div className="w-64 border-l pl-4">
              <p className="text-sm font-medium mb-3">Propriedades</p>
              {selectedNode ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-muted-foreground">Tipo</label>
                    <p className="font-medium">{nodeTypes[selectedNode.type].label}</p>
                  </div>

                  {selectedNode.type === "message" && (
                    <div>
                      <label className="text-xs text-muted-foreground">Mensagem</label>
                      <Textarea
                        value={selectedNode.data.text || ""}
                        onChange={(e) => updateNodeData(selectedNode.id, { text: e.target.value })}
                        placeholder="Digite a mensagem..."
                        rows={4}
                      />
                    </div>
                  )}

                  {selectedNode.type === "delay" && (
                    <div>
                      <label className="text-xs text-muted-foreground">Segundos de espera</label>
                      <Input
                        type="number"
                        min={1}
                        max={3600}
                        value={selectedNode.data.delaySeconds || 5}
                        onChange={(e) => updateNodeData(selectedNode.id, { 
                          delaySeconds: parseInt(e.target.value) || 5 
                        })}
                      />
                    </div>
                  )}

                  {selectedNode.type === "condition" && (
                    <div>
                      <label className="text-xs text-muted-foreground">Condição</label>
                      <Input
                        value={selectedNode.data.condition || ""}
                        onChange={(e) => updateNodeData(selectedNode.id, { condition: e.target.value })}
                        placeholder="Ex: contém 'sim'"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Selecione uma etapa para editar
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Flows List */}
      {fluxos?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="p-4 rounded-full bg-muted mb-4">
              <GitBranch className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium">Nenhum fluxo criado</h3>
            <p className="text-xs text-muted-foreground text-center mt-1">
              Crie seu primeiro fluxo automatizado
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {fluxos?.map((fluxo) => (
            <Card key={fluxo.id} className={`transition-all hover:shadow-md ${!fluxo.ativo ? "opacity-60" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-sm truncate">{fluxo.nome}</h3>
                      <Badge variant={fluxo.ativo ? "default" : "secondary"} className="text-[10px] h-5">
                        {fluxo.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    {fluxo.descricao && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                        {fluxo.descricao}
                      </p>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {fluxo.nodes?.length || 0} etapas
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Switch
                      checked={fluxo.ativo}
                      onCheckedChange={(ativo) =>
                        toggleFluxo.mutate({ id: fluxo.id, ativo })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditor(fluxo)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => deleteFluxo.mutate(fluxo.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
