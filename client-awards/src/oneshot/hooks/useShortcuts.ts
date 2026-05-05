import { useEffect } from 'react';
import type { ModuleDef } from '../types';
import { moduleIdToCueKey } from '../lib/moduleKeyMap';

interface Args {
  /** 表示中の (visibility 適用済み) モジュール一覧 */
  modules: ModuleDef[];
  setModuleKey: (cueKey: string) => void;
  prevNominee: () => void;
  nextNominee: () => void;
  take: () => void;
  clear: () => void;
}

// v2.8.76+: ModuleDef.shortcutKey ('0'〜'9') を読んで動的にマッピング。
// 旧版の固定 KEY_TO_MODULE は廃止。
//
// Operator keyboard shortcuts:
//   ↑/↓     ノミネート切替
//   0–9      モジュール切替 (ModuleDef.shortcutKey で割当て)
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

      // shortcutKey ('0'〜'9') 一致するモジュールを探す
      if (/^[0-9]$/.test(e.key)) {
        const m = modules.find((mod) => mod.shortcutKey === e.key);
        if (m) {
          setModuleKey(moduleIdToCueKey(m.id));
          return;
        }
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
