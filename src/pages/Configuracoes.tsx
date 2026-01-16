import { Settings } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import Procedimentos from "./Procedimentos";
import Profissionais from "./Profissionais";
import MensagensPredefinidas from "./MensagensPredefinidas";
import Escala from "./Escala";
import VinculosProcedimentos from "./VinculosProcedimentos";
import Produtos from "./Produtos";
import Conexoes from "./Conexoes";
import TiposAgendamento from "./TiposAgendamento";
import { ResetDataConfig } from "@/components/configuracoes/ResetDataConfig";
import { useTabPersistence } from "@/hooks/useTabPersistence";

const tabOptions = [
  { value: "procedimentos", label: "Procedimentos" },
  { value: "profissionais", label: "Profissionais" },
  { value: "vinculos", label: "Vínculos" },
  { value: "escala", label: "Escala" },
  { value: "tipos", label: "Tipos" },
  { value: "produtos", label: "Produtos" },
  { value: "mensagens", label: "Mensagens" },
  { value: "conexoes", label: "Conexões" },
  { value: "reset", label: "Reset" },
];

export default function Configuracoes() {
  const [activeTab, setActiveTab] = useTabPersistence("tab", "procedimentos");
  const isMobile = useIsMobile();
  const isTablet = typeof window !== 'undefined' && window.innerWidth < 1024 && window.innerWidth >= 768;
  const useDropdown = isMobile || isTablet;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Settings className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Configurações</h1>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {useDropdown ? (
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione uma opção" />
            </SelectTrigger>
            <SelectContent>
              {tabOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <TabsList className="h-8">
            {tabOptions.map((option) => (
              <TabsTrigger key={option.value} value={option.value} className="gap-1.5 text-xs px-3 h-7">
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        
        <TabsContent value="procedimentos">
          <Procedimentos />
        </TabsContent>
        
        <TabsContent value="profissionais">
          <Profissionais />
        </TabsContent>
        
        <TabsContent value="vinculos">
          <VinculosProcedimentos />
        </TabsContent>
        
        <TabsContent value="escala">
          <Escala />
        </TabsContent>

        <TabsContent value="tipos">
          <TiposAgendamento />
        </TabsContent>
        
        <TabsContent value="produtos">
          <Produtos />
        </TabsContent>
        
        <TabsContent value="mensagens">
          <MensagensPredefinidas />
        </TabsContent>

        <TabsContent value="conexoes">
          <Conexoes />
        </TabsContent>

        <TabsContent value="reset">
          <ResetDataConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}
