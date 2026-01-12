import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sidebar, SidebarContent } from "@/components/layout/Sidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { usePersonalizacaoContext } from "@/contexts/PersonalizacaoContext";
import { useDisparosCampaignScheduler } from "@/hooks/useDisparosCampaignScheduler";
import { cn } from "@/lib/utils";
import noktaLogoDefault from "@/assets/nokta-logo.png";

export default function Layout() {
  useDisparosCampaignScheduler();

  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { logoUrl, config } = usePersonalizacaoContext();
  const isCustomLogo = config?.logo_url;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
      
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-sidebar border-b border-sidebar-border flex items-center px-4 z-50">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden text-sidebar-foreground hover:bg-sidebar-accent">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border">
            <SidebarContent onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <img 
          src={logoUrl} 
          alt="Logo" 
          className={`h-7 w-auto object-contain ml-3 ${!isCustomLogo ? 'brightness-0 invert' : ''}`}
        />
      </div>

      <div className={cn(
        "pt-16 md:pt-0 transition-all duration-300",
        collapsed ? "md:pl-16" : "md:pl-64"
      )}>
        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}