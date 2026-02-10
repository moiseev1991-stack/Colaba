'use client';

import { createContext, useContext, useState, useCallback, useMemo } from 'react';

export type ModuleId = 'seo' | 'leads' | 'tenders';

type ModuleContextValue = {
  module: ModuleId;
  setModule: (m: ModuleId) => void;
};

const ModuleContext = createContext<ModuleContextValue | null>(null);

const MODULE_ROUTES: Record<ModuleId, string> = {
  seo: '/seo/dashboard',
  leads: '/leads/dashboard',
  tenders: '/tenders/dashboard',
};

export function ModuleProvider({ children }: { children: React.ReactNode }) {
  const [module, setModuleState] = useState<ModuleId>('seo');

  const setModule = useCallback((m: ModuleId) => {
    setModuleState(m);
    if (typeof window !== 'undefined') {
      window.location.href = MODULE_ROUTES[m];
    }
  }, []);

  const value = useMemo(() => ({ module, setModule }), [module, setModule]);

  return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>;
}

export function useModule() {
  const ctx = useContext(ModuleContext);
  if (!ctx) throw new Error('useModule must be used within ModuleProvider');
  return ctx;
}

export function useModuleSafe() {
  return useContext(ModuleContext);
}
