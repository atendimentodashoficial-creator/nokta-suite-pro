import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Send, CheckCircle, AlertCircle, Loader2, Megaphone, Eye, User, Calendar, MapPin, Mail, Phone, Pencil, Save, X, MessageSquare, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatPhoneDisplay } from "@/utils/phoneFormat";

type PixelStatus = "pendente" | "formulario_enviado" | "dados_completos" | "evento_enviado";

interface PixelStatusBadgeProps {
  faturaId: string;
  clienteId: string;
  clienteTelefone: string;
  clienteOrigem?: string | null;
  pixelStatus?: PixelStatus | null;
  compact?: boolean;
}

interface LeadData {
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  genero?: string | null;
  data_nascimento?: string | null;
  cep?: string | null;
  cidade?: string | null;
  estado?: string | null;
  endereco?: string | null;
}

export function PixelStatusBadge({
  faturaId,
  clienteId,
  clienteTelefone,
  clienteOrigem,
  pixelStatus,
  compact = false,
}: PixelStatusBadgeProps) {
  const [sendingEvent, setSendingEvent] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [leadData, setLeadData] = useState<LeadData | null>(null);
  const [editData, setEditData] = useState<LeadData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [dobText, setDobText] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [faturaValor, setFaturaValor] = useState<number | null>(null);
  const [loadingLeadData, setLoadingLeadData] = useState(false);
  const [sendFormDialogOpen, setSendFormDialogOpen] = useState(false);
  const [sendingForm, setSendingForm] = useState(false);
  const queryClient = useQueryClient();
  
  const status = pixelStatus || "pendente";

  // Get the form URL for this fatura
  const getFormUrl = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/conversao/${faturaId}`;
  };

  // Open WhatsApp with form link
  const openWhatsAppWithForm = async () => {
    setSendingForm(true);
    try {
      // Fetch pixel config for message template
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data: pixelConfig } = await supabase
        .from("meta_pixel_config")
        .select("mensagem_formulario")
        .eq("user_id", user.id)
        .maybeSingle();

      const formUrl = getFormUrl();
      const message = pixelConfig?.mensagem_formulario 
        ? `${pixelConfig.mensagem_formulario}\n\n${formUrl}`
        : `Olá! Para finalizar seu cadastro, preencha o formulário:\n\n${formUrl}`;
      
      // Format phone for WhatsApp
      const phoneClean = clienteTelefone.replace(/\D/g, "");
      const whatsappUrl = `https://wa.me/${phoneClean}?text=${encodeURIComponent(message)}`;
      
      // Update fatura status to formulario_enviado
      await supabase
        .from("faturas")
        .update({
          pixel_status: "formulario_enviado",
          pixel_form_sent_at: new Date().toISOString(),
        })
        .eq("id", faturaId);

      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      
      // Open WhatsApp
      window.open(whatsappUrl, "_blank");
      setSendFormDialogOpen(false);
      toast.success("Formulário enviado!");
    } catch (error) {
      console.error("Error sending form:", error);
      toast.error("Erro ao enviar formulário");
    } finally {
      setSendingForm(false);
    }
  };

  // Copy form link to clipboard
  const copyFormLink = async () => {
    try {
      await navigator.clipboard.writeText(getFormUrl());
      toast.success("Link copiado!");
    } catch {
      toast.error("Erro ao copiar link");
    }
  };

  const openReviewDialog = async () => {
    setLoadingLeadData(true);
    try {
      // Fetch lead data
      const { data: leadResult } = await supabase
        .from("leads")
        .select("nome, telefone, email, genero, data_nascimento, cep, cidade, estado, endereco")
        .eq("id", clienteId)
        .maybeSingle();
      
      // Fetch fatura value
      const { data: faturaResult } = await supabase
        .from("faturas")
        .select("valor")
        .eq("id", faturaId)
        .maybeSingle();
      
      setLeadData(leadResult);
      setFaturaValor(faturaResult?.valor || null);
      setReviewDialogOpen(true);
    } catch (error) {
      console.error("Error loading lead data:", error);
      toast.error("Erro ao carregar dados do cliente");
    } finally {
      setLoadingLeadData(false);
    }
  };

  const startEditing = () => {
    setEditData({ ...leadData });
    setDobText(leadData?.data_nascimento ? formatDate(leadData.data_nascimento) : "");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEditData(null);
    setDobText("");
    setIsEditing(false);
  };

  const parseDobToIso = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parts = trimmed.split("/");
    if (parts.length !== 3) return null;

    const [ddRaw, mmRaw, yyRaw] = parts;
    const dd = ddRaw?.padStart(2, "0");
    const mm = mmRaw?.padStart(2, "0");
    if (!dd || !mm || !yyRaw) return null;

    const day = Number(dd);
    const month = Number(mm);
    if (!Number.isFinite(day) || !Number.isFinite(month) || day < 1 || day > 31 || month < 1 || month > 12) return null;

    let year = yyRaw;
    if (year.length === 2) {
      const yy = Number(year);
      if (!Number.isFinite(yy)) return null;
      year = yy >= 30 ? `19${year}` : `20${year}`;
    }

    if (year.length !== 4) return null;
    return `${year}-${mm}-${dd}`;
  };

  const saveEdit = async () => {
    if (!editData) return;

    setSavingEdit(true);
    try {
      const isoDob = parseDobToIso(dobText);

      const { error } = await supabase
        .from("leads")
        .update({
          nome: editData.nome,
          email: editData.email,
          genero: editData.genero,
          data_nascimento: isoDob,
          cep: editData.cep,
          cidade: editData.cidade,
          estado: editData.estado,
          endereco: editData.endereco,
        })
        .eq("id", clienteId);

      if (error) throw error;

      setLeadData({ ...editData, data_nascimento: isoDob });
      setIsEditing(false);
      setEditData(null);
      setDobText("");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Dados atualizados!");
    } catch (error: any) {
      console.error("Error saving lead data:", error);
      toast.error("Erro ao salvar dados");
    } finally {
      setSavingEdit(false);
    }
  };

  const sendPixelEvent = async () => {
    setSendingEvent(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke("meta-conversions-api", {
        body: {
          event_name: "Purchase",
          lead_id: clienteId,
          fatura_id: faturaId,
          value: faturaValor,
          currency: "BRL",
          // Customer data from leadData
          customer_phone: leadData?.telefone,
          customer_email: leadData?.email,
          customer_name: leadData?.nome,
          customer_gender: leadData?.genero,
          customer_date_of_birth: leadData?.data_nascimento,
          customer_city: leadData?.cidade,
          customer_state: leadData?.estado,
          customer_zip: leadData?.cep,
          external_id: clienteId,
        },
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
      });

      if (response.error) throw response.error;
      if (!response.data?.success) throw new Error(response.data?.error || "Erro ao enviar evento");

      // Update fatura status
      const { error: updateError } = await supabase
        .from("faturas")
        .update({
          pixel_status: "evento_enviado",
          pixel_event_sent_at: new Date().toISOString(),
        })
        .eq("id", faturaId);

      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      setReviewDialogOpen(false);
      toast.success("Evento enviado para o Meta Pixel!");
    } catch (error: any) {
      console.error("Error sending pixel event:", error);
      toast.error(error.message || "Erro ao enviar evento para o Pixel");
    } finally {
      setSendingEvent(false);
    }
  };

  const getStatusConfig = () => {
    switch (status) {
      case "pendente":
        return {
          icon: Clock,
          label: "Aguardando dados",
          color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
          description: "Cliente precisa preencher o formulário",
        };
      case "formulario_enviado":
        return {
          icon: Send,
          label: "Formulário enviado",
          color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
          description: "Aguardando cliente preencher",
        };
      case "dados_completos":
        return {
          icon: CheckCircle,
          label: "Pronto para enviar",
          color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
          description: "Dados completos, pode enviar ao Pixel",
        };
      case "evento_enviado":
        return {
          icon: Megaphone,
          label: "Enviado ao Pixel",
          color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
          description: "Evento de conversão já foi enviado",
        };
      default:
        return {
          icon: AlertCircle,
          label: "Desconhecido",
          color: "bg-gray-100 text-gray-700",
          description: "Status desconhecido",
        };
    }
  };

  const formatGender = (genero?: string | null) => {
    if (!genero) return "—";
    const map: Record<string, string> = {
      masculino: "Masculino",
      feminino: "Feminino",
      outro: "Outro",
    };
    return map[genero.toLowerCase()] || genero;
  };

  const formatDate = (date?: string | null) => {
    if (!date) return "—";
    try {
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = String(d.getFullYear()).slice(-2);
      return `${day}/${month}/${year}`;
    } catch {
      return date;
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className={`${config.color} cursor-help`}>
              <Icon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{config.description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge className={config.color}>
            <Icon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </div>
        
        <div className="flex gap-2">
          {(status === "pendente" || status === "formulario_enviado") && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={status === "formulario_enviado" ? "outline" : "default"}
                    onClick={() => setSendFormDialogOpen(true)}
                    className="text-xs"
                  >
                    <Send className="h-3 w-3 mr-1" />
                    {status === "formulario_enviado" ? "Reenviar" : "Enviar formulário"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Enviar link do formulário via WhatsApp</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {status === "dados_completos" && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    onClick={openReviewDialog}
                    disabled={loadingLeadData}
                    className="text-xs"
                  >
                    {loadingLeadData ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Eye className="h-3 w-3 mr-1" />
                        Conferir e enviar
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Confira os dados antes de enviar ao Pixel</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Send Form Dialog */}
      <Dialog open={sendFormDialogOpen} onOpenChange={setSendFormDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Enviar Formulário
            </DialogTitle>
            <DialogDescription>
              Envie o link do formulário para o cliente preencher os dados necessários para o Pixel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Link do formulário:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-background p-2 rounded flex-1 overflow-hidden text-ellipsis">
                  {getFormUrl()}
                </code>
                <Button size="icon" variant="ghost" onClick={copyFormLink} className="h-8 w-8">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={openWhatsAppWithForm} disabled={sendingForm} className="w-full">
                {sendingForm ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <MessageSquare className="h-4 w-4 mr-2" />
                )}
                Enviar via WhatsApp
              </Button>
              
              <Button variant="outline" onClick={() => window.open(getFormUrl(), "_blank")} className="w-full">
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir formulário
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={(open) => {
        setReviewDialogOpen(open);
        if (!open) {
          setIsEditing(false);
          setEditData(null);
        }
      }}>
        <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              {isEditing ? "Editar dados" : "Conferir dados antes de enviar"}
            </DialogTitle>
            <DialogDescription>
              {isEditing 
                ? "Edite os dados do cliente que serão enviados ao Pixel."
                : "Estes dados serão enviados para o Meta Pixel como evento de compra (Purchase)."
              }
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-2">
            {isEditing && editData ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-nome">Nome</Label>
                  <Input
                    id="edit-nome"
                    value={editData.nome || ""}
                    onChange={(e) => setEditData({ ...editData, nome: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-email">E-mail</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editData.email || ""}
                    onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="edit-genero">Gênero</Label>
                    <Select
                      value={editData.genero || ""}
                      onValueChange={(value) => setEditData({ ...editData, genero: value })}
                    >
                      <SelectTrigger id="edit-genero" className="h-10">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="masculino">Masculino</SelectItem>
                        <SelectItem value="feminino">Feminino</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-nascimento">Nascimento</Label>
                    <Input
                      id="edit-nascimento"
                      inputMode="numeric"
                      placeholder="dd/mm/aa"
                      className="h-10"
                      value={dobText}
                      onChange={(e) => setDobText(e.target.value)}
                      maxLength={8}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-endereco">Endereço</Label>
                  <Input
                    id="edit-endereco"
                    value={editData.endereco || ""}
                    onChange={(e) => setEditData({ ...editData, endereco: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="edit-cidade">Cidade</Label>
                    <Input
                      id="edit-cidade"
                      value={editData.cidade || ""}
                      onChange={(e) => setEditData({ ...editData, cidade: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-estado">Estado</Label>
                    <Input
                      id="edit-estado"
                      value={editData.estado || ""}
                      onChange={(e) => setEditData({ ...editData, estado: e.target.value })}
                      maxLength={2}
                      placeholder="UF"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-cep">CEP</Label>
                  <Input
                    id="edit-cep"
                    value={editData.cep || ""}
                    onChange={(e) => setEditData({ ...editData, cep: e.target.value })}
                    placeholder="00000-000"
                  />
                </div>
              </div>
            ) : leadData && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-2.5 bg-muted/50 rounded-lg">
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Nome</p>
                    <p className="font-medium text-sm">{leadData.nome || "—"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-2.5 bg-muted/50 rounded-lg">
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <p className="font-medium text-sm">{leadData.telefone ? formatPhoneDisplay(leadData.telefone) : "—"}</p>
                  </div>
                </div>

                {leadData.email && (
                  <div className="flex items-center gap-3 p-2.5 bg-muted/50 rounded-lg">
                    <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">E-mail</p>
                      <p className="font-medium text-sm">{leadData.email}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg">
                    <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">Gênero</p>
                      <p className="font-medium text-sm">{formatGender(leadData.genero)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg">
                    <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">Nascimento</p>
                      <p className="font-medium text-sm">{formatDate(leadData.data_nascimento)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 bg-muted/50 rounded-lg">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Endereço</p>
                    <p className="font-medium text-sm">
                      {leadData.endereco || leadData.cidade || leadData.estado || leadData.cep ? (
                        <>
                          {leadData.endereco && <span className="block">{leadData.endereco}</span>}
                          {(leadData.cidade || leadData.estado) && (
                            <span className="block">{[leadData.cidade, leadData.estado].filter(Boolean).join(" - ")}</span>
                          )}
                          {leadData.cep && <span>CEP: {leadData.cep}</span>}
                        </>
                      ) : "—"}
                    </p>
                  </div>
                </div>

                {(!leadData.genero || !leadData.data_nascimento || !leadData.cep) && (
                  <div className="p-2.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-xs text-yellow-700 dark:text-yellow-400">
                      ⚠️ Alguns campos estão vazios. O evento será enviado com os dados disponíveis.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 gap-2 pt-4 border-t">
            {isEditing ? (
              <div className="flex gap-2 w-full">
                <Button 
                  variant="outline" 
                  onClick={cancelEditing}
                  className="flex-1"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
                <Button
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="flex-1"
                >
                  {savingEdit ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 w-full">
                <Button 
                  variant="outline" 
                  onClick={startEditing}
                  className="flex-1"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </Button>
                <Button
                  onClick={sendPixelEvent}
                  disabled={sendingEvent}
                  className="flex-1"
                >
                  {sendingEvent ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Megaphone className="h-4 w-4 mr-2" />
                  )}
                  Enviar ao Pixel
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}