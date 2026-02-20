import { useState, useEffect } from "react";
import { Database, Trash2, Plus, Users, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ImportarListaDialog } from "./ImportarListaDialog";

interface ListaImportada {
  id: string;
  nome: string;
  total_contatos: number;
  created_at: string;
}

export function ListasImportadasManager() {
  const { user } = useAuth();
  const [listas, setListas] = useState<ListaImportada[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [importarOpen, setImportarOpen] = useState(false);
  const [listaParaExcluir, setListaParaExcluir] = useState<ListaImportada | null>(null);

  const loadListas = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("listas_importadas")
        .select("id, nome, total_contatos, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setListas(data || []);
    } catch (err) {
      toast.error("Erro ao carregar listas");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadListas();
  }, [user]);

  const handleExcluir = async () => {
    if (!listaParaExcluir) return;
    try {
      const { error } = await supabase
        .from("listas_importadas")
        .delete()
        .eq("id", listaParaExcluir.id);

      if (error) throw error;
      toast.success("Lista excluída com sucesso");
      setListaParaExcluir(null);
      loadListas();
    } catch {
      toast.error("Erro ao excluir lista");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Listas Importadas</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadListas} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setImportarOpen(true)}>
            <Plus className="w-4 h-4" />
            Importar Lista
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Carregando…</div>
      ) : listas.length === 0 ? (
        <Card className="p-8">
          <div className="text-center space-y-3">
            <Database className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="font-medium">Nenhuma lista importada</p>
            <p className="text-sm text-muted-foreground">
              Importe um arquivo CSV para criar sua primeira lista de contatos.
            </p>
            <Button className="gap-2 mt-2" onClick={() => setImportarOpen(true)}>
              <Plus className="w-4 h-4" />
              Importar Lista
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listas.map((lista) => (
            <Card key={lista.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{lista.nome}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(lista.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setListaParaExcluir(lista)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{lista.total_contatos.toLocaleString("pt-BR")} contatos</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ImportarListaDialog
        open={importarOpen}
        onOpenChange={setImportarOpen}
        onListaImportada={loadListas}
      />

      <AlertDialog open={!!listaParaExcluir} onOpenChange={(o) => !o && setListaParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lista</AlertDialogTitle>
            <AlertDialogDescription>
              Isso irá excluir permanentemente a lista &ldquo;{listaParaExcluir?.nome}&rdquo; e todos os seus{" "}
              {listaParaExcluir?.total_contatos} contatos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleExcluir}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
