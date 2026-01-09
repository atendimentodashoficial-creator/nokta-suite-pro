import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePersonalizacao, PersonalizacaoConfig } from "@/hooks/usePersonalizacao";
import noktaLogoDefault from "@/assets/nokta-logo.png";

interface PersonalizacaoContextType {
  config: PersonalizacaoConfig | null;
  isLoading: boolean;
  logoUrl: string;
  applyColors: () => void;
  resetColors: () => void;
}

const PersonalizacaoContext = createContext<PersonalizacaoContextType | undefined>(undefined);

export function PersonalizacaoProvider({ children }: { children: ReactNode }) {
  const { config, isLoading } = usePersonalizacao();
  const [logoUrl, setLogoUrl] = useState<string>(noktaLogoDefault);

  useEffect(() => {
    if (config?.logo_url) {
      setLogoUrl(config.logo_url);
    } else {
      setLogoUrl(noktaLogoDefault);
    }
  }, [config?.logo_url]);

  useEffect(() => {
    if (config) {
      applyColors();
    }
  }, [config]);

  const applyColors = () => {
    if (!config) return;

    const root = document.documentElement;

    if (config.cor_primaria) {
      root.style.setProperty("--primary", config.cor_primaria);
    }
    if (config.cor_secundaria) {
      root.style.setProperty("--secondary", config.cor_secundaria);
    }
    if (config.cor_background) {
      root.style.setProperty("--background", config.cor_background);
    }
    if (config.cor_sidebar) {
      root.style.setProperty("--sidebar-background", config.cor_sidebar);
    }
  };

  const resetColors = () => {
    const root = document.documentElement;
    root.style.removeProperty("--primary");
    root.style.removeProperty("--secondary");
    root.style.removeProperty("--background");
    root.style.removeProperty("--sidebar-background");
  };

  return (
    <PersonalizacaoContext.Provider value={{ config, isLoading, logoUrl, applyColors, resetColors }}>
      {children}
    </PersonalizacaoContext.Provider>
  );
}

export function usePersonalizacaoContext() {
  const context = useContext(PersonalizacaoContext);
  if (context === undefined) {
    throw new Error("usePersonalizacaoContext must be used within a PersonalizacaoProvider");
  }
  return context;
}
