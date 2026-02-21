import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, BarChart3, FileText, Instagram as InstagramIcon } from "lucide-react";
import { InstagramGatilhosTab } from "@/components/instagram/InstagramGatilhosTab";
import { InstagramHistoricoTab } from "@/components/instagram/InstagramHistoricoTab";
import { InstagramFormulariosTab } from "@/components/instagram/InstagramFormulariosTab";
import { useTabPersistence } from "@/hooks/useTabPersistence";

export default function Instagram() {
  const [activeTab, setActiveTab] = useTabPersistence("tab", "gatilhos");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <InstagramIcon className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Instagram</h1>
        </div>
      </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="h-8">
            <TabsTrigger value="gatilhos" className="gap-1.5 text-xs px-3 h-7">
              <Zap className="h-3.5 w-3.5" />
              Gatilhos
            </TabsTrigger>
            <TabsTrigger value="formularios" className="gap-1.5 text-xs px-3 h-7">
              <FileText className="h-3.5 w-3.5" />
              Formulários
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-1.5 text-xs px-3 h-7">
              <BarChart3 className="h-3.5 w-3.5" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="gatilhos">
            <InstagramGatilhosTab />
          </TabsContent>

          <TabsContent value="formularios">
            <InstagramFormulariosTab />
          </TabsContent>

          <TabsContent value="historico">
            <InstagramHistoricoTab />
          </TabsContent>
        </Tabs>
    </div>
  );
}
