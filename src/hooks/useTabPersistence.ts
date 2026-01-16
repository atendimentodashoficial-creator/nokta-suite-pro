import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Hook para persistir o estado de tabs na URL via query parameters.
 * Ao atualizar a página, a tab ativa é preservada.
 * 
 * @param paramName - Nome do parâmetro na URL (ex: "tab", "subtab")
 * @param defaultValue - Valor padrão quando não há parâmetro na URL
 * @returns [activeTab, setActiveTab] - Estado e setter da tab ativa
 */
export function useTabPersistence(paramName: string, defaultValue: string): [string, (value: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Obter valor inicial da URL ou usar default
  const getInitialValue = useCallback(() => {
    const urlValue = searchParams.get(paramName);
    return urlValue || defaultValue;
  }, [searchParams, paramName, defaultValue]);
  
  const [activeTab, setActiveTabState] = useState<string>(getInitialValue);
  
  // Sincronizar com URL quando mudar externamente (navegação back/forward)
  useEffect(() => {
    const urlValue = searchParams.get(paramName);
    if (urlValue && urlValue !== activeTab) {
      setActiveTabState(urlValue);
    }
  }, [searchParams, paramName, activeTab]);
  
  // Função para atualizar tab e URL
  const setActiveTab = useCallback((newValue: string) => {
    setActiveTabState(newValue);
    
    // Atualizar URL mantendo outros parâmetros
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      if (newValue === defaultValue) {
        // Se for o valor padrão, remover da URL para manter limpo
        newParams.delete(paramName);
      } else {
        newParams.set(paramName, newValue);
      }
      return newParams;
    }, { replace: true }); // replace para não poluir histórico
  }, [setSearchParams, paramName, defaultValue]);
  
  return [activeTab, setActiveTab];
}
