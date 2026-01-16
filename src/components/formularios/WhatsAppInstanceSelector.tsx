import { useState, useEffect } from "react";
import { MessageCircle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Instance {
  id: string;
  nome: string;
  hasChat: boolean;
}

interface WhatsAppInstanceSelectorProps {
  telefone: string;
  className?: string;
}

export default function WhatsAppInstanceSelector({ telefone, className }: WhatsAppInstanceSelectorProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [instances, setInstances] = useState<Instance[]>([]);

  useEffect(() => {
    if (open && user) {
      fetchInstances();
    }
  }, [open, user]);

  const fetchInstances = async () => {
    if (!user || !telefone) return;
    
    setLoading(true);
    try {
      // Fetch all active instances
      const { data: instancias } = await supabase
        .from("disparos_instancias")
        .select("id, nome")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("nome");

      if (!instancias || instancias.length === 0) {
        setInstances([]);
        setLoading(false);
        return;
      }

      // Normalize phone to check for existing chats
      const phoneDigits = telefone.replace(/\D/g, "");
      const last8 = phoneDigits.slice(-8);

      // Check for existing chats with this phone number
      const { data: chats } = await supabase
        .from("disparos_chats")
        .select("instancia_id, normalized_number")
        .eq("user_id", user.id)
        .is("deleted_at", null);

      // Create a set of instance IDs that have chats with this number
      const instancesWithChat = new Set<string>();
      chats?.forEach(chat => {
        const chatLast8 = chat.normalized_number?.slice(-8);
        if (chatLast8 === last8 && chat.instancia_id) {
          instancesWithChat.add(chat.instancia_id);
        }
      });

      // Build final instances list
      const instanceList: Instance[] = instancias.map(inst => ({
        id: inst.id,
        nome: inst.nome,
        hasChat: instancesWithChat.has(inst.id),
      }));

      // Sort: instances with chat first
      instanceList.sort((a, b) => {
        if (a.hasChat && !b.hasChat) return -1;
        if (!a.hasChat && b.hasChat) return 1;
        return a.nome.localeCompare(b.nome);
      });

      setInstances(instanceList);
    } catch (error) {
      console.error("Error fetching instances:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChat = (instanceId: string) => {
    const phoneDigits = telefone.replace(/\D/g, "");
    // Navigate to disparos page with the instance and phone
    window.open(`/disparos?instancia=${instanceId}&telefone=${phoneDigits}`, "_blank");
    setOpen(false);
  };

  const handleOpenWhatsAppWeb = () => {
    const phoneDigits = telefone.replace(/\D/g, "");
    window.open(`https://wa.me/${phoneDigits}`, "_blank");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("text-green-600 hover:text-green-700", className)}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground px-2 py-1 font-medium">
            Abrir conversa via:
          </p>
          
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : instances.length === 0 ? (
            <>
              <Button
                variant="ghost"
                className="w-full justify-start text-sm"
                onClick={handleOpenWhatsAppWeb}
              >
                <MessageCircle className="h-4 w-4 mr-2 text-green-600" />
                WhatsApp Web
              </Button>
              <p className="text-xs text-muted-foreground px-2 py-1">
                Nenhuma instância configurada
              </p>
            </>
          ) : (
            <>
              {instances.map((instance) => (
                <Button
                  key={instance.id}
                  variant="ghost"
                  className={cn(
                    "w-full justify-start text-sm",
                    instance.hasChat && "bg-green-500/10 border border-green-500/30"
                  )}
                  onClick={() => handleOpenChat(instance.id)}
                >
                  <MessageCircle className={cn(
                    "h-4 w-4 mr-2",
                    instance.hasChat ? "text-green-600" : "text-muted-foreground"
                  )} />
                  <span className="flex-1 text-left truncate">{instance.nome}</span>
                  {instance.hasChat && (
                    <Check className="h-3 w-3 text-green-600 ml-1" />
                  )}
                </Button>
              ))}
              <div className="border-t my-1" />
              <Button
                variant="ghost"
                className="w-full justify-start text-sm text-muted-foreground"
                onClick={handleOpenWhatsAppWeb}
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp Web (externo)
              </Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
