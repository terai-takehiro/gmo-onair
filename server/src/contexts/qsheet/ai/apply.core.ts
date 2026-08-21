/**
 * 取り込み（`POST /apply`）が受け取った body を検証し、保存する形へ整える純関数（段7 §4-3）。
 *
 * **DB もネットワークも触らない。** 呼び出し側（`apply.service.ts`）が DB の読み書きを持つ。
 *
 * ── なぜここが要るか ────────────────────────────────────────────
 * body はクライアントが作るので、そのまま `applied_payload` / `applied_ids` に入れてはいけない
 * （改ざん・取り違えの余地がある）。この関数は:
 *   1. **提案の要素数を超える id を落とす**（人が自分で足した行を AI に帰属させない）
 *   2. **人がプレビューで直した分を `preview.` 接頭辞で ai_corrections 用に積む**
 *   3. **人がプレビューで外した分を `preview.` 接頭辞で `reject` として積む**
 *
 * ── id の対応づけ（04-ai.md の `ApplyRequest` が持たない情報を補う設計判断） ──────
 * `POST /apply` の body は `{ applied_payload, applied_ids, rejected_keys }` だけで、
 * 「提案のどの一時キーがどの採番済み id になったか」の対応表を持たない
 * （§4-2 の `ApplyPlanResult.keyToId` はクライアント内部の戻り値で、リクエストには乗らない）。
 * そこで **配列の並び順**で対応づける: `applyProposalOps`（クライアント。段8以降で実装）は
 * 提案を先頭から辿って `applied_ids` を組み立てるので、`rejected_keys` で外された分を
 * 除いた「残った提案要素」と `applied_ids` は同じ順序で並ぶ、という前提を置く。
 * `script_line_draft` は既存行 (`row_id`) を埋めるだけなので、この前提が要らず
 * `row_id` そのもので直接対応づけられる（もっとも堅い経路）。
 */
import { redactedFieldsOf, redactText } from './redact';
import { toComparableItem, toComparableRow } from './comparable';
import type { AppliedIds, AppliedPayload, ApplyRequestBody, CorrectionInput } from './types';

export interface SanitizeAppliedInput {
  kind: string;
  /** `qsheet_ai_proposals.proposal`（生の JSONB。中身は kind で決まる） */
  proposal: Record<string, unknown>;
  body: ApplyRequestBody;
  /**
   * scenario ブロックの id（`data.blocks` 側にしかない。`apply.service.ts` が document を
   * 読んで渡す）。`applied_payload` の行は `cells[scenarioBlockId].entries[0]` の形で
   * 台詞を持つので、これが無いと `after` 側の name/html が常に空扱いになり、
   * 「何も触っていないのに `fix` が出る」という誤検知になる。①枠（event_plan_draft）には
   * scenario セルが無いので null でよい。
   */
  scenarioBlockId: string | null;
}

export interface SanitizeAppliedResult {
  appliedPayload: AppliedPayload;
  appliedIds: AppliedIds;
  corrections: CorrectionInput[];
  droppedCount: number;
}

const EMPTY_IDS: AppliedIds = { sections: [], rows: [], items: [], columns: [] };

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function keyOf(el: Record<string, unknown>, fallback: 'key' | 'row_id'): string {
  return String(el[fallback] ?? el.key ?? el.row_id ?? el.id ?? '');
}

/** 提案の1カテゴリぶんの「一時キーの並び」を取り出す */
function proposalKeys(kind: string, proposal: Record<string, unknown>, category: keyof AppliedIds): string[] {
  if (kind === 'event_plan_draft') {
    if (category === 'columns') return asArray(proposal.columns).map((c) => keyOf(c, 'key'));
    if (category === 'items') return asArray(proposal.items).map((it) => keyOf(it, 'key'));
    return [];
  }
  if (kind === 'script_outline_draft') {
    if (category === 'sections') return asArray(proposal.sections).map((s) => keyOf(s, 'key'));
    if (category === 'rows') {
      return asArray(proposal.sections).flatMap((s) => asArray(s.rows).map((r) => keyOf(r, 'key')));
    }
    return [];
  }
  if (kind === 'script_line_draft') {
    // 既存行のみ。key ではなく実在する row_id そのもの
    if (category === 'rows') return asArray(proposal.lines).map((l) => keyOf(l, 'row_id'));
    return [];
  }
  return [];
}

