import { useState } from "react";
import { useProfissionais } from "@/hooks/useProfissionais";
import { useEscalas, useAusencias, useCreateEscala, useDeleteEscala, useCreateAusencia, useDeleteAusencia } from "@/hooks/useEscalas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar, Trash2, Plus, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const DIAS_SEMANA = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

export default function Escala() {
  const { toast } = useToast();
  const [profissionalSelecionado, setProfissionalSelecionado] = useState<string>("");
  const [dialogEscalaAberto, setDialogEscalaAberto] = useState(false);
  const [dialogAusenciaAberto, setDialogAusenciaAberto] = useState(false);

  // Form states - Escala
  const [diaSemana, setDiaSemana] = useState<number>(1);
  const [horaInicio, setHoraInicio] = useState("08:00");
  const [horaFim, setHoraFim] = useState("17:00");

  // Form states - Ausência
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [motivo, setMotivo] = useState("");

  const { data: profissionais } = useProfissionais(true);
  const { data: escalas } = useEscalas(profissionalSelecionado || undefined);
  const { data: ausencias } = useAusencias(profissionalSelecionado || undefined);

  const createEscala = useCreateEscala();
  const deleteEscala = useDeleteEscala();
  const createAusencia = useCreateAusencia();
  const deleteAusencia = useDeleteAusencia();

  const handleCriarEscala = async () => {
    if (!profissionalSelecionado) {
      toast({
        title: "Erro",
        description: "Selecione um profissional",
        variant: "destructive",
      });
      return;
    }

    try {
      await createEscala.mutateAsync({
        profissional_id: profissionalSelecionado,
        dia_semana: diaSemana,
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        ativo: true,
      });

      toast({
        title: "Sucesso",
        description: "Horário adicionado à escala",
      });

      setDialogEscalaAberto(false);
      setDiaSemana(1);
      setHoraInicio("08:00");
      setHoraFim("17:00");
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível adicionar o horário",
        variant: "destructive",
      });
    }
  };

  const handleCriarAusencia = async () => {
    if (!profissionalSelecionado || !dataInicio || !dataFim) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    try {
      await createAusencia.mutateAsync({
        profissional_id: profissionalSelecionado,
        data_inicio: dataInicio,
        data_fim: dataFim,
        motivo: motivo || null,
      });

      toast({
        title: "Sucesso",
        description: "Ausência registrada",
      });

      setDialogAusenciaAberto(false);
      setDataInicio("");
      setDataFim("");
      setMotivo("");
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível registrar a ausência",
        variant: "destructive",
      });
    }
  };

  const handleDeletarEscala = async (id: string) => {
    try {
      await deleteEscala.mutateAsync(id);
      toast({
        title: "Sucesso",
        description: "Horário removido da escala",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível remover o horário",
        variant: "destructive",
      });
    }
  };

  const handleDeletarAusencia = async (id: string) => {
    try {
      await deleteAusencia.mutateAsync(id);
      toast({
        title: "Sucesso",
        description: "Ausência removida",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível remover a ausência",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Seletor de Profissional */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Selecione o Profissional</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={profissionalSelecionado} onValueChange={setProfissionalSelecionado}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha um profissional" />
            </SelectTrigger>
            <SelectContent>
              {profissionais?.map((prof) => (
                <SelectItem key={prof.id} value={prof.id}>
                  {prof.nome} {prof.especialidade && `- ${prof.especialidade}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {profissionalSelecionado && (
        <>
          {/* Escala Semanal */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Escala Semanal
              </CardTitle>
              <Dialog open={dialogEscalaAberto} onOpenChange={setDialogEscalaAberto}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Horário
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Adicionar Horário à Escala</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Dia da Semana</Label>
                      <Select value={diaSemana.toString()} onValueChange={(v) => setDiaSemana(parseInt(v))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DIAS_SEMANA.map((dia) => (
                            <SelectItem key={dia.value} value={dia.value.toString()}>
                              {dia.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Hora Início</Label>
                      <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
                    </div>
                    <div>
                      <Label>Hora Fim</Label>
                      <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
                    </div>
                    <Button onClick={handleCriarEscala} className="w-full">
                      Adicionar
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {escalas && escalas.length > 0 ? (
                <div className="space-y-2">
                  {escalas.map((escala) => (
                    <div key={escala.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{DIAS_SEMANA.find((d) => d.value === escala.dia_semana)?.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {escala.hora_inicio} - {escala.hora_fim}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDeletarEscala(escala.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">Nenhum horário cadastrado</p>
              )}
            </CardContent>
          </Card>

          {/* Ausências */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Ausências / Férias
              </CardTitle>
              <Dialog open={dialogAusenciaAberto} onOpenChange={setDialogAusenciaAberto}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Registrar Ausência
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Registrar Ausência</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Data Início</Label>
                      <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                    </div>
                    <div>
                      <Label>Data Fim</Label>
                      <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
                    </div>
                    <div>
                      <Label>Motivo (opcional)</Label>
                      <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex: Férias, Licença médica..." />
                    </div>
                    <Button onClick={handleCriarAusencia} className="w-full">
                      Registrar
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {ausencias && ausencias.length > 0 ? (
                <div className="space-y-2">
                  {ausencias.map((ausencia) => (
                    <div key={ausencia.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">
                          {format(parseISO(ausencia.data_inicio), "dd/MM/yyyy", { locale: ptBR })} -{" "}
                          {format(parseISO(ausencia.data_fim), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                        {ausencia.motivo && <p className="text-sm text-muted-foreground">{ausencia.motivo}</p>}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDeletarAusencia(ausencia.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">Nenhuma ausência registrada</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}