import { useNavigate, useLocation } from "react-router-dom";
import { ChevronDown, Users, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AdminUser {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string;
    display_order?: number;
  };
}

interface AdminClientSwitcherProps {
  collapsed?: boolean;
}

export const AdminClientSwitcher = ({ collapsed = false }: AdminClientSwitcherProps) => {
  const { user, isAdmin, adminUsers } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const currentUserEmail = user?.email || "";
  
  // Sort users by display_order from user_metadata (same order as admin panel)
  const users = [...((adminUsers as AdminUser[]) || [])].sort((a, b) => {
    const orderA = a.user_metadata?.display_order ?? 9999;
    const orderB = b.user_metadata?.display_order ?? 9999;
    return orderA - orderB;
  });

  const handleSwitchToUser = async (userEmail: string) => {
    if (userEmail === currentUserEmail) return;
    
    try {
      const adminToken = localStorage.getItem('admin_token');
      // Salvar a rota atual para redirecionar após o login
      const currentPath = location.pathname + location.search;
      
      const { data, error } = await supabase.functions.invoke('admin-manage-users', {
        body: {
          action: 'generate_link',
          email: userEmail,
          redirectTo: currentPath
        },
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });

      if (error) throw error;

      if (data?.link) {
        // Redirecionar na mesma aba para manter o contexto
        window.location.href = data.link;
        toast.success(`Alternando para ${userEmail}...`);
      } else {
        toast.error('Não foi possível gerar o link de acesso');
      }
    } catch (error: any) {
      console.error('Erro ao alternar usuário:', error);
      toast.error('Erro ao alternar usuário');
    }
  };

  const handleBackToAdmin = () => {
    // Limpar sessão do cliente e voltar ao painel admin
    supabase.auth.signOut({ scope: "local" }).then(() => {
      navigate('/admin/login');
    });
  };

  // Não mostrar se não for admin
  if (!isAdmin || users.length === 0) {
    return null;
  }

  const currentUser = users.find(u => u.email === currentUserEmail);
  const displayName = currentUser?.user_metadata?.full_name || currentUser?.email || currentUserEmail;

  if (collapsed) {
    return (
      <div className="px-2 py-2 flex justify-center border-b border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-10 h-10 text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <Users className="h-7 w-7 text-amber-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            side="bottom" 
            align="center"
            className="w-64 bg-popover border border-border z-50"
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Modo Admin - Alternar Cliente
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ScrollArea className="h-[300px]">
              {users.map((u) => (
                <DropdownMenuItem
                  key={u.id}
                  onClick={() => handleSwitchToUser(u.email)}
                  className={cn(
                    "cursor-pointer",
                    u.email === currentUserEmail && "bg-accent"
                  )}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium truncate">
                      {u.user_metadata?.full_name || u.email}
                    </span>
                    {u.user_metadata?.full_name && (
                      <span className="text-xs text-muted-foreground truncate">
                        {u.email}
                      </span>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </ScrollArea>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleBackToAdmin} className="text-amber-500">
              <ExternalLink className="h-4 w-4 mr-2" />
              Voltar ao Painel Admin
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className={cn(
      "border-b border-sidebar-border",
      collapsed ? "px-2 py-2 flex justify-center" : "px-3 py-2"
    )}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between gap-2 px-3 py-2.5 h-auto text-left text-sidebar-foreground hover:bg-sidebar-accent border border-amber-500/30 bg-amber-500/10"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Users className="h-4 w-4 shrink-0 text-amber-500" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-amber-500 font-medium">Modo Admin</span>
                <span className="text-sm truncate">{displayName}</span>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-amber-500" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          side="bottom" 
          align="start"
          className="w-64 bg-popover border border-border z-50"
        >
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Alternar para outro cliente
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <ScrollArea className="h-[300px]">
            {users.map((u) => (
              <DropdownMenuItem
                key={u.id}
                onClick={() => handleSwitchToUser(u.email)}
                className={cn(
                  "cursor-pointer",
                  u.email === currentUserEmail && "bg-accent"
                )}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">
                    {u.user_metadata?.full_name || u.email}
                  </span>
                  {u.user_metadata?.full_name && (
                    <span className="text-xs text-muted-foreground truncate">
                      {u.email}
                    </span>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleBackToAdmin} className="text-amber-500">
            <ExternalLink className="h-4 w-4 mr-2" />
            Voltar ao Painel Admin
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
