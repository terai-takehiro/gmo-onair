import { useEffect } from 'react';
import type { ModuleKey } from '../types';
import type { ModuleMap } from '../modules/getModules';

interface Args {
  modules: ModuleMap;
  setModuleKey: (k: ModuleKey) => void;
  prevNominee: () => void;
  nextNominee: () => void;
  take: () => void;
  clear: () => void;
}

const KEY_TO_MODULE: Record<string, ModuleKey> = {
  '1': 'title',
  '2': 'respect',
  '3': 'skills',
  '4': 'comment',
  '5': 'members',
  '6': 'recComment',
  '0': 'none',
};

// Operator keyboard shortcuts:
//   ↑/↓     ノミネート切替
//   0–6      モジュール切替
//   Space/↵  TAKE
//   Esc      CLEAR
export function useShortcuts({
  modules,
  setModuleKey,
  prevNominee,
  nextNominee,
  take,
  clear,
}: Args) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.matches('input, textarea, select') || target.isContentEditable)) return;

      const mk = KEY_TO_MODULE[e.key];
      if (mk && modules[mk]) {
        setModuleKey(mk);
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        take();
      } else if (e.key === 'Escape') {
        clear();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        nextNominee();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        prevNominee();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modules, setModuleKey, prevNominee, nextNominee, take, clear]);
}