/** そのカテゴリの「提案の生の要素」を key で引けるようにした Map */
function proposalElementsByKey(
  kind: string,
  proposal: Record<string, unknown>,
  category: keyof AppliedIds,
): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  const put = (el: Record<string, unknown>, fallback: 'key' | 'row_id') => out.set(keyOf(el, fallback), el);
  if (kind === 'event_plan_draft') {
    if (category === 'columns') asArray(proposal.columns).forEach((c) => put(c, 'key'));
    if (category === 'items') asArray(proposal.items).forEach((it) => put(it, 'key'));
  } else if (kind === 'script_outline_draft') {
    if (category === 'sections') asArray(proposal.sections).forEach((s) => put(s, 'key'));
    if (category === 'rows') {
      asArray(proposal.sections).forEach((s) => asArray(s.rows).forEach((r) => put(r, 'key')));
    }
  } else if (kind === 'script_line_draft' && category === 'rows') {
    asArray(proposal.lines).forEach((l) => put(l, 'row_id'));
  }
  return out;
}

/** `applied_payload` のそのカテゴリの配列から id で1件探す */
function findById(payload: AppliedPayload, category: keyof AppliedIds, id: string): Record<string, unknown> | null {
  const arr = asArray((payload as Record<string, unknown>)[category]);
  return arr.find((el) => String(el.row_id ?? el.id ?? '') === id) ?? null;
}

/**
 * 比較するフィールド名。**kind ごとに、その提案が実際に主張しているフィールドだけ**を見る。
 *
 * ⚠️ `script_line_draft` の提案（`lines[]`）は `name`/`text` しか持たず、`label`/`duration` を
 * 主張していない。ここを `rows` の全フィールド固定にすると、**AI が触っていない `duration` まで
 * 「提案の空値(0) → 実際の値」の `fix` として誤検知する**（往復テストで実際に踏んだ）。
 * `script_outline_draft` の提案（`sections[].rows[]`）は逆に `html`（台詞）を主張しない
 * （§2-4 骨格の段では本文を書かせない設計）ので `html` を比較対象から外す。
 */
function compareFieldsFor(kind: string, category: keyof AppliedIds): string[] {
  if (category === 'rows') {
    if (kind === 'script_line_draft') return ['name', 'html'];
    if (kind === 'script_outline_draft') return ['label', 'duration', 'name'];
    return ['label', 'duration', 'name', 'html'];
  }
  if (category === 'sections') return ['label', 'duration'];
  if (category === 'items') return ['title', 'kind', 'start_min', 'end_min', 'assignee', 'note'];
  return ['col_group', 'label']; // columns
}

/** row / section のような「尺・本文を持ちうる」要素を比較用の形に寄せる */
function toComparable(category: keyof AppliedIds, el: Record<string, unknown> | null, scenarioBlockId: string | null): Record<string, unknown> {
  if (!el) return {};
  if (category === 'rows' || category === 'sections') {
    const c = toComparableRow(el, category === 'rows' ? scenarioBlockId : null);
    return { label: c.label, duration: c.duration, name: c.name, html: c.html };
  }
  if (category === 'items') {
    const c = toComparableItem(el);
    return { title: c.title, kind: c.kind, start_min: c.start_min, end_min: c.end_min, assignee: c.assignee, note: c.note };
  }
  // columns
  return { col_group: String(el.col_group ?? ''), label: String(el.label ?? '') };
}

function sameValue(a: unknown, b: unknown): boolean {
  const an = typeof a === 'number' || (typeof a === 'string' && a.trim() !== '' && !Number.isNaN(Number(a)));
  const bn = typeof b === 'number' || (typeof b === 'string' && b.trim() !== '' && !Number.isNaN(Number(b)));
  if (an && bn) return Number(a) === Number(b);
  return String(a ?? '') === String(b ?? '');
}

