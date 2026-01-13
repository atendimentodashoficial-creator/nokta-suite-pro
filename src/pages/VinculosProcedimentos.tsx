import { useState, useMemo } from "react";
import { User, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useVinculos, useCreateVinculo, useDeleteVinculo } from "@/hooks/useProcedimentoProfissional";
import { useProcedimentos } from "@/hooks/useProcedimentos";
import { useProfissionais } from "@/hooks/useProfissionais";

export default function VinculosProcedimentos() {
  const [profissionalSelecionado, setProfissionalSelecionado] = useState<string>("todos");
  const [profissionaisExpandidos, setProfissionaisExpandidos] = useState<Set<string>>(new Set());

  const { data: vinculos, isLoading } = useVinculos();
  const { data: procedimentos } = useProcedimentos(true);
  const { data: profissionais } = useProfissionais(true);
  const createVinculo = useCreateVinculo();
  const deleteVinculo = useDeleteVinculo();

  // Build data structure: for each professional, list all procedures with their vinculo status
  const profissionaisComProcedimentos = useMemo(() => {
    if (!procedimentos || !profissionais) return [];
    
    const profissionaisParaMostrar = profissionalSelecionado === "todos" 
      ? profissionais 
      : profissionais.filter(p => p.id === profissionalSelecionado);

    return profissionaisParaMostrar.map(prof => {
      // Get all vinculos for this professional
      const vinculosDoProf = vinculos?.filter((v: any) => v.profissional_id === prof.id) || [];

      // Map all procedures, marking which ones are linked
      const procedimentosComStatus = procedimentos.map(proc => {
        const vinculo = vinculosDoProf.find((v: any) => v.procedimento_id === proc.id);
        return {
          procedimentoId: proc.id,
          procedimentoNome: proc.nome,
          procedimentoCategoria: proc.categoria,
          vinculoId: vinculo?.id || null,
          isActive: !!vinculo,
        };
      });

      // Sort: active ones first, then alphabetically
      procedimentosComStatus.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return a.procedimentoNome.localeCompare(b.procedimentoNome);
      });

      const activeCount = procedimentosComStatus.filter(p => p.isActive).length;
      return {
        profissional: prof,
        procedimentos: procedimentosComStatus,
        activeCount
      };
    });
  }, [vinculos, procedimentos, profissionais, profissionalSelecionado]);

  const toggleProfissionalExpandido = (profissionalId: string) => {
    setProfissionaisExpandidos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(profissionalId)) {
        newSet.delete(profissionalId);
      } else {
        newSet.add(profissionalId);
      }
      return newSet;
    });
  };

  const handleToggle = (profissionalId: string) => (procedimentoId: string, isActive: boolean, vinculoId: string | null) => {
    if (isActive) {
      // Create new vinculo
      const vinculosDoProf = vinculos?.filter((v: any) => v.profissional_id === profissionalId) || [];
      const maxOrdem = vinculosDoProf.reduce((max: number, v: any) => Math.max(max, v.ordem ?? 0), 0);
      createVinculo.mutate({
        procedimento_id: procedimentoId,
        profissional_id: profissionalId,
        ordem: maxOrdem + 1
      });
    } else if (vinculoId) {
      // Delete existing vinculo
      deleteVinculo.mutate(vinculoId);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtro por Profissional */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">Filtrar por Profissional</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={profissionalSelecionado} onValueChange={setProfissionalSelecionado}>
            <SelectTrigger>
              <SelectValue placeholder="Todos os profissionais" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os profissionais</SelectItem>
              {profissionais?.map(prof => (
                <SelectItem key={prof.id} value={prof.id}>
                  {prof.nome} {prof.especialidade && `- ${prof.especialidade}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Lista de Profissionais com Procedimentos */}
      {isLoading ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">Carregando...</div>
          </CardContent>
        </Card>
      ) : profissionaisComProcedimentos.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              Cadastre procedimentos e profissionais primeiro
            </div>
          </CardContent>
        </Card>
      ) : (
        profissionaisComProcedimentos.map(({ profissional, procedimentos: procs, activeCount }) => (
          <Collapsible 
            key={profissional.id} 
            open={profissionaisExpandidos.has(profissional.id)} 
            onOpenChange={() => toggleProfissionalExpandido(profissional.id)}
          >
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    {profissionaisExpandidos.has(profissional.id) ? (
                      <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    )}
                    <User className="h-5 w-5 flex-shrink-0" />
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <CardTitle className="text-base font-semibold truncate">
                        {profissional.nome}
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {activeCount} procedimento{activeCount !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-2">
                  {procs.map(proc => (
                    <div
                      key={proc.procedimentoId}
                      className={`flex items-center justify-between gap-2 p-3 rounded-lg border ${
                        !proc.isActive ? "bg-muted/30" : "bg-card"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium truncate ${!proc.isActive ? 'text-muted-foreground' : ''}`}>
                            {proc.procedimentoNome}
                          </span>
                          {proc.procedimentoCategoria && (
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              {proc.procedimentoCategoria}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Switch
                        checked={proc.isActive}
                        onCheckedChange={(checked) => 
                          handleToggle(profissional.id)(proc.procedimentoId, checked, proc.vinculoId)
                        }
                        disabled={createVinculo.isPending || deleteVinculo.isPending}
                        className="flex-shrink-0"
                      />
                    </div>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))
      )}
    </div>
  );
}
