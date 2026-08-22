/**
 * 「いまどの案件/番組を見ているか」を教える小さなストア（2026-08-22・ご指示で新設）。
 *
 * サイドバー・スマホ下タブ（`components/layout/nav.ts` の `buildQsheetNav`）が、
 * URL だけでは owner（案件id/番組id）が分からない画面（`/qsheet/editor/:id` のような
 * **doc id** が URL に出る画面、`/qsheet/recording/:ownerKey` のように owner キーは
 * 出るが project か program かが URL だけでは分からない画面）で参照する。
 *
 * ── URL 優先・このストアは「補助」でしかない ──────────────────────
 *
 * `buildQsheetNav` は**まず pathname / searchParams から判定できるだけ判定し**、
 * それで足りないときだけこのストアの値を見る。したがって:
 *
 * - `clear()` に相当する関数は無い。判定に使わないページでは参照されないので、
 *   古い値が残っていても実害が無い（例: `/qsheet/top` にいるとき、このストアに
 *   前に見ていた案件の値が残っていても `buildQsheetNav` は見ない）
 * - 各ページ（`EditorPage`/`SchedulePage`/`JourneyPage`/`RecordingPage`/`StreamingPage`/
 *   `RentalSearchPage` 等）から `setProductionNavContext` を呼ぶ配線は**このファイルの
 *   責務ではない**（後続の別作業で行う）
 *
 * ── 実装 ─────────────────────────────────────────────────────────
 *
 * `shared/src/client/uiStore.ts` と同じ流儀（zustand）。React の外からも呼べるよう
 * （`useProductionNavContext` は React フック、`setProductionNavContext` はただの関数）
 * ストア本体は非公開にし、2つの関数だけを公開する。
 */
import { create } from 'zustand';

export type ProductionNavScope = 'project' | 'program';

export interface ProductionNavContext {
  scope: ProductionNavScope;
  id: string;
  label?: string | null;
}

interface ProductionNavContextStore {
  ctx: ProductionNavContext | null;
  set: (ctx: ProductionNavContext) => void;
}

const useProductionNavContextStore = create<ProductionNavContextStore>((set) => ({
  ctx: null,
  set: (ctx) => set({ ctx }),
}));

/** いま見ている案件/番組。文脈が無ければ `null`（React フック） */
export function useProductionNavContext(): ProductionNavContext | null {
  return useProductionNavContextStore((s) => s.ctx);
}

/** いま見ている案件/番組を記録する（React の外からも呼べるただの関数） */
export function setProductionNavContext(ctx: ProductionNavContext): void {
  useProductionNavContextStore.getState().set(ctx);
}
