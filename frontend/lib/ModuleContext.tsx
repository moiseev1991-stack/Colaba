'use client';

import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export type ModuleId = 'leads' | 'tenders' | 'seo';

type ModuleContextValue = {
  module: ModuleId;
  setModule: (m: ModuleId) => void;
  /** Switch the active module without navigating — used when a page already
   *  knows what module it belongs to (e.g. results page reading config.module). */
  setModuleSilent: (m: ModuleId) => void;
};

const ModuleContext = createContext<ModuleContextValue | null>(null);

// Order matters: this is the order shown to the user in pickers/tabs.
export const MODULE_ORDER: ModuleId[] = ['leads', 'tenders', 'seo'];

export const MODULE_LABELS: Record<ModuleId, string> = {
  leads: 'Поиск лидов',
  tenders: 'Госзакупки',
  seo: 'SEO',
};

// Modules that aren't ready for users yet. Pickers (sidebar dropdown,
// mobile tabs) render them greyed-out and ignore clicks; setModule no-ops.
// When a module ships, just remove it from this set.
export const DISABLED_MODULES: ReadonlySet<ModuleId> = new Set<ModuleId>(['tenders', 'seo']);

// Where to land when the user picks a module from the switcher.
export const MODULE_HOME_ROUTES: Record<ModuleId, string> = {
  leads: '/app/leads',
  tenders: '/app/gos',
  seo: '/dashboard',
};

const STORAGE_KEY = 'spinlid_active_module';
const DEFAULT_MODULE: ModuleId = 'leads';

// Pure path → module resolver. Used both inside the provider (to follow the URL)
// and outside (for one-off checks). Returns null when the URL is module-neutral
// (e.g. /app/email/*, /settings/*, /profile, /monitor) so the caller can fall
// back to whatever module is currently active in the context.
export function resolveModuleFromPath(pathname: string | null): ModuleId | null {
  if (!pathname) return null;
  if (pathname.startsWith('/app/leads') || pathname.startsWith('/leads')) return 'leads';
  if (pathname.startsWith('/app/gos') || pathname.startsWith('/app/tenders') || pathname.startsWith('/tenders')) return 'tenders';
  if (pathname.startsWith('/app/seo') || pathname.startsWith('/seo')) return 'seo';
  // Module-neutral routes: /runs/*, /dashboard, /settings/*, /app/email/*, /profile, /monitor.
  // These keep whatever module the user picked last — they belong to no specific tool.
  return null;
}

function readStored(): ModuleId | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'leads' || v === 'tenders' || v === 'seo' ? v : null;
  } catch {
    return null;
  }
}

function writeStored(m: ModuleId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, m);
  } catch {
    /* storage may be unavailable (private mode etc.) — fail silent */
  }
}

export function ModuleProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [module, setModuleState] = useState<ModuleId>(() => {
    const fromPath = resolveModuleFromPath(pathname);
    if (fromPath) return fromPath;
    return readStored() ?? DEFAULT_MODULE;
  });

  // Follow the URL: when the path resolves to a specific module, sync state.
  // Module-neutral paths (email, settings, profile, monitor) keep the current module.
  useEffect(() => {
    const fromPath = resolveModuleFromPath(pathname);
    if (fromPath && fromPath !== module) {
      setModuleState(fromPath);
      writeStored(fromPath);
    }
  }, [pathname, module]);

  const setModule = useCallback(
    (m: ModuleId) => {
      if (DISABLED_MODULES.has(m)) return;
      setModuleState(m);
      writeStored(m);
      // Soft navigation — preserves SPA state, no full reload.
      router.push(MODULE_HOME_ROUTES[m]);
    },
    [router]
  );

  const setModuleSilent = useCallback((m: ModuleId) => {
    setModuleState(m);
    writeStored(m);
  }, []);

  const value = useMemo(
    () => ({ module, setModule, setModuleSilent }),
    [module, setModule, setModuleSilent],
  );

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
