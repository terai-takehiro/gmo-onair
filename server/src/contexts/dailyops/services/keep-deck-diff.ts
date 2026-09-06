/**
 * 構成の2つの版を比べて「人の直し」（`keep_deck_edits` の行）を作る — 純粋関数。
 *
 * ── なぜ差分を残すか（docs/design/v4/keep-report.md §10・条件2）──────────
 * ONAiR が組んだ構成を人がどう直したか（消したページ・直した注記・並べ替え）を貯め、
 * 「よく消されるページ」「よく直される注記」を次回の標準の構成と既定値に戻すため。
 * 差分の**元は ONAiR が組んだ版（source 'auto'）**で、人の保存どうしの差ではない
 * （サーバー側 `keep-deck.service.ts` が版を選ぶ。ここは2つの版を比べるだけ）。
 *
 * ── 出す行の種類 ────────────────────────────────────────────
 *   reorder  … ページの並びが変わった（1行。`before` / `after` は共通ページの id の並び）
 *   remove   … ページを消した（`removed` false→true。field 'removed'）／ページ・部品そのものが無くなった（field 'page' / 'part'）
 *   restore  … 消したページを戻した（`removed` true→false）
 *   add      … ページ（field 'page'）・部品（field 'part'）が増えた
 *   override … 題（title）・注記（notes）・アジェンダ（agenda）・部品の文（text_override）・
 *              設定（options）・位置（position）が変わった
 *
 * ⚠️ **これは server 側の写しです**（正は `shared/src/keepReport/deckDiff.ts`）。
 * server は `shared/` を import できないため、同じ関数をここにも置きます。
 * `shared/tests/keepReportDeckParity.test.ts` が同じ答えになることを固定しています。
 */
import type { KeepDeckEdit, SlidePage, SlidePart } from './keep-deck.types';

/** `keep_deck_edits` に入れる前の1行（id・deck_id・version・日時・誰は保存側が付ける） */
export interface DeckEditInput {
  page_id: string | null;
  part_id: string | null;
  field: string;
  before_value: string | null;
  after_value: string | null;
  kind: KeepDeckEdit['kind'];
}

/** 鍵の順に依らない JSON（options の比較用）。`label` はテンプレ由来なので比べない */
export function stableJson(v: unknown): string | null {
  if (v == null) return null;
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === 'object') {
      return Object.keys(x as Record<string, unknown>).filter((k) => k !== 'label').sort()
        .reduce<Record<string, unknown>>((o, k) => { o[k] = norm((x as Record<string, unknown>)[k]); return o; }, {});
    }
    return x;
  };
  const n = norm(v);
  if (n && typeof n === 'object' && !Array.isArray(n) && Object.keys(n).length === 0) return null;
  return JSON.stringify(n);
}

const pos = (p: SlidePart) => `${p.x},${p.y},${p.w},${p.h}`;

function diffParts(pageId: string, prev: SlidePart[], next: SlidePart[], out: DeckEditInput[]): void {
  const prevById = new Map(prev.map((p) => [p.id, p]));
  const nextById = new Map(next.map((p) => [p.id, p]));
  for (const n of next) {
    const p = prevById.get(n.id);
    if (!p) { out.push({ page_id: pageId, part_id: n.id, field: 'part', before_value: null, after_value: n.type, kind: 'add' }); continue; }
    if ((p.text_override ?? null) !== (n.text_override ?? null)) {
      out.push({ page_id: pageId, part_id: n.id, field: 'text_override', before_value: p.text_override ?? null, after_value: n.text_override ?? null, kind: 'override' });
    }
    const po = stableJson(p.options); const no = stableJson(n.options);
    if (po !== no) out.push({ page_id: pageId, part_id: n.id, field: 'options', before_value: po, after_value: no, kind: 'override' });
    if (pos(p) !== pos(n)) out.push({ page_id: pageId, part_id: n.id, field: 'position', before_value: pos(p), after_value: pos(n), kind: 'override' });
  }
  for (const p of prev) {
    if (!nextById.has(p.id)) out.push({ page_id: pageId, part_id: p.id, field: 'part', before_value: p.type, after_value: null, kind: 'remove' });
  }
}

export function diffDecks(prevPages: SlidePage[], nextPages: SlidePage[]): DeckEditInput[] {
  const out: DeckEditInput[] = [];
  const prevById = new Map(prevPages.map((p) => [p.id, p]));
  const nextById = new Map(nextPages.map((p) => [p.id, p]));

  // 並び: 両方にあるページの id の並びが違えば1行
  const prevOrder = prevPages.filter((p) => nextById.has(p.id)).map((p) => p.id);
  const nextOrder = nextPages.filter((p) => prevById.has(p.id)).map((p) => p.id);
  if (prevOrder.join(',') !== nextOrder.join(',')) {
    out.push({ page_id: null, part_id: null, field: 'order', before_value: prevOrder.join(','), after_value: nextOrder.join(','), kind: 'reorder' });
  }

  for (const n of nextPages) {
    const p = prevById.get(n.id);
    if (!p) {
      out.push({ page_id: n.id, part_id: null, field: 'page', before_value: null, after_value: `${n.template}: ${n.title}`, kind: 'add' });
      continue;
    }
    if (!p.removed && n.removed) out.push({ page_id: n.id, part_id: null, field: 'removed', before_value: 'false', after_value: 'true', kind: 'remove' });
    if (p.removed && !n.removed) out.push({ page_id: n.id, part_id: null, field: 'removed', before_value: 'true', after_value: 'false', kind: 'restore' });
    if (p.title !== n.title) out.push({ page_id: n.id, part_id: null, field: 'title', before_value: p.title, after_value: n.title, kind: 'override' });
    if ((p.notes ?? null) !== (n.notes ?? null)) out.push({ page_id: n.id, part_id: null, field: 'notes', before_value: p.notes ?? null, after_value: n.notes ?? null, kind: 'override' });
    const pa = stableJson(p.agenda ?? null); const na = stableJson(n.agenda ?? null);
    if (pa !== na) out.push({ page_id: n.id, part_id: null, field: 'agenda', before_value: pa, after_value: na, kind: 'override' });
    diffParts(n.id, p.parts, n.parts, out);
  }
  for (const p of prevPages) {
    if (!nextById.has(p.id)) out.push({ page_id: p.id, part_id: null, field: 'page', before_value: `${p.template}: ${p.title}`, after_value: null, kind: 'remove' });
  }
  return out;
}
