import { useState, useRef } from "react";
import { useTabPersistence } from "@/hooks/useTabPersistence";
import { Plus, Pencil, Trash2, Play, Pause, Mic, Square, Upload, Volume2, FolderPlus, Folder, GripVertical, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMensagensPredefinidas, MensagemPredefinida } from "@/hooks/useMensagensPredefinidas";
import { useAudiosPredefinidos, AudioPredefinido } from "@/hooks/useAudiosPredefinidos";
import { useBlocosMensagens, BlocoMensagem } from "@/hooks/useBlocosMensagens";
import { useBlocosAudios, BlocoAudio } from "@/hooks/useBlocosAudios";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
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

interface SortableMensagemCardProps {
  mensagem: MensagemPredefinida;
  onEdit: (mensagem: MensagemPredefinida) => void;
  onDelete: (id: string) => void;
}

function SortableMensagemCard({ mensagem, onEdit, onDelete }: SortableMensagemCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: mensagem.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-card"
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm truncate block">{mensagem.titulo}</span>
          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-2 flex items-start gap-1">
            <MessageSquare className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>{mensagem.conteudo}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(mensagem)}>
          <Pencil className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(mensagem.id)}>
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

interface SortableAudioCardProps {
  audio: AudioPredefinido;
  playingAudioId: string | null;
  onPlay: (audio: AudioPredefinido) => void;
  onEdit: (audio: AudioPredefinido) => void;
  onDelete: (id: string) => void;
  formatDuration: (seconds: number | null) => string;
}

function SortableAudioCard({ audio, playingAudioId, onPlay, onEdit, onDelete, formatDuration }: SortableAudioCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: audio.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-card"
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
        <Button
          variant="outline"
          size="icon"
          className="flex-shrink-0 h-8 w-8"
          onClick={() => onPlay(audio)}
        >
          {playingAudioId === audio.id ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </Button>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm truncate block">{audio.titulo}</span>
          <p className="text-xs text-muted-foreground mt-1">
            Duração: {formatDuration(audio.duracao_segundos)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(audio)}>
          <Pencil className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(audio.id)}>
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

interface SortableBlocoMensagemProps {
  bloco: BlocoMensagem;
  mensagens: MensagemPredefinida[];
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: (bloco: BlocoMensagem) => void;
  onDelete: (id: string) => void;
  onEditMensagem: (mensagem: MensagemPredefinida) => void;
  onDeleteMensagem: (id: string) => void;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent, blocoId: string) => void;
}

