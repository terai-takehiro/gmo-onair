import { useMemo } from 'react';
import type { EventModuleConfig, ModuleDef, Nominee } from '../types';
import { createDefaultEventModuleConfig } from '../data/presetModules';

// v2.8.130: 下位置CG モジュール構成のユーザーカスタマイズ機能を撤廃。
// 全イベントでデフォルトプリセット (`createDefaultEventModuleConfig()`) を使用する。
// 旧 v2.8.74〜82 の GET/PUT エンドポイント、エディタ画面、JSON I/O は廃止。
// `useEventModuleConfig` は互換のため残しているが、同期的にデフォルトプリセットを
// 返すだけのスタブ。

/** イベントの送出モジュール構成 (常にデフォルトプリセット) */
export function useEventModuleConfig(_eventId: number | null) {
  const data = useMemo(() => createDefaultEventModuleConfig(), []);
  return { data };
}

export function loadEventModuleConfig(_eventId: number): EventModuleConfig {
  return createDefaultEventModuleConfig();
}

// ── visibility / order ヘルパー ──────────────────────────────

export function isModuleVisible(mod: ModuleDef, n: Nominee | null): boolean {
  if (!n) return mod.visibility !== 'team-only' && mod.visibility !== 'individual-only';
  switch (mod.visibility ?? 'always') {
    case 'always': return true;
    case 'team-only': return n.type === 'team';
    case 'individual-only': return n.type === 'individual';
  }
}

export function getOrderedVisibleModules(
  config: EventModuleConfig,
  n: Nominee | null,
): ModuleDef[] {
  return config.modules
    .filter((m) => isModuleVisible(m, n))
    .slice()
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.id.localeCompare(b.id);
    });
}

export function findModuleByShortcut(
  config: EventModuleConfig,
  n: Nominee | null,
  shortcutKey: string,
): ModuleDef | undefined {
  return getOrderedVisibleModules(config, n).find((m) => m.shortcutKey === shortcutKey);
}

export function detectShortcutConflicts(
  config: EventModuleConfig,
): Record<string, ModuleDef[]> {
  const map: Record<string, ModuleDef[]> = {};
  for (const m of config.modules) {
    if (!m.shortcutKey) continue;
    map[m.shortcutKey] = map[m.shortcutKey] || [];
    map[m.shortcutKey].push(m);
  }
  return Object.fromEntries(
    Object.entries(map).filter(([, mods]) => mods.length > 1),
  );
}
