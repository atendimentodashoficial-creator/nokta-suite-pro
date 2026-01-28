import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useGoogleCalendarStatus() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["google-calendar-status", user?.id],
    queryFn: async () => {
      if (!user?.id) return { isConnected: false };
      
      const { data, error } = await supabase
        .from("google_calendar_config")
        .select("access_token, refresh_token, token_expires_at")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (error || !data) {
        return { isConnected: false };
      }
      
      // Check if tokens exist
      const isConnected = !!(data.access_token && data.refresh_token);
      
      return { isConnected };
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
