import type { EventModuleConfig, ModuleDef, Nominee } from '../types';
import { createDefaultEventModuleConfig } from '../data/presetModules';

// ── 段階1 (v2.8.71): EventModuleConfig 操作ヘルパー ────────────
// 段階1 では永続化が未実装のため、全イベントが「デフォルトプリセット 7種」を返す。
// 段階3 で API/DB (awards_events.module_config JSONB) に差し替える。

/** イベントの送出モジュール構成を取得。
 *  段階1 (永続化未実装): 常にデフォルトプリセットを返す。
 *  段階3 で `GET /awards/events/:id/module-config` 呼び出しに置き換え。 */
export function loadEventModuleConfig(_eventId: number): EventModuleConfig {
  return createDefaultEventModuleConfig();
}

/** モジュールが現在のノミネートに対して表示可能か (visibility 判定) */
export function isModuleVisible(mod: ModuleDef, n: Nominee | null): boolean {
  if (!n) return mod.visibility !== 'team-only' && mod.visibility !== 'individual-only';
  switch (mod.visibility ?? 'always') {
    case 'always': return true;
    case 'team-only': return n.type === 'team';
    case 'individual-only': return n.type === 'individual';
  }
}

/** order 昇順 + visibility 適用済みのモジュール一覧。ピッカー UI / shortcut 解決に使用。 */
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

/** shortcutKey ('0'〜'9') から ModuleDef を解決。重複時は order が小さい方が勝つ。 */
export function findModuleByShortcut(
  config: EventModuleConfig,
  n: Nominee | null,
  shortcutKey: string,
): ModuleDef | undefined {
  return getOrderedVisibleModules(config, n).find((m) => m.shortcutKey === shortcutKey);
}

/** 段階4 で重複検出に使用。同 shortcutKey を持つモジュールを列挙。 */
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
