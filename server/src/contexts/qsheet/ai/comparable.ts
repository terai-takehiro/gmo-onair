/**
 * 差分を取る前に before / after を同じ表現へ寄せる（段7 §4-4）。
 *
 * `diffByKey` の比較は「両方が数値らしければ数値比較、それ以外は `String()` 比較」
 * （`ai-output.service.ts:190-198`）。`90` と `"1:30"` は不一致になるので、
 * 寄せずに突合すると**人が1文字も触っていない行が全部 `fix` になる**。
 * 話者名（`speaker` vs `entries[0].name`）、本文（`text` vs `entries[0].html`）も同じ経路でずれる。
 *
 * ⚠️ `toComparableRow` は防御的に両方の形（提案の生の形 / `data` に書いた形）を受ける。
 * `applied_payload` は「クライアントが `data` に実際に書いた形」で持つのが正しい運用だが、
 * 取り違えて提案側の生の値がそのまま紛れ込んでも、ここで吸収して誤検知を防ぐ。
 *
 * ⚠️ `parseDurSec` は独立には作らない。**サーバー側の秒変換は既に
 * `server/src/shared/schedule/time.ts` の `parseDur` に一本化されている**（02-schedule
 * の段で `shared/src/schedule/time.ts` と対で作られた）。ここで複製すると
 * `scripts/check-collab-parity.mjs` の対から漏れたまま2つの実装が生まれる。
 */
import { parseDur } from '../../../shared/schedule/time';
import type { ComparableItem, ComparableRow } from './types';

type AnyRow = Record<string, unknown>;

function firstEntry(row: AnyRow, scenarioBlockId: string | null): AnyRow | null {
  if (!scenarioBlockId) return null;
  const cells = row.cells as Record<string, unknown> | undefined;
  const cell = cells?.[scenarioBlockId] as AnyRow | undefined;
  const entries = cell?.entries as unknown[] | undefined;
  const entry = entries?.[0];
  return entry && typeof entry === 'object' ? (entry as AnyRow) : null;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

/**
 * `data` の行、または（取り違えたときの防御として）提案の生の行のどちらを渡しても
 * 同じ `ComparableRow` に寄せる。
 *
 * - 尺: `row.duration`（文字列 `"1:30"` 等）優先、無ければ `row.duration_sec`（秒の数値）。
 *   `parseDur` は数値をそのまま通すので、どちらを渡しても同じ扱いになる。
 * - 話者: `cells[scenarioBlockId].entries[0].name` 優先、無ければ `row.name` / `row.speaker`
 * - 本文: 同上の `.html` 優先、無ければ `row.html` / `row.text`
 */
export function toComparableRow(row: unknown, scenarioBlockId: string | null): ComparableRow {
  const r = (row && typeof row === 'object' ? row : {}) as AnyRow;
  const entry = firstEntry(r, scenarioBlockId);
  return {
    row_id: str(r.row_id ?? r.id ?? r.key ?? ''),
    label: str(r.label ?? ''),
    duration: parseDur((r.duration ?? r.duration_sec ?? null) as string | number | null | undefined),
    name: str(entry?.name ?? r.name ?? r.speaker ?? ''),
    html: str(entry?.html ?? r.html ?? r.text ?? ''),
  };
}

/** ①枠（イベント設計）の項目を同じ表現へ寄せる。時刻はもともと数値（分）なので変換不要 */
export function toComparableItem(item: unknown): ComparableItem {
  const it = (item && typeof item === 'object' ? item : {}) as AnyRow;
  return {
    key: str(it.item_id ?? it.id ?? it.key ?? ''),
    title: str(it.title ?? ''),
    kind: str(it.kind ?? 'other'),
    start_min: Number(it.start_min ?? 0) || 0,
    end_min: Number(it.end_min ?? 0) || 0,
    assignee: str(it.assignee ?? ''),
    note: str(it.note ?? ''),
  };
}
