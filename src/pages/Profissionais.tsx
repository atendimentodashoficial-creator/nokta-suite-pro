import { useState, useMemo } from "react";
import { useProfissionais, useCreateProfissional, useUpdateProfissional, useDeleteProfissional, Profissional } from "@/hooks/useProfissionais";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, GripVertical, Phone, Mail } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CountryCodeSelect } from "@/components/whatsapp/CountryCodeSelect";
import { formatPhoneByCountry, getPhonePlaceholder, normalizePhone, extractCountryCode, formatPhoneDisplay } from "@/utils/phoneFormat";

interface SortableProfissionalItemProps {
  profissional: Profissional;
  onEdit: (prof: Profissional) => void;
  onDelete: (prof: Profissional) => void;
  onToggleAtivo: (prof: Profissional) => void;
}

function SortableProfissionalItem({ profissional, onEdit, onDelete, onToggleAtivo }: SortableProfissionalItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: profissional.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative p-3 rounded-lg border ${
        !profissional.ativo ? "opacity-50 bg-muted/50" : "bg-card"
      }`}
    >
      {/* Desktop layout */}
      <div className="hidden sm:flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{profissional.nome}</span>
              {profissional.especialidade && (
                <Badge variant="outline" className="text-xs flex-shrink-0">{profissional.especialidade}</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
              {profissional.telefone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{formatPhoneDisplay(profissional.telefone)}</span>
                </span>
              )}
              {profissional.email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{profissional.email}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(profissional)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDelete(profissional)}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
          <Switch
            checked={profissional.ativo}
            onCheckedChange={() => onToggleAtivo(profissional)}
          />
        </div>
      </div>

      {/* Mobile layout */}
      <div className="sm:hidden flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-start gap-2 flex-wrap">
              <span className="font-medium text-sm break-words max-w-full">{profissional.nome}</span>
              {profissional.especialidade && (
                <Badge variant="outline" className="text-xs flex-shrink-0">{profissional.especialidade}</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
              {profissional.telefone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{formatPhoneDisplay(profissional.telefone)}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(profissional)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDelete(profissional)}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
          <Switch
            checked={profissional.ativo}
            onCheckedChange={() => onToggleAtivo(profissional)}
          />
        </div>
      </div>
    </div>
  );
}

export default function Profissionais() {
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Profissional | null>(null);
  const [excluindo, setExcluindo] = useState<Profissional | null>(null);
  const [nome, setNome] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [telefone, setTelefone] = useState("");
  const [countryCode, setCountryCode] = useState("55");
  const [email, setEmail] = useState("");

  const { data: profissionais, isLoading } = useProfissionais();
  const createProfissional = useCreateProfissional();
  const updateProfissional = useUpdateProfissional();
  const deleteProfissional = useDeleteProfissional();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Sort by ordem
  const sortedProfissionais = useMemo(() => {
    if (!profissionais) return [];
    return [...profissionais].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }, [profissionais]);

  const handleEditar = (prof: Profissional) => {
    setEditando(prof);
    setNome(prof.nome);
    setEspecialidade(prof.especialidade || "");
    // Extract country code and phone from stored value
    if (prof.telefone) {
      const { countryCode: extractedCode, phoneWithoutCountry } = extractCountryCode(prof.telefone);
      setCountryCode(extractedCode);
      setTelefone(phoneWithoutCountry);
    } else {
      setCountryCode("55");
      setTelefone("");
    }
    setEmail(prof.email || "");
    setOpen(true);
  };

  const limparFormulario = () => {
    setEditando(null);
    setNome("");
    setEspecialidade("");
    setTelefone("");
    setCountryCode("55");
    setEmail("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    // Build full phone with country code
    const fullPhone = telefone ? `${countryCode}${normalizePhone(telefone)}` : null;
    const dados = {
      nome,
      especialidade: especialidade || null,
      telefone: fullPhone,
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
      createProfissional.mutate({
        ...dados,
        ordem: (profissionais?.length || 0) + 1
      }, {
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

  const handleToggleAtivo = (prof: Profissional) => {
    updateProfissional.mutate({
      id: prof.id,
      ativo: !prof.ativo
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedProfissionais.findIndex((p) => p.id === active.id);
      const newIndex = sortedProfissionais.findIndex((p) => p.id === over.id);
      
      const newOrder = arrayMove(sortedProfissionais, oldIndex, newIndex);
      
      // Update order in database for all affected items
      for (let i = 0; i < newOrder.length; i++) {
        if ((newOrder[i].ordem || 0) !== i + 1) {
          updateProfissional.mutate({
            id: newOrder[i].id,
            ordem: i + 1,
          });
        }
      }
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Profissionais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg font-semibold">Profissionais</CardTitle>
          <Dialog open={open} onOpenChange={o => {
            setOpen(o);
            if (!o) limparFormulario();
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="flex-shrink-0">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{editando ? "Editar Profissional" : "Novo Profissional"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome</Label>
                  <Input id="nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="especialidade">Especialidade</Label>
                  <Input id="especialidade" value={especialidade} onChange={e => setEspecialidade(e.target.value)} placeholder="Ex: Dentista, Ortodontista..." />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone</Label>
                  <CountryCodeSelect
                    value={countryCode}
                    onChange={setCountryCode}
                    phoneValue={formatPhoneByCountry(telefone, countryCode)}
                    onPhoneChange={(val) => setTelefone(val.replace(/\D/g, ''))}
                    placeholder={getPhonePlaceholder(countryCode)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createProfissional.isPending || updateProfissional.isPending}>
                    {createProfissional.isPending || updateProfissional.isPending ? "Salvando..." : editando ? "Atualizar" : "Cadastrar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {sortedProfissionais.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nenhum profissional cadastrado.</p>
              <p className="text-sm mt-1">Adicione profissionais para usar nos agendamentos.</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={sortedProfissionais.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {sortedProfissionais.map((prof) => (
                    <SortableProfissionalItem
                      key={prof.id}
                      profissional={prof}
                      onEdit={handleEditar}
                      onDelete={setExcluindo}
                      onToggleAtivo={handleToggleAtivo}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

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
    </>
  );
}