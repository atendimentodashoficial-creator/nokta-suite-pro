import { Calendar, DollarSign, TrendingUp, Settings, UserCog, FileText, LogOut, MessageSquare, UserX, Handshake, UserPlus, Users, ChevronLeft, ChevronRight, Send, Database, Instagram, Wallet, ClipboardList, Video } from "lucide-react";
import { MetaIcon } from "@/components/icons/MetaIcon";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import noktaLogoDefault from "@/assets/nokta-logo.png";
import googleAdsIcon from "@/assets/google-ads-icon.png";
import { createContext, useContext } from "react";
import { AdminClientSwitcher } from "./AdminClientSwitcher";
import { useUserFeatureAccess } from "@/hooks/useUserFeatureAccess";

// Mapeamento de href para feature_key
const hrefToFeatureKey: Record<string, string> = {
  "/": "calendario",
  "/nao-compareceu": "nao-compareceu",
  "/leads": "leads",
  "/clientes": "clientes",
  "/em-negociacao": "negociacao",
  "/faturas": "faturas",
  "/despesas": "despesas",
  "/relatorios": "relatorios",
  "/whatsapp": "whatsapp",
  "/disparos": "disparos",
  "/extrator": "extrator",
  "/instagram": "instagram",
  "/formularios": "formularios",
  "/reunioes": "reunioes",
  "/metricas-campanhas": "meta-ads",
  "/google-ads": "google-ads",
  "/configuracoes": "configuracoes",
};

export const navigation = [
  { name: "Calendário", href: "/", icon: Calendar },
  { name: "Não Compareceu", href: "/nao-compareceu", icon: UserX },
  { name: "Leads", href: "/leads", icon: UserPlus, separator: true },
  { name: "Clientes", href: "/clientes", icon: Users },
  { name: "Negociação", href: "/em-negociacao", icon: Handshake },
  { name: "Faturas", href: "/faturas", icon: FileText },
  { name: "Despesas", href: "/despesas", icon: Wallet },
  { name: "Relatórios", href: "/relatorios", icon: TrendingUp },
  { name: "WhatsApp", href: "/whatsapp", icon: MessageSquare, separator: true },
  { name: "Disparos", href: "/disparos", icon: Send },
  { name: "Extrator", href: "/extrator", icon: Database },
  { name: "Instagram", href: "/instagram", icon: Instagram },
  { name: "Formulários", href: "/formularios", icon: ClipboardList },
  { name: "Reuniões", href: "/reunioes", icon: Video },
  { name: "Meta Ads", href: "/metricas-campanhas", icon: MetaIcon },
  { name: "Google Ads", href: "/google-ads", icon: ({ className }: { className?: string }) => <img src={googleAdsIcon} alt="Google Ads" className={cn("h-5 w-5 shrink-0 brightness-0 invert", className)} /> },
  { name: "Configurações", href: "/configuracoes", icon: Settings },
];

// Context para compartilhar o estado do sidebar
const SidebarContext = createContext<{
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}>({
  collapsed: false,
  setCollapsed: () => {},
});

export const useSidebarCollapse = () => useContext(SidebarContext);

interface SidebarContentProps {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const SidebarContent = ({ onNavigate, collapsed = false, onToggleCollapse }: SidebarContentProps) => {
  const { user, signOut } = useAuth();
  const { isFeatureEnabled } = useUserFeatureAccess();

  // Filtrar navegação baseado nas permissões do usuário
  const filteredNavigation = navigation.filter(item => {
    const featureKey = hrefToFeatureKey[item.href];
    return featureKey ? isFeatureEnabled(featureKey) : true;
  });

  const handleLogout = async () => {
    await signOut();
    onNavigate?.();
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Logo / Expand Button */}
        <div className={cn(
          "flex items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-2 py-4" : "justify-center px-6 py-4"
        )}>
          {collapsed && onToggleCollapse ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleCollapse}
                  className="text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Expandir menu
              </TooltipContent>
            </Tooltip>
          ) : (
            <img 
              src={noktaLogoDefault} 
              alt="Logo" 
              className="h-8 w-auto object-contain transition-all brightness-0 invert"
            />
        )}
        </div>

        {/* Admin Client Switcher - só aparece quando admin está logado como cliente */}
        <AdminClientSwitcher collapsed={collapsed} />

        {/* Navigation */}
        <nav className={cn(
          "flex-1 overflow-y-auto flex flex-col",
          collapsed ? "py-4 gap-6 items-center" : "px-3 py-4 space-y-1"
        )}>
          {filteredNavigation.map((item) => (
            <div key={item.name}>
              {/* Separator only when expanded */}
              {item.separator && !collapsed && <div className="my-2 border-t border-sidebar-border" />}
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={item.href}
                      end={item.href === "/"}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center justify-center h-10 w-10 rounded-lg text-sm font-medium transition-all",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-card"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                        )
                      }
                    >
                      {({ isActive }) => (
                        <item.icon className={cn("h-5 w-5", isActive && "text-sidebar-primary")} />
                      )}
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    {item.name}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <NavLink
                  to={item.href}
                  end={item.href === "/"}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-card"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className={cn("h-5 w-5", isActive && "text-sidebar-primary")} />
                      <span>{item.name}</span>
                    </>
                  )}
                </NavLink>
              )}
            </div>
          ))}
        </nav>

        {/* Collapse Toggle Button (Desktop only - only shown when expanded) */}
        {onToggleCollapse && !collapsed && (
          <div className="px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              className="w-full justify-center gap-2 text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Recolher menu</span>
            </Button>
          </div>
        )}

        {/* User Info */}
        <div className={cn(
          "border-t border-sidebar-border space-y-2",
          collapsed ? "p-2" : "p-4"
        )}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center py-2">
                  <div className="h-8 w-8 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground text-sm font-medium cursor-default">
                    {user?.user_metadata?.full_name?.charAt(0).toUpperCase() || 
                     user?.email?.charAt(0).toUpperCase() || "U"}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">
                <p>{user?.user_metadata?.full_name || user?.email}</p>
                <p className="text-xs text-muted-foreground">Plano Premium</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="h-8 w-8 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground text-sm font-medium">
                {user?.user_metadata?.full_name?.charAt(0).toUpperCase() || 
                 user?.email?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {user?.user_metadata?.full_name || user?.email}
                </p>
                <p className="text-xs text-sidebar-foreground/60 truncate">Plano Premium</p>
              </div>
            </div>
          )}
          
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleLogout}
                  className="w-full border-sidebar-border hover:bg-sidebar-accent"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Sair do sistema
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="w-full justify-start gap-2 border-sidebar-border hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" />
              Sair do sistema
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar = ({ collapsed = false, onToggleCollapse }: SidebarProps) => {
  return (
    <aside className={cn(
      "hidden md:flex fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border flex-col transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      <SidebarContent collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
    </aside>
  );
};
