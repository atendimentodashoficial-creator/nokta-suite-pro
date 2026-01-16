import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sidebar, SidebarContent } from "@/components/layout/Sidebar";
import { AdminClientSwitcher } from "@/components/layout/AdminClientSwitcher";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useDisparosCampaignScheduler } from "@/hooks/useDisparosCampaignScheduler";
import { cn } from "@/lib/utils";
import noktaLogoDefault from "@/assets/nokta-logo.png";

export default function Layout() {
  useDisparosCampaignScheduler();

  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

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
          <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border flex flex-col h-full overflow-hidden">
            <div className="flex flex-col h-full overflow-hidden">
              <SidebarContent onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <img 
          src={noktaLogoDefault} 
          alt="Logo" 
          className="h-7 w-auto object-contain ml-3 brightness-0 invert"
        />
        {/* Admin Client Switcher for Mobile */}
        <div className="ml-auto">
          <AdminClientSwitcher collapsed={true} />
        </div>
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