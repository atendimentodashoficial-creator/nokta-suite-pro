import { useState } from "react";
import { FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTabPersistence } from "@/hooks/useTabPersistence";
import InstagramFormulariosDashboard from "./formularios/InstagramFormulariosDashboard";
import InstagramFormulariosLeads from "./formularios/InstagramFormulariosLeads";
import InstagramFormulariosAbandonos from "./formularios/InstagramFormulariosAbandonos";
import InstagramFormulariosTemplates from "./formularios/InstagramFormulariosTemplates";
import InstagramFormulariosConfiguracoes from "./formularios/InstagramFormulariosConfiguracoes";

const tabOptions = [
  { value: "dashboard", label: "Dashboard" },
  { value: "leads", label: "Leads" },
  { value: "abandonos", label: "Abandonos" },
  { value: "templates", label: "Templates" },
  { value: "configuracoes", label: "Configurações" },
];

export function InstagramFormulariosTab() {
  const [activeTab, setActiveTab] = useTabPersistence("instagram-formularios-tab", "dashboard");
  const isMobile = useIsMobile();
  const [windowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);

  const useDropdown = isMobile || windowWidth < 768;

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {useDropdown ? (
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full mb-4">
              <SelectValue placeholder="Selecione uma aba" />
            </SelectTrigger>
            <SelectContent>
              {tabOptions.map((tab) => (
                <SelectItem key={tab.value} value={tab.value}>
                  {tab.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <TabsList className="mb-4">
            {tabOptions.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        <TabsContent value="dashboard">
          <InstagramFormulariosDashboard />
        </TabsContent>
        
        <TabsContent value="leads">
          <InstagramFormulariosLeads />
        </TabsContent>
        
        <TabsContent value="abandonos">
          <InstagramFormulariosAbandonos />
        </TabsContent>
        
        <TabsContent value="templates">
          <InstagramFormulariosTemplates />
        </TabsContent>
        
        <TabsContent value="configuracoes">
          <InstagramFormulariosConfiguracoes />
        </TabsContent>
      </Tabs>
    </div>
  );
}
