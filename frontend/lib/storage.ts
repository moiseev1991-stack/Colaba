/**
 * Обёртки для работы с localStorage
 */

import { User, Run, LeadRow, BlacklistItem, Theme } from './types';

const STORAGE_KEYS = {
  USER: 'spinlid_user',
  RUNS: 'spinlid_runs',
  RUN_RESULTS: 'spinlid_run_results_',
  BLACKLIST: 'spinlid_blacklist',
  THEME: 'spinlid_theme',
} as const;

// User
export function getUser(): User | null {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(STORAGE_KEYS.USER);
  return data ? JSON.parse(data) : null;
}

export function setUser(user: User | null): void {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEYS.USER);
  }
}

// Runs
export function getRuns(): Run[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEYS.RUNS);
  return data ? JSON.parse(data) : [];
}

export function saveRun(run: Run): void {
  if (typeof window === 'undefined') return;
  const runs = getRuns();
  runs.unshift(run);
  localStorage.setItem(STORAGE_KEYS.RUNS, JSON.stringify(runs));
}

export function getRun(id: string): Run | null {
  const runs = getRuns();
  return runs.find(r => r.id === id) || null;
}

// Run Results
export function getRunResults(runId: string): LeadRow[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEYS.RUN_RESULTS + runId);
  return data ? JSON.parse(data) : [];
}

export function saveRunResults(runId: string, results: LeadRow[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.RUN_RESULTS + runId, JSON.stringify(results));
}

// Blacklist
export function getBlacklist(): BlacklistItem[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEYS.BLACKLIST);
  return data ? JSON.parse(data) : [];
}

export function addToBlacklist(domain: string): void {
  if (typeof window === 'undefined') return;
  const blacklist = getBlacklist();
  const normalized = normalizeDomain(domain);
  
  // Check if already exists
  if (blacklist.some(item => item.domain === normalized)) {
    return;
  }
  
  blacklist.push({
    id: Date.now().toString(),
    domain: normalized,
    addedAt: Date.now(),
  });
  
  localStorage.setItem(STORAGE_KEYS.BLACKLIST, JSON.stringify(blacklist));
}

export function removeFromBlacklist(domain: string): void {
  if (typeof window === 'undefined') return;
  const blacklist = getBlacklist();
  const filtered = blacklist.filter(item => item.domain !== normalizeDomain(domain));
  localStorage.setItem(STORAGE_KEYS.BLACKLIST, JSON.stringify(filtered));
}

export function isBlacklisted(domain: string): boolean {
  const blacklist = getBlacklist();
  const normalized = normalizeDomain(domain);
  return blacklist.some(item => item.domain === normalized);
}

function normalizeDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim();
}

// Theme
export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEYS.THEME);
  return (stored === 'light' || stored === 'dark') ? stored : 'dark';
}

export function setTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

// Initialize theme on load
if (typeof window !== 'undefined') {
  setTheme(getTheme());
}
