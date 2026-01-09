import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Zap, MessageSquare, BarChart3, FileText } from "lucide-react";
import { InstagramConfigTab } from "@/components/instagram/InstagramConfigTab";
import { InstagramGatilhosTab } from "@/components/instagram/InstagramGatilhosTab";
import { InstagramFluxosTab } from "@/components/instagram/InstagramFluxosTab";
import { InstagramHistoricoTab } from "@/components/instagram/InstagramHistoricoTab";
import { InstagramFormulariosTab } from "@/components/instagram/InstagramFormulariosTab";

export default function Instagram() {
  const [activeTab, setActiveTab] = useState("config");

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Automação Instagram</h1>
          <p className="text-muted-foreground">
            Configure respostas automáticas para DMs e comentários do Instagram
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full max-w-3xl grid-cols-5">
            <TabsTrigger value="config" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuração
            </TabsTrigger>
            <TabsTrigger value="gatilhos" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Gatilhos
            </TabsTrigger>
            <TabsTrigger value="formularios" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Formulários
            </TabsTrigger>
            <TabsTrigger value="fluxos" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Fluxos
            </TabsTrigger>
            <TabsTrigger value="historico" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config">
            <InstagramConfigTab />
          </TabsContent>

          <TabsContent value="gatilhos">
            <InstagramGatilhosTab />
          </TabsContent>

          <TabsContent value="formularios">
            <InstagramFormulariosTab />
          </TabsContent>

          <TabsContent value="fluxos">
            <InstagramFluxosTab />
          </TabsContent>

          <TabsContent value="historico">
            <InstagramHistoricoTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
