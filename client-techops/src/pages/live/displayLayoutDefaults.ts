// 計時・視聴者（liveops）— 表示レイアウトの既定値・validate（v4.1・PR3 レイアウトエディタ）。
//
// `shared/src/client/live/displayLayout.ts` の型はエディタ・表示画面（TimerDisplayPage.tsx）・
// サーバー（timers.routes.ts）の全てが唯一の正として参照するが、**validate 自体は
// それぞれが自分の入力に対して個別に持つ**（意図的な複製。設計:
// docs/design/v4/qsheet-v4-coding/13-live-display-layout-editor.md §2-2・§8リスク1、
// `client-live/src/pages/TimerDisplayPage.tsx` の `isValidDisplayLayout` と同じ形）。
//
// ここはエディタ（`LiveDisplayLayoutEditorPage.tsx`・`DisplayLayoutEditCanvas.tsx`・
// `DisplayLayoutMiniPreview.tsx`）が共通で使う既定値・validate・正規化をまとめる。
import {
  DISPLAY_ELEMENT_KEYS,
  type DisplayElementKey,
  type DisplayElementLayout,
  type DisplayLayout,
} from '@gmo-onair/shared/src/client/live/displayLayout';

export const ELEMENT_LABELS: Record<DisplayElementKey, string> = {
  timer: 'タイマー',
  youtube: 'YouTube',
  jstream: 'Jstream',
  zoom: 'Zoom',
  teams: 'Teams',
  total: '視聴者合計',
};

/** 初回編集時（保存済みレイアウトが無いタイマー）の既定配置。単位は displayLayout.ts と同じ %。 */
const DEFAULT_ELEMENT_RECTS: Record<DisplayElementKey, Pick<DisplayElementLayout, 'x' | 'y' | 'w' | 'h'>> = {
  timer: { x: 10, y: 8, w: 80, h: 52 },
  youtube: { x: 5, y: 66, w: 17, h: 26 },
  jstream: { x: 24, y: 66, w: 17, h: 26 },
  zoom: { x: 43, y: 66, w: 17, h: 26 },
  teams: { x: 62, y: 66, w: 17, h: 26 },
  total: { x: 81, y: 66, w: 17, h: 26 },
};

/** ドラッグ・リサイズ・数値入力で許す最小サイズ（%）。 */
export const MIN_ELEMENT_SIZE = 5;

export function clampPct(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** 6要素すべてが表示ONの既定レイアウト。「未設定に戻す」直後・初回編集時に使う。 */
export function defaultDisplayLayout(): DisplayLayout {
  return {
    version: 1,
    background: 'dark',
    elements: DISPLAY_ELEMENT_KEYS.map((key) => ({ key, visible: true, ...DEFAULT_ELEMENT_RECTS[key] })),
  };
}

const DISPLAY_ELEMENT_KEY_SET = new Set<string>(DISPLAY_ELEMENT_KEYS);

export function isValidDisplayElement(el: unknown): el is DisplayElementLayout {
  if (!el || typeof el !== 'object') return false;
  const e = el as Record<string, unknown>;
  if (typeof e.key !== 'string' || !DISPLAY_ELEMENT_KEY_SET.has(e.key)) return false;
  if (typeof e.visible !== 'boolean') return false;
  return (['x', 'y', 'w', 'h'] as const).every(
    (k) => typeof e[k] === 'number' && Number.isFinite(e[k] as number),
  );
}

export function isValidDisplayLayout(data: unknown): data is DisplayLayout {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (d.background !== 'dark' && d.background !== 'light') return false;
  if (!Array.isArray(d.elements)) return false;
  return d.elements.every(isValidDisplayElement);
}

/**
 * 保存済みレイアウトをエディタ編集用に「6キー必ず揃う」形へ正規化する。
 * 欠けているキーは非表示（`visible: false`）で既定位置に補う — displayLayout.ts の
 * 「欠けは非表示扱い」（§2-2）と同じ解釈を、編集できる形に落とし込むだけ。
 * 呼ぶ前に `isValidDisplayLayout()` で確認すること。
 */
export function normalizeDisplayLayout(data: DisplayLayout): DisplayLayout {
  const byKey = new Map(data.elements.filter(isValidDisplayElement).map((e) => [e.key, e]));
  return {
    version: 1,
    background: data.background,
    elements: DISPLAY_ELEMENT_KEYS.map(
      (key) => byKey.get(key) ?? { key, visible: false, ...DEFAULT_ELEMENT_RECTS[key] },
    ),
  };
}
