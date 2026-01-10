import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { PersonalizacaoProvider } from "@/contexts/PersonalizacaoContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Layout from "./pages/Layout";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Clientes from "./pages/Clientes";
import ClienteDetalhes from "./pages/ClienteDetalhes";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Agenda from "./pages/Agenda";
import Configuracoes from "./pages/Configuracoes";
import Faturas from "./pages/Faturas";
import EmNegociacao from "./pages/EmNegociacao";
import AdminWhatsApp from "./pages/AdminWhatsApp";
import NaoCompareceu from "./pages/NaoCompareceu";
import MetricasCampanhas from "./pages/MetricasCampanhas";
import GoogleAdsMetrics from "./pages/GoogleAdsMetrics";
import Disparos from "./pages/Disparos";
import Extrator from "./pages/Extrator";
import Instagram from "./pages/Instagram";
import FormularioCaptura from "./pages/FormularioCaptura";
import FormularioConversao from "./pages/FormularioConversao";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <PersonalizacaoProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/f/:formId" element={<FormularioCaptura />} />
            <Route path="/conversao/:faturaId" element={<FormularioConversao />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Agenda />} />
              <Route path="nao-compareceu" element={<NaoCompareceu />} />
              <Route path="relatorios" element={<Dashboard />} />
              <Route path="leads" element={<Leads />} />
              <Route path="clientes" element={<Clientes />} />
              <Route path="clientes/:id" element={<ClienteDetalhes />} />
              <Route path="em-negociacao" element={<EmNegociacao />} />
              <Route path="faturas" element={<Faturas />} />
              <Route path="whatsapp" element={<AdminWhatsApp />} />
              <Route path="disparos" element={<Disparos />} />
              <Route path="extrator" element={<Extrator />} />
              <Route path="instagram" element={<Instagram />} />
              <Route path="financeiro" element={<Dashboard />} />
              <Route path="metricas-campanhas" element={<MetricasCampanhas />} />
              <Route path="google-ads" element={<GoogleAdsMetrics />} />
              <Route path="configuracoes" element={<Configuracoes />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </PersonalizacaoProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
