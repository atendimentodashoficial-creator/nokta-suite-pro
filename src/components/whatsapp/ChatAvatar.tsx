import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { getInitials, normalizePhoneNumber, getLast8Digits } from "@/utils/whatsapp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User } from "lucide-react";

interface ChatAvatarProps {
  chat: {
    contact_name: string;
    contact_number: string;
  };
  size?: "sm" | "md" | "lg";
  showProfileOption?: boolean;
}

export const ChatAvatar = ({ chat, size = "md", showProfileOption = true }: ChatAvatarProps) => {
  const navigate = useNavigate();
  const [leadStatus, setLeadStatus] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);

  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-12 h-12 text-xs",
    lg: "w-10 h-10"
  };

  const loadLeadStatus = async () => {
    try {
      const last8Digits = getLast8Digits(chat.contact_number);
      
      // Buscar todos os leads para comparar pelos últimos 8 dígitos
      const { data: allLeads } = await supabase
        .from('leads')
        .select('id, status, telefone')
        .is('deleted_at', null);
      
      // Encontrar TODOS os leads com os mesmos últimos 8 dígitos
      const matchingLeads = allLeads?.filter(l => getLast8Digits(l.telefone) === last8Digits) || [];
      
      if (matchingLeads.length > 0) {
        // Priorizar o lead com status "cliente" se existir
        const clienteLead = matchingLeads.find(l => l.status === 'cliente');
        const bestLead = clienteLead || matchingLeads[0];
        
        setLeadId(bestLead.id);
        
        // Use the best lead's status (prioritize "cliente")
        // This ensures consistency with what's visible in the Clientes page
        setLeadStatus(bestLead.status);
      } else {
        setLeadId(null);
        setLeadStatus(null);
      }
    } catch (error: any) {
      console.error('Error loading lead status:', error);
    }
  };

  useEffect(() => {
    loadLeadStatus();
  }, [chat.contact_number]);

  // Realtime: escutar mudanças na tabela leads
  useEffect(() => {
    const normalized = normalizePhoneNumber(chat.contact_number);
    
    const leadsChannel = supabase
      .channel(`leads-changes-${normalized}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `telefone=eq.${normalized}`
        },
        () => {
          loadLeadStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
    };
  }, [chat.contact_number]);

  // Realtime: escutar criação/atualização de agendamentos para este lead
  useEffect(() => {
    if (!leadId) return;

    const agendamentosChannel = supabase
      .channel(`agendamentos-${leadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agendamentos',
          filter: `cliente_id=eq.${leadId}`
        },
        () => {
          // Reload lead status when agendamentos change
          loadLeadStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(agendamentosChannel);
    };
  }, [leadId]);

  const getAvatarColor = () => {
    if (leadStatus === "follow_up") return "bg-yellow-300";
    if (leadStatus === "sem_interesse") return "bg-red-400";
    if (leadStatus === "cliente") return "bg-green-400";
    return "bg-muted";
  };

  const handleOpenProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (leadId && leadStatus === "cliente") {
      navigate(`/clientes/${leadId}`);
    }
  };

  const avatarElement = (
    <Avatar className={`${sizeClasses[size]} ${showProfileOption && leadId && leadStatus === "cliente" ? "cursor-pointer hover:ring-2 hover:ring-primary transition-all" : ""}`}>
      <AvatarFallback className={getAvatarColor()}>
        {getInitials(chat.contact_name)}
      </AvatarFallback>
    </Avatar>
  );

  // Show dropdown only for clients
  if (showProfileOption && leadId && leadStatus === "cliente") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          {avatarElement}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onClick={handleOpenProfile}>
            <User className="w-4 h-4 mr-2" />
            Ver perfil do cliente
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return avatarElement;
};