function SortableBlocoMensagemCard({
  bloco,
  mensagens,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onEditMensagem,
  onDeleteMensagem,
  sensors,
  onDragEnd,
}: SortableBlocoMensagemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bloco.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div ref={setNodeRef} style={style} className="rounded-lg border p-3 sm:p-4">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between gap-2 cursor-pointer">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground" />
              </button>
              <h3 className="font-semibold text-sm sm:text-base truncate">{bloco.titulo}</h3>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
                {mensagens.length}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onEdit(bloco); }} className="h-8 w-8">
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDelete(bloco.id); }} className="h-8 w-8">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
              <ChevronDown className={`w-4 h-4 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          {mensagens.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma mensagem neste bloco
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => onDragEnd(e, bloco.id)}
            >
              <SortableContext
                items={mensagens.map(m => m.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {mensagens.map(mensagem => (
                    <SortableMensagemCard
                      key={mensagem.id}
                      mensagem={mensagem}
                      onEdit={onEditMensagem}
                      onDelete={onDeleteMensagem}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface SortableBlocoAudioProps {
  bloco: BlocoAudio;
  audios: AudioPredefinido[];
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: (bloco: BlocoAudio) => void;
  onDelete: (id: string) => void;
  onEditAudio: (audio: AudioPredefinido) => void;
  onDeleteAudio: (id: string) => void;
  onPlayAudio: (audio: AudioPredefinido) => void;
  playingAudioId: string | null;
  formatDuration: (seconds: number | null) => string;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent, blocoId: string) => void;
}

function SortableBlocoAudioCard({
  bloco,
  audios,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onEditAudio,
  onDeleteAudio,
  onPlayAudio,
  playingAudioId,
  formatDuration,
  sensors,
  onDragEnd,
}: SortableBlocoAudioProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bloco.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div ref={setNodeRef} style={style} className="rounded-lg border p-3 sm:p-4">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between gap-2 cursor-pointer">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground" />
              </button>
              <h3 className="font-semibold text-sm sm:text-base truncate">{bloco.titulo}</h3>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">
                {audios.length}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onEdit(bloco); }} className="h-8 w-8">
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDelete(bloco.id); }} className="h-8 w-8">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
              <ChevronDown className={`w-4 h-4 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          {audios.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum áudio neste bloco
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => onDragEnd(e, bloco.id)}
            >
              <SortableContext
                items={audios.map(a => a.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {audios.map(audio => (
                    <SortableAudioCard
                      key={audio.id}
                      audio={audio}
                      playingAudioId={playingAudioId}
                      onPlay={onPlayAudio}
                      onEdit={onEditAudio}
                      onDelete={onDeleteAudio}
                      formatDuration={formatDuration}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function MensagensPredefinidas() {
  const {
    mensagens,
    isLoading: isLoadingMensagens,
    createMensagem,
    updateMensagem,
    deleteMensagem,
    reorderMensagens
  } = useMensagensPredefinidas();

  const {
    blocos,
    isLoading: isLoadingBlocos,
    createBloco,
    updateBloco,
    deleteBloco,
    reorderBlocos,
  } = useBlocosMensagens();

  const {
    blocosAudios,
    isLoading: isLoadingBlocosAudios,
    createBlocoAudio,
    updateBlocoAudio,
    deleteBlocoAudio,
    reorderBlocosAudios,
  } = useBlocosAudios();

  const {
    audios,
    isLoading: isLoadingAudios,
    createAudio,
    updateAudio,
    deleteAudio,
    reorderAudios,
    isCreating: isCreatingAudio,
    isUpdating: isUpdatingAudio,
  } = useAudiosPredefinidos();

  // Tab persistente para sub-tab de mensagens
  const [activeMsgTab, setActiveMsgTab] = useTabPersistence("msgtab", "texto");

  // Text message state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingMensagem, setEditingMensagem] = useState<MensagemPredefinida | null>(null);
  const [mensagemToDelete, setMensagemToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({ titulo: "", conteudo: "", bloco_id: "" });

  // Block state
  const [blocoDialogOpen, setBlocoDialogOpen] = useState(false);
  const [deleteBlocoDialogOpen, setDeleteBlocoDialogOpen] = useState(false);
  const [editingBloco, setEditingBloco] = useState<BlocoMensagem | null>(null);
  const [blocoToDelete, setBlocoToDelete] = useState<string | null>(null);
  const [blocoFormData, setBlocoFormData] = useState({ titulo: "" });
  const [expandedBlocos, setExpandedBlocos] = useState<Record<string, boolean>>({});

  // Audio state
  const [audioDialogOpen, setAudioDialogOpen] = useState(false);
  const [audioDeleteDialogOpen, setAudioDeleteDialogOpen] = useState(false);
  const [editingAudio, setEditingAudio] = useState<AudioPredefinido | null>(null);
  const [audioToDelete, setAudioToDelete] = useState<string | null>(null);
  const [audioFormData, setAudioFormData] = useState({ titulo: "", bloco_id: "" });
  const [expandedAudioBlocos, setExpandedAudioBlocos] = useState<Record<string, boolean>>({});
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);

  // Audio block state
  const [audioBlocoDialogOpen, setAudioBlocoDialogOpen] = useState(false);
  const [deleteAudioBlocoDialogOpen, setDeleteAudioBlocoDialogOpen] = useState(false);
  const [editingAudioBloco, setEditingAudioBloco] = useState<BlocoAudio | null>(null);
  const [audioBlocoToDelete, setAudioBlocoToDelete] = useState<string | null>(null);
  const [audioBlocoFormData, setAudioBlocoFormData] = useState({ titulo: "" });
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Playback state
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Text message handlers
  const handleOpenDialog = (mensagem?: MensagemPredefinida) => {
    if (mensagem) {
      setEditingMensagem(mensagem);
      setFormData({ titulo: mensagem.titulo, conteudo: mensagem.conteudo, bloco_id: mensagem.bloco_id || "" });
    } else {
      setEditingMensagem(null);
      setFormData({ titulo: "", conteudo: "", bloco_id: "" });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingMensagem(null);
    setFormData({ titulo: "", conteudo: "", bloco_id: "" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMensagem) {
      updateMensagem({ 
        id: editingMensagem.id, 
        titulo: formData.titulo, 
        conteudo: formData.conteudo,
        bloco_id: formData.bloco_id || null
      });
    } else {
      createMensagem({
        titulo: formData.titulo,
        conteudo: formData.conteudo,
        bloco_id: formData.bloco_id || null
      });
    }
    handleCloseDialog();
  };

  const handleDeleteClick = (id: string) => {
    setMensagemToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (mensagemToDelete) {
      deleteMensagem(mensagemToDelete);
      setMensagemToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  // Handle drag end for reordering within same container
  const handleDragEnd = (event: DragEndEvent, blocoId: string | null) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const containerMensagens = mensagens
      .filter(m => m.bloco_id === blocoId)
      .sort((a, b) => a.ordem - b.ordem);
    
    const oldIndex = containerMensagens.findIndex(m => m.id === active.id);
    const newIndex = containerMensagens.findIndex(m => m.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedList = arrayMove(containerMensagens, oldIndex, newIndex);
    const updates = reorderedList.map((m, idx) => ({
      id: m.id,
      ordem: idx,
      bloco_id: blocoId
    }));
    
    reorderMensagens(updates);
  };

  // Block handlers
  const handleOpenBlocoDialog = (bloco?: BlocoMensagem) => {
    if (bloco) {
      setEditingBloco(bloco);
      setBlocoFormData({ titulo: bloco.titulo });
    } else {
      setEditingBloco(null);
      setBlocoFormData({ titulo: "" });
    }
    setBlocoDialogOpen(true);
  };

  const handleCloseBlocoDialog = () => {
    setBlocoDialogOpen(false);
    setEditingBloco(null);
    setBlocoFormData({ titulo: "" });
  };

  const handleBlocoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBloco) {
      updateBloco({ id: editingBloco.id, titulo: blocoFormData.titulo });
    } else {
      createBloco({ titulo: blocoFormData.titulo });
    }
    handleCloseBlocoDialog();
  };

  const handleDeleteBlocoClick = (id: string) => {
    setBlocoToDelete(id);
    setDeleteBlocoDialogOpen(true);
  };

  const handleConfirmDeleteBloco = () => {
    if (blocoToDelete) {
      deleteBloco(blocoToDelete);
      setBlocoToDelete(null);
    }
    setDeleteBlocoDialogOpen(false);
  };

  const toggleBloco = (blocoId: string) => {
    setExpandedBlocos(prev => ({ ...prev, [blocoId]: !prev[blocoId] }));
  };

  // Handle drag end for block reordering
  const handleBlocoDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const oldIndex = blocos.findIndex(b => b.id === active.id);
    const newIndex = blocos.findIndex(b => b.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedList = arrayMove(blocos, oldIndex, newIndex);
    const updates = reorderedList.map((b, idx) => ({
      id: b.id,
      ordem: idx,
    }));
    
    reorderBlocos(updates);
  };

  // Handle drag end for audio block reordering
  const handleAudioBlocoDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const oldIndex = blocosAudios.findIndex(b => b.id === active.id);
    const newIndex = blocosAudios.findIndex(b => b.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedList = arrayMove(blocosAudios, oldIndex, newIndex);
    const updates = reorderedList.map((b, idx) => ({
      id: b.id,
      ordem: idx,
    }));
    
    reorderBlocosAudios(updates);
  };

  // Audio handlers
  const handleOpenAudioDialog = (audio?: AudioPredefinido) => {
    if (audio) {
      setEditingAudio(audio);
      setAudioFormData({ titulo: audio.titulo, bloco_id: audio.bloco_id || "" });
      setAudioPreviewUrl(audio.audio_url);
    } else {
      setEditingAudio(null);
      setAudioFormData({ titulo: "", bloco_id: "" });
      setAudioPreviewUrl(null);
    }
    setAudioFile(null);
    setAudioDialogOpen(true);
  };

  const handleCloseAudioDialog = () => {
    setAudioDialogOpen(false);
    setEditingAudio(null);
    setAudioFormData({ titulo: "", bloco_id: "" });
    setAudioFile(null);
    setAudioPreviewUrl(null);
    stopRecording();
  };

  const toggleAudioBloco = (blocoId: string) => {
    setExpandedAudioBlocos(prev => ({ ...prev, [blocoId]: !prev[blocoId] }));
  };

  const handleAudioSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFormData.titulo) {
      toast.error("Preencha o título do áudio");
      return;
    }
    if (editingAudio) {
      updateAudio({ 
        id: editingAudio.id, 
        titulo: audioFormData.titulo, 
        audioFile: audioFile || undefined,
        bloco_id: audioFormData.bloco_id || null
      });
    } else {
      if (!audioFile) {
        toast.error("Grave ou selecione um arquivo de áudio");
        return;
      }
      createAudio({ 
        titulo: audioFormData.titulo, 
        audioFile,
        bloco_id: audioFormData.bloco_id || null
      });
    }
    handleCloseAudioDialog();
  };

  // Handle drag end for audio reordering within same container
  const handleAudioDragEnd = (event: DragEndEvent, blocoId: string | null) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const containerAudios = audios
      .filter(a => a.bloco_id === blocoId)
      .sort((a, b) => a.ordem - b.ordem);
    
    const oldIndex = containerAudios.findIndex(a => a.id === active.id);
    const newIndex = containerAudios.findIndex(a => a.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedList = arrayMove(containerAudios, oldIndex, newIndex);
    const updates = reorderedList.map((a, idx) => ({
      id: a.id,
      ordem: idx,
      bloco_id: blocoId
    }));
    
    reorderAudios(updates);
  };

  const handleAudioDeleteClick = (id: string) => {
    setAudioToDelete(id);
    setAudioDeleteDialogOpen(true);
  };

  const handleConfirmAudioDelete = () => {
    if (audioToDelete) {
      deleteAudio(audioToDelete);
      setAudioToDelete(null);
    }
    setAudioDeleteDialogOpen(false);
  };

  // Audio block handlers
  const handleOpenAudioBlocoDialog = (bloco?: BlocoAudio) => {
    if (bloco) {
      setEditingAudioBloco(bloco);
      setAudioBlocoFormData({ titulo: bloco.titulo });
    } else {
      setEditingAudioBloco(null);
      setAudioBlocoFormData({ titulo: "" });
    }
    setAudioBlocoDialogOpen(true);
  };

  const handleCloseAudioBlocoDialog = () => {
    setAudioBlocoDialogOpen(false);
    setEditingAudioBloco(null);
    setAudioBlocoFormData({ titulo: "" });
  };

  const handleAudioBlocoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAudioBloco) {
      updateBlocoAudio({ id: editingAudioBloco.id, titulo: audioBlocoFormData.titulo });
    } else {
      createBlocoAudio({ titulo: audioBlocoFormData.titulo });
    }
    handleCloseAudioBlocoDialog();
  };

  const handleDeleteAudioBlocoClick = (id: string) => {
    setAudioBlocoToDelete(id);
    setDeleteAudioBlocoDialogOpen(true);
  };

  const handleConfirmDeleteAudioBloco = () => {
    if (audioBlocoToDelete) {
      deleteBlocoAudio(audioBlocoToDelete);
      setAudioBlocoToDelete(null);
    }
    setDeleteAudioBlocoDialogOpen(false);
  };

  // Recording handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const file = new File([audioBlob], `audio_${Date.now()}.webm`, { type: "audio/webm" });
        setAudioFile(file);
        setAudioPreviewUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.info("Gravando áudio...");
    } catch (error) {
      console.error("Error starting recording:", error);
      toast.error("Erro ao acessar microfone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast.success("Gravação finalizada!");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("audio/")) {
        toast.error("Selecione um arquivo de áudio válido");
        return;
      }
      setAudioFile(file);
      setAudioPreviewUrl(URL.createObjectURL(file));
    }
  };

  // Playback handlers
  const handlePlayAudio = (audio: AudioPredefinido) => {
    if (playingAudioId === audio.id) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
    } else {
      audioRef.current?.pause();
      const newAudio = new Audio(audio.audio_url);
      audioRef.current = newAudio;
      newAudio.onended = () => setPlayingAudioId(null);
      newAudio.play();
      setPlayingAudioId(audio.id);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Group messages by bloco
  const mensagensSemBloco = mensagens.filter(m => !m.bloco_id).sort((a, b) => a.ordem - b.ordem);
  const mensagensPorBloco = blocos.map(bloco => ({
    bloco,
    mensagens: mensagens.filter(m => m.bloco_id === bloco.id).sort((a, b) => a.ordem - b.ordem)
  }));

  if (isLoadingMensagens || isLoadingAudios || isLoadingBlocos || isLoadingBlocosAudios) {
    return <div className="text-center py-8">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeMsgTab} onValueChange={setActiveMsgTab} className="space-y-4">
        <TabsList className="h-8">
          <TabsTrigger value="texto" className="text-xs px-3 h-7">Mensagens de Texto</TabsTrigger>
          <TabsTrigger value="audio" className="text-xs px-3 h-7">Mensagens de Áudio</TabsTrigger>
        </TabsList>

        {/* Tab: Text Messages */}
        <TabsContent value="texto" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div>
              <h2 className="text-2xl font-bold">Mensagens Pré-definidas</h2>
              <p className="text-sm text-muted-foreground">
                Crie mensagens organizadas em blocos para usar rapidamente no WhatsApp
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleOpenBlocoDialog()}>
                <FolderPlus className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Novo Bloco</span>
                <span className="sm:hidden">Bloco</span>
              </Button>
              <Button size="sm" onClick={() => handleOpenDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Nova Mensagem</span>
                <span className="sm:hidden">Mensagem</span>
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {/* Messages without block */}
            {mensagensSemBloco.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">Sem bloco</h3>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => handleDragEnd(e, null)}
                >
                  <SortableContext
                    items={mensagensSemBloco.map(m => m.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="grid gap-2">
                      {mensagensSemBloco.map(mensagem => (
                        <SortableMensagemCard
                          key={mensagem.id}
                          mensagem={mensagem}
                          onEdit={handleOpenDialog}
                          onDelete={handleDeleteClick}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}

            {/* Blocks with messages - sortable */}
            {blocos.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleBlocoDragEnd}
              >
                <SortableContext
                  items={blocos.map(b => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {mensagensPorBloco.map(({ bloco, mensagens: blocoMensagens }) => (
                      <SortableBlocoMensagemCard
                        key={bloco.id}
                        bloco={bloco}
                        mensagens={blocoMensagens}
                        isExpanded={expandedBlocos[bloco.id] !== false}
                        onToggle={() => toggleBloco(bloco.id)}
                        onEdit={handleOpenBlocoDialog}
                        onDelete={handleDeleteBlocoClick}
                        onEditMensagem={handleOpenDialog}
                        onDeleteMensagem={handleDeleteClick}
                        sensors={sensors}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {mensagens.length === 0 && blocos.length === 0 && (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">
                  Nenhuma mensagem pré-definida ainda. Crie um bloco ou uma mensagem para começar!
                </p>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Tab: Audio Messages */}
        <TabsContent value="audio" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div>
              <h2 className="text-2xl font-bold">Áudios Pré-definidos</h2>
              <p className="text-sm text-muted-foreground">
                Grave ou envie áudios organizados em blocos para usar rapidamente no WhatsApp
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleOpenAudioBlocoDialog()}>
                <FolderPlus className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Novo Bloco</span>
                <span className="sm:hidden">Bloco</span>
              </Button>
              <Button size="sm" onClick={() => handleOpenAudioDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Adicionar Áudio</span>
                <span className="sm:hidden">Áudio</span>
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {/* Audios without block */}
            {(() => {
              const audiosSemBloco = audios.filter(a => !a.bloco_id).sort((a, b) => a.ordem - b.ordem);
              if (audiosSemBloco.length === 0 && blocosAudios.length === 0 && audios.length === 0) {
                return (
                  <Card className="p-8 text-center">
                    <Volume2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      Nenhum áudio pré-definido ainda. Crie um bloco ou áudio para começar!
                    </p>
                  </Card>
                );
              }
              if (audiosSemBloco.length === 0) return null;
              return (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Sem bloco</h3>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e) => handleAudioDragEnd(e, null)}
                  >
                    <SortableContext
                      items={audiosSemBloco.map(a => a.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="grid gap-2">
                        {audiosSemBloco.map(audio => (
                          <SortableAudioCard
                            key={audio.id}
                            audio={audio}
                            playingAudioId={playingAudioId}
                            onPlay={handlePlayAudio}
                            onEdit={handleOpenAudioDialog}
                            onDelete={handleAudioDeleteClick}
                            formatDuration={formatDuration}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              );
            })()}

            {/* Blocks with audios - sortable */}
            {blocosAudios.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleAudioBlocoDragEnd}
              >
                <SortableContext
                  items={blocosAudios.map(b => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {blocosAudios.map((bloco) => {
                      const blocoAudiosItems = audios.filter(a => a.bloco_id === bloco.id).sort((a, b) => a.ordem - b.ordem);
                      return (
                        <SortableBlocoAudioCard
                          key={bloco.id}
                          bloco={bloco}
                          audios={blocoAudiosItems}
                          isExpanded={expandedAudioBlocos[bloco.id] !== false}
                          onToggle={() => toggleAudioBloco(bloco.id)}
                          onEdit={handleOpenAudioBlocoDialog}
                          onDelete={handleDeleteAudioBlocoClick}
                          onEditAudio={handleOpenAudioDialog}
                          onDeleteAudio={handleAudioDeleteClick}
                          onPlayAudio={handlePlayAudio}
                          playingAudioId={playingAudioId}
                          formatDuration={formatDuration}
                          sensors={sensors}
                          onDragEnd={handleAudioDragEnd}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog: Create/Edit Text Message */}
      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMensagem ? "Editar Mensagem" : "Nova Mensagem"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                value={formData.titulo}
                onChange={e => setFormData({ ...formData, titulo: e.target.value })}
                placeholder="Ex: Boas-vindas"
                required
              />
            </div>
            <div>
              <Label htmlFor="bloco">Bloco (opcional)</Label>
              <Select
                value={formData.bloco_id}
                onValueChange={value => setFormData({ ...formData, bloco_id: value === "none" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um bloco" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem bloco</SelectItem>
                  {blocos.map(bloco => (
                    <SelectItem key={bloco.id} value={bloco.id}>
                      {bloco.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="conteudo">Mensagem</Label>
              <Textarea
                id="conteudo"
                value={formData.conteudo}
                onChange={e => setFormData({ ...formData, conteudo: e.target.value })}
                placeholder="Digite a mensagem..."
                className="min-h-[120px]"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use *negrito* _itálico_ ~tachado~ `code`
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingMensagem ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Create/Edit Block */}
      <Dialog open={blocoDialogOpen} onOpenChange={handleCloseBlocoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBloco ? "Editar Bloco" : "Novo Bloco"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBlocoSubmit} className="space-y-4">
            <div>
              <Label htmlFor="blocoTitulo">Título do Bloco</Label>
              <Input
                id="blocoTitulo"
                value={blocoFormData.titulo}
                onChange={e => setBlocoFormData({ titulo: e.target.value })}
                placeholder="Ex: Mensagens de Vendas"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseBlocoDialog}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingBloco ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Create/Edit Audio */}
      <Dialog open={audioDialogOpen} onOpenChange={handleCloseAudioDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAudio ? "Editar Áudio" : "Novo Áudio"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAudioSubmit} className="space-y-4">
            <div>
              <Label htmlFor="audioTitulo">Título</Label>
              <Input
                id="audioTitulo"
                value={audioFormData.titulo}
                onChange={e => setAudioFormData({ ...audioFormData, titulo: e.target.value })}
                placeholder="Ex: Mensagem de boas-vindas"
                required
              />
            </div>

            <div>
              <Label htmlFor="audioBloco">Bloco (opcional)</Label>
              <Select
                value={audioFormData.bloco_id}
                onValueChange={value => setAudioFormData({ ...audioFormData, bloco_id: value === "none" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um bloco" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem bloco</SelectItem>
                  {blocosAudios.map(bloco => (
                    <SelectItem key={bloco.id} value={bloco.id}>
                      {bloco.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Áudio</Label>
              
              {/* Recording controls */}
              <div className="flex gap-2">
                {!isRecording ? (
                  <Button type="button" variant="outline" onClick={startRecording} className="flex-1">
                    <Mic className="w-4 h-4 mr-2" />
                    Gravar Áudio
                  </Button>
                ) : (
                  <Button type="button" variant="destructive" onClick={stopRecording} className="flex-1">
                    <Square className="w-4 h-4 mr-2" />
                    Parar Gravação
                  </Button>
                )}
                <Label htmlFor="audioUpload" className="cursor-pointer">
                  <div className="flex items-center justify-center h-10 px-4 border rounded-md hover:bg-accent transition-colors">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload
                  </div>
                  <Input
                    id="audioUpload"
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </Label>
              </div>

              {/* Audio preview */}
              {audioPreviewUrl && (
                <div className="p-3 bg-muted rounded-lg">
                  <audio controls src={audioPreviewUrl} className="w-full" />
                  {audioFile && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Arquivo: {audioFile.name}
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseAudioDialog}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isCreatingAudio || isUpdatingAudio}>
                {isCreatingAudio || isUpdatingAudio ? "Salvando..." : editingAudio ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialogs */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Mensagem</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta mensagem pré-definida? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteBlocoDialogOpen} onOpenChange={setDeleteBlocoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Bloco</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este bloco? As mensagens dentro dele ficarão sem bloco. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteBloco}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={audioDeleteDialogOpen} onOpenChange={setAudioDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Áudio</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este áudio pré-definido? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAudioDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Create/Edit Audio Block */}
      <Dialog open={audioBlocoDialogOpen} onOpenChange={handleCloseAudioBlocoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAudioBloco ? "Editar Bloco de Áudio" : "Novo Bloco de Áudio"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAudioBlocoSubmit} className="space-y-4">
            <div>
              <Label htmlFor="audioBlocoTitulo">Título do Bloco</Label>
              <Input
                id="audioBlocoTitulo"
                value={audioBlocoFormData.titulo}
                onChange={e => setAudioBlocoFormData({ titulo: e.target.value })}
                placeholder="Ex: Áudios de Vendas"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseAudioBlocoDialog}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingAudioBloco ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteAudioBlocoDialogOpen} onOpenChange={setDeleteAudioBlocoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Bloco de Áudio</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este bloco? Os áudios dentro dele ficarão sem bloco. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteAudioBloco}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
