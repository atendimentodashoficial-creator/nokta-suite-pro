import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, TrendingUp } from "lucide-react";
import { useSendConversionEvent, useMetaPixelConfig } from "@/hooks/useMetaPixel";
import { MetaIcon } from "@/components/icons/MetaIcon";
import { Badge } from "@/components/ui/badge";

interface EnviarConversaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: string;
  faturaId?: string;
  agendamentoId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  utmSource?: string;
  utmCampaign?: string;
  fbclid?: string;
  defaultValue?: number;
  defaultEventType?: "Lead" | "InitiateCheckout" | "Purchase" | "CompleteRegistration";
}

export function EnviarConversaoDialog({
  open,
  onOpenChange,
  leadId,
  faturaId,
  agendamentoId,
  customerName,
  customerPhone,
  customerEmail,
  utmSource,
  utmCampaign,
  fbclid,
  defaultValue,
  defaultEventType,
}: EnviarConversaoDialogProps) {
  const { data: pixelConfig } = useMetaPixelConfig();
  const sendConversion = useSendConversionEvent();

  const [eventType, setEventType] = useState<string>(defaultEventType || "Purchase");
  const [value, setValue] = useState<string>(defaultValue?.toString() || "");

  const handleSend = async () => {
    await sendConversion.mutateAsync({
      event_name: eventType as "Lead" | "InitiateCheckout" | "Purchase" | "CompleteRegistration",
      lead_id: leadId,
      fatura_id: faturaId,
      agendamento_id: agendamentoId,
      value: value ? parseFloat(value) : undefined,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      utm_source: utmSource,
      utm_campaign: utmCampaign,
      fbclid: fbclid,
      external_id: leadId,
    });

    onOpenChange(false);
  };

  if (!pixelConfig) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MetaIcon className="h-5 w-5" />
              Enviar Conversão
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center">
            <p className="text-muted-foreground">
              Configure o Meta Pixel nas configurações para enviar conversões.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MetaIcon className="h-5 w-5 text-blue-600" />
            Enviar Conversão para Meta
          </DialogTitle>
          <DialogDescription>
            Envie este evento para o Meta Pixel via Conversions API
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Informações de atribuição */}
          {(utmCampaign || utmSource || fbclid) && (
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Dados de Atribuição
              </p>
              <div className="flex flex-wrap gap-2">
                {utmCampaign && (
                  <Badge variant="secondary">Campanha: {utmCampaign}</Badge>
                )}
                {utmSource && (
                  <Badge variant="secondary">Origem: {utmSource}</Badge>
                )}
                {fbclid && (
                  <Badge variant="outline">FBCLID presente</Badge>
                )}
              </div>
            </div>
          )}

          {/* Tipo de evento */}
          <div className="space-y-2">
            <Label>Tipo de Evento</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Lead">Lead - Novo contato</SelectItem>
                <SelectItem value="CompleteRegistration">CompleteRegistration - Agendamento confirmado</SelectItem>
                <SelectItem value="Purchase">Purchase - Venda fechada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Valor */}
          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Opcional. Útil para calcular ROAS no Meta Ads
            </p>
          </div>

          {/* Cliente */}
          {customerName && (
            <div className="p-3 border rounded-lg">
              <p className="text-sm text-muted-foreground">Cliente</p>
              <p className="font-medium">{customerName}</p>
              {customerPhone && (
                <p className="text-sm text-muted-foreground">{customerPhone}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sendConversion.isPending}>
            {sendConversion.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Enviar Conversão
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
