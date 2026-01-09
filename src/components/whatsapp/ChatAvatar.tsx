import { useState, useEffect } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { getInitials, normalizePhoneNumber, getLast8Digits } from "@/utils/whatsapp";

interface ChatAvatarProps {
  chat: {
    contact_name: string;
    contact_number: string;
  };
  size?: "sm" | "md" | "lg";
}

export const ChatAvatar = ({ chat, size = "md" }: ChatAvatarProps) => {
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
      
      // Encontrar lead pelos últimos 8 dígitos
      const lead = allLeads?.find(l => getLast8Digits(l.telefone) === last8Digits);
      
      if (lead) {
        setLeadId(lead.id);
        
        // Verificar se o lead tem algum agendamento
        const { data: agendamentos } = await supabase
          .from('agendamentos')
          .select('id')
          .eq('cliente_id', lead.id)
          .limit(1);
        
        // Se tem agendamento, considerar como cliente
        if (agendamentos && agendamentos.length > 0) {
          setLeadStatus('cliente');
        } else {
          setLeadStatus(lead.status);
        }
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

  // Realtime: escutar criação de agendamentos para este lead
  useEffect(() => {
    if (!leadId) return;

    const agendamentosChannel = supabase
      .channel(`agendamentos-${leadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agendamentos',
          filter: `cliente_id=eq.${leadId}`
        },
        () => {
          // Quando um agendamento é criado, atualizar para cliente
          setLeadStatus('cliente');
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

  return (
    <Avatar className={sizeClasses[size]}>
      <AvatarFallback className={getAvatarColor()}>
        {getInitials(chat.contact_name)}
      </AvatarFallback>
    </Avatar>
  );
};
