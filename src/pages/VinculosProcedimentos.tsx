import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useVinculos, useCreateVinculo, useDeleteVinculo } from "@/hooks/useProcedimentoProfissional";
import { useProcedimentos } from "@/hooks/useProcedimentos";
import { useProfissionais } from "@/hooks/useProfissionais";

export default function VinculosProcedimentos() {
  const [procedimentoId, setProcedimentoId] = useState<string>("");
  const [profissionalId, setProfissionalId] = useState<string>("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: vinculos, isLoading } = useVinculos();
  const { data: procedimentos } = useProcedimentos(true);
  const { data: profissionais } = useProfissionais(true);
  const createVinculo = useCreateVinculo();
  const deleteVinculo = useDeleteVinculo();

  const handleCreate = () => {
    if (!procedimentoId || !profissionalId) return;

    // Verificar se já existe esse vínculo
    const vinculoExiste = vinculos?.some(
      (v: any) => v.procedimento_id === procedimentoId && v.profissional_id === profissionalId
    );

    if (vinculoExiste) {
      return;
    }

    createVinculo.mutate(
      { procedimento_id: procedimentoId, profissional_id: profissionalId },
      {
        onSuccess: () => {
          setProcedimentoId("");
          setProfissionalId("");
        },
      }
    );
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteVinculo.mutate(deleteId, {
        onSuccess: () => setDeleteId(null),
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Vincular Profissional a Procedimento</CardTitle>
          <CardDescription>
            Defina quais procedimentos cada profissional pode realizar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Select value={procedimentoId} onValueChange={setProcedimentoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o procedimento" />
                </SelectTrigger>
                <SelectContent>
                  {procedimentos?.map((proc) => (
                    <SelectItem key={proc.id} value={proc.id}>
                      {proc.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1">
              <Select value={profissionalId} onValueChange={setProfissionalId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o profissional" />
                </SelectTrigger>
                <SelectContent>
                  {profissionais?.map((prof) => (
                    <SelectItem key={prof.id} value={prof.id}>
                      {prof.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleCreate}
              disabled={!procedimentoId || !profissionalId || createVinculo.isPending}
              className="sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vínculos Existentes</CardTitle>
          <CardDescription>
            {vinculos?.length || 0} vínculo(s) cadastrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : vinculos?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum vínculo cadastrado ainda
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Procedimento</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vinculos?.map((vinculo: any) => (
                    <TableRow key={vinculo.id}>
                      <TableCell className="font-medium">
                        {vinculo.procedimentos?.nome}
                      </TableCell>
                      <TableCell>{vinculo.profissionais?.nome}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(vinculo.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover vínculo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este vínculo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
