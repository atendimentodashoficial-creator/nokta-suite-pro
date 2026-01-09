import { useState, useMemo } from "react";
import { useProfissionais, useCreateProfissional, useUpdateProfissional, useDeleteProfissional } from "@/hooks/useProfissionais";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Mail, Phone, Pencil, Trash2, Search, Filter, Users } from "lucide-react";
import { Profissional } from "@/hooks/useProfissionais";
export default function Profissionais() {
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Profissional | null>(null);
  const [excluindo, setExcluindo] = useState<Profissional | null>(null);
  const [nome, setNome] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");

  // Estados de filtro
  const [filtroNome, setFiltroNome] = useState("");
  const [filtroEspecialidade, setFiltroEspecialidade] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const {
    data: profissionais,
    isLoading
  } = useProfissionais();
  const createProfissional = useCreateProfissional();
  const updateProfissional = useUpdateProfissional();
  const deleteProfissional = useDeleteProfissional();

  // Obter especialidades únicas
  const especialidades = useMemo(() => {
    if (!profissionais) return [];
    const specs = profissionais.map(p => p.especialidade).filter((s): s is string => !!s);
    return Array.from(new Set(specs)).sort();
  }, [profissionais]);

  // Filtrar profissionais
  const profissionaisFiltrados = useMemo(() => {
    if (!profissionais) return [];
    return profissionais.filter(prof => {
      const matchNome = prof.nome.toLowerCase().includes(filtroNome.toLowerCase());
      const matchEspecialidade = filtroEspecialidade === "todas" || prof.especialidade === filtroEspecialidade;
      const matchStatus = filtroStatus === "todos" || filtroStatus === "ativos" && prof.ativo || filtroStatus === "inativos" && !prof.ativo;
      return matchNome && matchEspecialidade && matchStatus;
    });
  }, [profissionais, filtroNome, filtroEspecialidade, filtroStatus]);
  const handleEditar = (prof: Profissional) => {
    setEditando(prof);
    setNome(prof.nome);
    setEspecialidade(prof.especialidade || "");
    setTelefone(prof.telefone || "");
    setEmail(prof.email || "");
    setOpen(true);
  };
  const limparFormulario = () => {
    setEditando(null);
    setNome("");
    setEspecialidade("");
    setTelefone("");
    setEmail("");
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    const dados = {
      nome,
      especialidade: especialidade || null,
      telefone: telefone || null,
      email: email || null,
      ativo: true
    };
    if (editando) {
      updateProfissional.mutate({
        id: editando.id,
        ...dados
      }, {
        onSuccess: () => {
          toast.success("Profissional atualizado com sucesso!");
          setOpen(false);
          limparFormulario();
        },
        onError: () => {
          toast.error("Erro ao atualizar profissional");
        }
      });
    } else {
      createProfissional.mutate(dados, {
        onSuccess: () => {
          toast.success("Profissional cadastrado com sucesso!");
          setOpen(false);
          limparFormulario();
        },
        onError: () => {
          toast.error("Erro ao cadastrar profissional");
        }
      });
    }
  };
  const handleExcluir = () => {
    if (!excluindo) return;
    deleteProfissional.mutate(excluindo.id, {
      onSuccess: () => {
        toast.success("Profissional excluído com sucesso!");
        setExcluindo(null);
      },
      onError: () => {
        toast.error("Erro ao excluir profissional");
      }
    });
  };
  return <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div />

        <Dialog open={open} onOpenChange={o => {
        setOpen(o);
        if (!o) limparFormulario();
      }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editando ? "Editar Profissional" : "Cadastrar Novo Profissional"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="especialidade">Especialidade</Label>
                <Input id="especialidade" value={especialidade} onChange={e => setEspecialidade(e.target.value)} placeholder="Ex: Dentista, Ortodontista..." />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone</Label>
                <Input id="telefone" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createProfissional.isPending || updateProfissional.isPending}>
                  {createProfissional.isPending || updateProfissional.isPending ? "Salvando..." : editando ? "Atualizar" : "Cadastrar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <CardTitle className="text-base">Filtros</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="filtro-nome">Buscar por nome</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="filtro-nome" value={filtroNome} onChange={e => setFiltroNome(e.target.value)} placeholder="Digite o nome..." className="pl-9" />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="filtro-especialidade">Especialidade</Label>
              <Select value={filtroEspecialidade} onValueChange={setFiltroEspecialidade}>
                <SelectTrigger id="filtro-especialidade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {especialidades.map(esp => <SelectItem key={esp} value={esp}>{esp}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="filtro-status">Status</Label>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger id="filtro-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ativos">Ativos</SelectItem>
                  <SelectItem value="inativos">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="mt-4 text-sm text-muted-foreground">
            Exibindo {profissionaisFiltrados.length} de {profissionais?.length || 0} profissional(is)
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? <>
            {[1, 2, 3].map(i => <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>)}
          </> : profissionaisFiltrados && profissionaisFiltrados.length > 0 ? profissionaisFiltrados.map(prof => <Card key={prof.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{prof.nome}</CardTitle>
                  <Badge variant={prof.ativo ? "default" : "secondary"}>
                    {prof.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                {prof.especialidade && <Badge variant="outline" className="w-fit">
                    {prof.especialidade}
                  </Badge>}
              </CardHeader>
              <CardContent className="space-y-3">
                {prof.telefone && <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    {prof.telefone}
                  </div>}
                {prof.email && <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    {prof.email}
                  </div>}
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button size="sm" variant="outline" onClick={() => handleEditar(prof)} className="flex-1">
                    <Pencil className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setExcluindo(prof)} className="flex-1">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>) : <Card className="col-span-full">
            <CardContent className="py-8 text-center text-muted-foreground">
              {profissionais && profissionais.length > 0 ? "Nenhum profissional encontrado com os filtros aplicados" : "Nenhum profissional cadastrado"}
            </CardContent>
          </Card>}
      </div>

      <AlertDialog open={!!excluindo} onOpenChange={open => !open && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o profissional <strong>{excluindo?.nome}</strong>? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
}