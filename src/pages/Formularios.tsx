import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTabPersistence } from "@/hooks/useTabPersistence";
import FormulariosDashboard from "@/components/formularios/FormulariosDashboard";
import FormulariosLeads from "@/components/formularios/FormulariosLeads";
import FormulariosAbandonos from "@/components/formularios/FormulariosAbandonos";
import FormulariosTemplates from "@/components/formularios/FormulariosTemplates";
import FormulariosConfiguracoes from "@/components/formularios/FormulariosConfiguracoes";

const tabOptions = [
  { value: "dashboard", label: "Dashboard" },
  { value: "leads", label: "Leads" },
  { value: "abandonos", label: "Abandonos" },
  { value: "templates", label: "Templates" },
  { value: "configuracoes", label: "Configurações" },
];

export default function Formularios() {
  const [activeTab, setActiveTab] = useTabPersistence("formularios-tab", "dashboard");
  const isMobile = useIsMobile();
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);

  const useDropdown = isMobile || windowWidth < 768;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardList className="w-6 h-6" />
        <h1 className="text-2xl font-bold">Formulários</h1>
      </div>

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
          <TabsList className="h-8 mb-4">
            {tabOptions.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-xs px-3 h-7">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        <TabsContent value="dashboard">
          <FormulariosDashboard />
        </TabsContent>
        
        <TabsContent value="leads">
          <FormulariosLeads />
        </TabsContent>
        
        <TabsContent value="abandonos">
          <FormulariosAbandonos />
        </TabsContent>
        
        <TabsContent value="templates">
          <FormulariosTemplates />
        </TabsContent>
        
        <TabsContent value="configuracoes">
          <FormulariosConfiguracoes />
        </TabsContent>
      </Tabs>
    </div>
  );
}
