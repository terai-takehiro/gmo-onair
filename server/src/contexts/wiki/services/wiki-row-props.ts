/**
 * Wiki — データベースの行の値を、**保存の前に**親の項目定義で検査する（設計 §5-3-6）。
 *
 * 段A の `savePageInternal` に「段C でやる」と書いて飛ばしてあった穴を塞ぐところです。
 * 純関数の検査（型が合っているか）は `../wiki-props.ts`（画面との複製）にあり、
 * **DB を引く分だけ**がここにあります:
 *   - 親が `kind='database'` かどうか（＝このページは行か）
 *   - 親の項目の定義（`wiki_databases.items`）
 *   - ONAiR リンクの相手が実在するか
 *
 * ⚠️ **型違いは黙って捨てずに、どの項目かを言って止めます。**
 * `sanitizeProps` は合わない値を落とす（＝保存はできてしまう）ので、それだけだと
 * 「入れたのに空のまま」になり、利用者は入力の失敗に気づけません。
 * 落とすのは**知らない項目**（画面が古い・取り込んだ `.md` に余分な行がある）だけにします。
 * **止めなかったときの結果は `sanitizeProps` と同じ**です（複製の答えが正のまま）。
 *
 * ⚠️ **行ではないページの `props` は触りません。** テンプレートから写した値・
 * 取り込んだ `.md` の値がそのまま残ります（段A・段B からの振る舞いを変えない）。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { ValidationError } from '../../qsheet/services/httpErrors';
import {
  isValidPropValue,
  sanitizeProps,
  type WikiItem,
  type WikiOnairKind,
  type WikiPropValue,
} from '../wiki-props';

/** ONAiR リンクの相手を引く表。**この4つ以外は作らない**（§4-4 の「ONAiR リンク」） */
const ONAIR_TARGETS: Record<WikiOnairKind, { table: string; label: string }> = {
  project: { table: 'projects', label: '案件' },
  equipment: { table: 'equipment_items', label: '機材' },
  room: { table: 'studio_rooms', label: '部屋' },
  page: { table: 'wiki_pages', label: 'Wiki のページ' },
};

/** そのページの項目の定義（`kind='database'` の親ページに1行） */
export async function databaseItems(pageId: string): Promise<WikiItem[]> {
  const row = await queryOne('SELECT items FROM wiki_databases WHERE page_id = ?', [pageId]);
  const items = row?.items;
  return Array.isArray(items) ? (items as WikiItem[]) : [];
}

/**
 * その親がデータベースなら項目の定義を返す。データベースでなければ `null`。
 * **ページを作るとき**（親だけが分かっていて、行そのものはまだ無い）に使います。
 */
export async function parentDatabaseItems(parentId: string): Promise<WikiItem[] | null> {
  const row = await queryOne(
    `SELECT d.items
       FROM wiki_pages parent
       LEFT JOIN wiki_databases d ON d.page_id = parent.id
      WHERE parent.id = ? AND parent.deleted_at IS NULL AND parent.kind = 'database'`,
    [parentId],
  );
  if (!row) return null;
  return Array.isArray(row.items) ? (row.items as WikiItem[]) : [];
}

/**
 * このページがデータベースの行なら、親の項目の定義を返す。行でなければ `null`。
 *
 * 「行かどうか」は**親の `kind`** で決まります（行そのものは `kind='page'`）。
 */
export async function rowItemsOf(pageId: string): Promise<WikiItem[] | null> {
  const row = await queryOne(
    `SELECT p.parent_id FROM wiki_pages p WHERE p.id = ? AND p.deleted_at IS NULL`,
    [pageId],
  );
  const parentId = row?.parent_id ? String(row.parent_id) : '';
  if (!parentId) return null;
  return parentDatabaseItems(parentId);
}

/**
 * ONAiR リンクの相手が実在するか（§5-3-6 の「相手の存在を確かめる」）。
 *
 * ⚠️ **相手が読めるかまでは見ません。** 本文のリンク（`rebuildPageLinks`）と同じ扱いで、
 * 存在だけを確かめます。読める相手かどうかは、名前と状態を引く画面側で絞ります
 * （ここで読める相手だけに絞ると、案件の担当が変わった瞬間に**他の人が入れた値が
 * 保存できなくなる**ほうの事故が起きます）。
 */
export async function assertOnairTargetsExist(
  items: WikiItem[],
  props: Record<string, WikiPropValue>,
): Promise<void> {
  const byKind = new Map<WikiOnairKind, Map<string, string>>();
  for (const item of items) {
    if (item.type !== 'onair_link') continue;
    const value = props[item.id];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const link = value as { kind: WikiOnairKind; id: string };
    if (item.onairKinds && !item.onairKinds.includes(link.kind)) {
      throw new ValidationError(`「${item.name}」にはこの種類のものを入れられません。選び直してください。`);
    }
    const bucket = byKind.get(link.kind) ?? new Map<string, string>();
    bucket.set(link.id, item.name);
    byKind.set(link.kind, bucket);
  }

  for (const [kind, wanted] of byKind) {
    const target = ONAIR_TARGETS[kind];
    // 表の名前は上の表の値だけ（利用者の入力は `?` のまま渡す）
    const found = await queryAll(
      `SELECT id FROM ${target.table} WHERE id = ANY(?) AND deleted_at IS NULL`,
      [[...wanted.keys()]],
    );
    const ok = new Set(found.map((r) => String(r.id)));
    for (const [id, itemName] of wanted) {
      if (!ok.has(id)) {
        throw new ValidationError(
          `「${itemName}」に選んだ${target.label}が見つかりません。選び直してください。`,
        );
      }
    }
  }
}

/**
 * 行の値を保存してよい形にする。**型違いは止め、知らない項目は落とす**（冒頭の注意書き）。
 * 返す形は `sanitizeProps`（画面との複製）と同じです。
 */
export function validateRowProps(
  items: WikiItem[],
  props: Record<string, WikiPropValue>,
): Record<string, WikiPropValue> {
  for (const item of items) {
    const value = props[item.id];
    if (value === undefined) continue;
    if (isValidPropValue(item, value)) continue;
    throw new ValidationError(messageFor(item, value));
  }
  return sanitizeProps(items, props);
}

/** 型ごとに「どう入れ直せばよいか」を言う（wording.md ルール2: 次にやることを先に書く） */
function messageFor(item: WikiItem, value: WikiPropValue): string {
  const label = `「${item.name}」`;
  if ((value === null || value === '') && item.required) return `${label}を入れてください。`;
  switch (item.type) {
    case 'number':
      return `${label}は数字で入れてください。`;
    case 'checkbox':
      return `${label}はチェックの有無で入れてください。`;
    case 'date':
      return `${label}は 2026-09-22 の形で入れてください。`;
    case 'select':
      return `${label}は選択肢から選んでください。`;
    case 'multi_select':
      return `${label}は選択肢から選んでください（複数選べます）。`;
    case 'onair_link':
      return `${label}は一覧から選んでください。`;
    default:
      return `${label}は文字で入れてください。`;
  }
}

/**
 * 保存の直前に通す1本（`savePageInternal` から呼ぶ）。
 *
 * - 行でなければ**渡された値をそのまま**返す（段A・段B の振る舞いを変えない）
 * - 行なら型を見て、知らない項目を落とし、ONAiR リンクの相手の存在を確かめる
 */
export async function checkedRowProps(
  pageId: string,
  props: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const items = await rowItemsOf(pageId);
  if (!items) return props;
  const checked = validateRowProps(items, props as Record<string, WikiPropValue>);
  await assertOnairTargetsExist(items, checked);
  return checked;
}
