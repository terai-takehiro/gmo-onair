import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { EventModuleConfig, ModuleDef, Nominee } from '../types';
import { createDefaultEventModuleConfig } from '../data/presetModules';

// ── EventModuleConfig 操作ヘルパー ────────────────────────────
// v2.8.74 (段階3): 永続化を実装。
//   ・GET /awards/events/:id/module-config → JSONB or null
//   ・PUT /awards/events/:id/module-config → JSON 保存 (null で「プリセット復帰」)
//   ・null を返したらクライアント側で createDefaultEventModuleConfig() で補完
//
// 段階4 で編集 UI を追加し、ユーザーがモジュールを追加・編集・削除できるようにする。

const QUERY_KEY = (eventId: number) => ['awards-module-config', eventId] as const;

/** イベントの送出モジュール構成を取得。NULL のときは null を返す (= デフォルト未編集状態)。
 *  v2.8.79+: 404 / 500 などサーバーエラー時にも null を返してクライアント側でデフォルト
 *  プリセットにフォールバックできるよう catch を追加。 */
export async function fetchEventModuleConfig(eventId: number): Promise<EventModuleConfig | null> {
  try {
    const res = await api.get(`/awards/events/${eventId}/module-config`);
    return (res.data?.data ?? null) as EventModuleConfig | null;
  } catch (e) {
    // migration 083 未適用 (column missing) 等で 500 が返る場合は null として扱い、
    // クライアント側でデフォルトプリセットにフォールバック。
    console.warn('[moduleConfig] fetch failed, falling back to default preset', e);
    return null;
  }
}

/** イベントに送出モジュール構成を保存。null を渡すと「プリセット復帰」。 */
export async function saveEventModuleConfig(
  eventId: number,
  config: EventModuleConfig | null,
): Promise<EventModuleConfig | null> {
  const res = await api.put(`/awards/events/${eventId}/module-config`, { config });
  return (res.data?.data ?? null) as EventModuleConfig | null;
}

/** react-query フック。サーバー値が null のときはクライアントのデフォルトプリセットで補完。 */
export function useEventModuleConfig(eventId: number | null) {
  return useQuery({
    queryKey: eventId ? QUERY_KEY(eventId) : ['awards-module-config', 'noop'],
    queryFn: async () => {
      if (!eventId) return createDefaultEventModuleConfig();
      const remote = await fetchEventModuleConfig(eventId);
      return remote ?? createDefaultEventModuleConfig();
    },
    enabled: !!eventId,
    staleTime: 60_000,
  });
}

/** Mutation フック。保存後 cache を invalidate して再取得。 */
export function useSaveEventModuleConfig(eventId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: EventModuleConfig | null) => {
      if (!eventId) throw new Error('eventId 未指定');
      return await saveEventModuleConfig(eventId, config);
    },
    onSuccess: () => {
      if (eventId) qc.invalidateQueries({ queryKey: QUERY_KEY(eventId) });
    },
  });
}

// ── 同期版ヘルパー (DynamicModule など、レンダリング中に呼ぶ場所用) ──

/** 段階1 互換シグネチャ。同期版なのでデフォルトプリセットしか返せない。
 *  実際にイベント別 config を読みたい場所では useEventModuleConfig を使うこと。 */
export function loadEventModuleConfig(_eventId: number): EventModuleConfig {
  return createDefaultEventModuleConfig();
}

// ── visibility / order ヘルパー (段階1 から継続) ────────────

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