/** category の label（`preview.rows[...]` のように field_path の先頭に使う） */
const CATEGORY_LABEL: Record<keyof AppliedIds, string> = {
  rows: 'preview.rows', sections: 'preview.sections', items: 'preview.items', columns: 'preview.columns',
};

export function sanitizeApplied(input: SanitizeAppliedInput): SanitizeAppliedResult {
  const { kind, proposal, body, scenarioBlockId } = input;
  const rejectedKeys = new Set((body.rejected_keys ?? []).map(String));
  const redactFields = new Set(redactedFieldsOf(kind));

  let appliedIds: AppliedIds = { ...EMPTY_IDS };
  const corrections: CorrectionInput[] = [];
  let droppedCount = 0;

  const categories: (keyof AppliedIds)[] = ['sections', 'rows', 'items', 'columns'];
  for (const category of categories) {
    const keys = proposalKeys(kind, proposal, category).filter((k) => !rejectedKeys.has(k));
    const elementsByKey = proposalElementsByKey(kind, proposal, category);
    const sentIds = (body.applied_ids?.[category] ?? []).map(String);

    // 並び順で対応づけ、提案の要素数を超えた分は落とす (改ざん・自己追加の防止)
    const keptIds = sentIds.slice(0, keys.length);
    droppedCount += Math.max(0, sentIds.length - keys.length);
    appliedIds = { ...appliedIds, [category]: keptIds };

    for (let i = 0; i < keptIds.length; i++) {
      const key = keys[i];
      const assignedId = keptIds[i];
      const beforeRaw = elementsByKey.get(key) ?? null;
      const afterRaw = findById(body.applied_payload as AppliedPayload, category, assignedId);
      const before = toComparable(category, beforeRaw, scenarioBlockId);
      const after = toComparable(category, afterRaw, scenarioBlockId);
      for (const f of compareFieldsFor(kind, category)) {
        if (sameValue(before[f], after[f])) continue;
        const isRedacted = redactFields.has(f);
        corrections.push({
          fieldPath: `${CATEGORY_LABEL[category]}[${assignedId}].${f}`,
          before: isRedacted ? redactText(String(before[f] ?? '')) : before[f] ?? null,
          after: isRedacted ? redactText(String(after[f] ?? '')) : after[f] ?? null,
          type: 'fix',
        });
      }
    }

    // 人がプレビューで外した要素 = reject を1回だけ
    for (const key of proposalKeys(kind, proposal, category)) {
      if (!rejectedKeys.has(key)) continue;
      const raw = elementsByKey.get(key);
      if (!raw) continue;
      const comparable = toComparable(category, raw, scenarioBlockId);
      const html = redactFields.has('html') && typeof comparable.html === 'string'
        ? redactText(comparable.html) : comparable.html;
      corrections.push({
        fieldPath: `${CATEGORY_LABEL[category]}[${key}]`,
        before: { ...comparable, html },
        after: null,
        type: 'reject',
      });
    }
  }

  // applied_payload は body のものをそのまま保存する (人が直した後の値の基準を揃える。§4-3)。
  // 提案に無い要素はここまでの過程で applied_ids から既に外れているので、
  // 保存する payload 自体も同じ id 集合だけに絞り込む (防御的に二重で守る)。
  const payload = (body.applied_payload && typeof body.applied_payload === 'object'
    ? body.applied_payload : {}) as AppliedPayload;
  const appliedPayload: AppliedPayload = { ...payload };
  for (const category of categories) {
    const allowed = new Set(appliedIds[category]);
    const arr = asArray((payload as Record<string, unknown>)[category]);
    if (arr.length === 0 && allowed.size === 0) continue;
    (appliedPayload as Record<string, unknown>)[category] = arr.filter(
      (el) => allowed.has(String(el.row_id ?? el.id ?? '')),
    );
  }

  return { appliedPayload, appliedIds, corrections, droppedCount };
}
