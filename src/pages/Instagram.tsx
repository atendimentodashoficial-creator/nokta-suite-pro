import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, BarChart3, FileText, Instagram as InstagramIcon } from "lucide-react";
import { InstagramGatilhosTab } from "@/components/instagram/InstagramGatilhosTab";
import { InstagramHistoricoTab } from "@/components/instagram/InstagramHistoricoTab";
import { InstagramFormulariosTab } from "@/components/instagram/InstagramFormulariosTab";

export default function Instagram() {
  const [activeTab, setActiveTab] = useState("gatilhos");

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
          <TabsList className="w-full flex overflow-x-auto gap-1 bg-muted/50 p-1 rounded-lg">
            <TabsTrigger value="gatilhos" className="flex-1 min-w-fit flex items-center justify-center gap-1.5 text-xs md:text-sm px-2 md:px-4">
              <Zap className="h-4 w-4" />
              <span>Gatilhos</span>
            </TabsTrigger>
            <TabsTrigger value="formularios" className="flex-1 min-w-fit flex items-center justify-center gap-1.5 text-xs md:text-sm px-2 md:px-4">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Formulários</span>
              <span className="sm:hidden">Forms</span>
            </TabsTrigger>
            <TabsTrigger value="historico" className="flex-1 min-w-fit flex items-center justify-center gap-1.5 text-xs md:text-sm px-2 md:px-4">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Histórico</span>
              <span className="sm:hidden">Hist.</span>
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
