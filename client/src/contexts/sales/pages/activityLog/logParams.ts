/**
 * 記録タブの絞り込みを URL 引数に読み書きする純関数 (v4・PR #727 の宿題②)
 *
 * ── なぜ URL に乗せるか ────────────────────────────────────
 *
 * PR #727 では期限の区分（`due`）をローカル state に持っていたため、
 * `?due=overdue` を付けたリンクを開いても**区分が効きませんでした**。
 * 「期限超過の案件だけを並べた画面」を人に渡せない・再読み込みで戻る、の2つが
 * 同じ根で起きていたので、`?tab=` / `?view=`（`ActivityLogPage.tsx`）と同じく
 * URL 引数に揃えます。担当者（`?user=`）も同じ理由で URL に置きます。
 *
 * ── 決めごと ──────────────────────────────────────────────
 *
 * - **既定のときは引数を消す。** `?due=all` や `?user=` を残すと、同じ画面に
 *   2通りの URL ができ、共有されたリンクが「何か絞り込んでいる」ように見えます
 * - **他の引数には触らない。** `?tab=` / `?view=` / `?sort=next_action`
 *   （営業ダッシュボードの `OverduePanel.tsx` からの入口）を壊さないため、
 *   受け取った引数を写してから1つだけ書き換えます
 * - **知らない値は既定に倒す。** `?due=later` のように契約に無い綴りを
 *   そのままサーバーへ渡すと、サーバーは `all` に倒して返す（`parseDueBucket`）ので、
 *   画面だけが「絞り込み中」と表示する食い違いになります
 *
 * 画面を立てずに試験で固定する（`shared/tests/activityLogParams.test.ts`）。
 */
import { DUE_FILTERS, type DueFilter } from './dueState';

/** URL 引数の名前。画面・試験の両方がここを読む（綴りを2か所に書かない） */
export const DUE_PARAM = 'due';
export const USER_PARAM = 'user';
/** 案件の担当者（`projects.assigned_to`）。記録者の `?user=` とは別の引数 */
export const OWNER_PARAM = 'owner';

/** `?due=` を読む。無い・契約に無い綴りは `all`（既定） */
export function readDue(sp: URLSearchParams): DueFilter {
  const v = sp.get(DUE_PARAM);
  return v && (DUE_FILTERS as string[]).includes(v) ? (v as DueFilter) : 'all';
}

/**
 * `?user=` を読む（活動を記録した人の id・サーバーには `user_id` として渡す）。
 * 無いときは空文字＝「すべて」。前後の空白は落とす（手で打った URL の保険）。
 */
export function readUser(sp: URLSearchParams): string {
  return (sp.get(USER_PARAM) ?? '').trim();
}

/**
 * `?owner=` を読む（**案件の担当者**の id・サーバーには `owner_id` として渡す）。
 * 記録者の `?user=` とは別の絞り込み。無いときは空文字＝「すべて」。
 */
export function readOwner(sp: URLSearchParams): string {
  return (sp.get(OWNER_PARAM) ?? '').trim();
}

/**
 * 引数を1つだけ書き換えた**新しい** `URLSearchParams` を返す。
 * `value` が既定（`null` / 空文字）なら引数ごと消す。
 * 受け取った `sp` は書き換えない（react-router の `setSearchParams` に
 * 同じ実体を返すと、変更が無いものとして扱われることがあるため）。
 */
export function withParam(sp: URLSearchParams, key: string, value: string | null): URLSearchParams {
  const next = new URLSearchParams(sp);
  if (value === null || value === '') next.delete(key); else next.set(key, value);
  return next;
}

/** 期限の区分を書き込む。`all`（既定）は引数を消す */
export function withDue(sp: URLSearchParams, due: DueFilter): URLSearchParams {
  return withParam(sp, DUE_PARAM, due === 'all' ? null : due);
}

/** 記録者を書き込む。空文字（すべて）は引数を消す */
export function withUser(sp: URLSearchParams, userId: string): URLSearchParams {
  return withParam(sp, USER_PARAM, userId.trim() || null);
}

/** 案件の担当者を書き込む。空文字（すべて）は引数を消す */
export function withOwner(sp: URLSearchParams, ownerId: string): URLSearchParams {
  return withParam(sp, OWNER_PARAM, ownerId.trim() || null);
}

/**
 * 「すべて解除」で消す引数（`due` と `user` と `owner` だけ）。**`tab` / `view` / `sort` は残す。**
 *
 * ⚠️ `sort` を消さないこと。`?sort=next_action` だけで来た入口は `view` を持たず、
 * `ActivityLogPage.tsx` は「`view` が無くて `sort=next_action` なら時系列」と決めている。
 * ここで `sort` を消すと、**絞り込みを外しただけで並びが案件別へ飛びます**
 * （時系列の並び順そのものは `LogTab` のローカル state が既定へ戻す）。
 */
export function withoutFilters(sp: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(sp);
  next.delete(DUE_PARAM);
  next.delete(USER_PARAM);
  next.delete(OWNER_PARAM);
  return next;
}

// ── 担当者の選択肢 ──────────────────────────────────────────

export interface AssigneeUser { id: string; name: string }
export interface AssigneeOption { value: string; label: string }

/** 「すべて」の値。Radix の `Select` は空文字の値を持てないので、画面の中だけこの綴りを使う */
export const ALL_ASSIGNEES = 'all';

/**
 * 担当者（活動を記録した人）の選択肢を並べる。
 *
 * - **先頭は「すべて」、次に「自分」**（営業担当がいちばん多く選ぶのは自分の分）。
 *   自分は一覧の中から外して二重に出さない
 * - **URL で指定された id が一覧に無いとき**（一覧を読む前・退職などで一覧に居ない人）も
 *   選択肢に残す。残さないと `Select` の表示が空になり、**絞り込んでいるのに
 *   何で絞っているか画面に出ない**状態になります
 *
 * @param users    `GET /users` の返り（名前順）
 * @param meId     自分の id（`useAuth().currentUser?.id`）。未ログインなら `null`
 * @param selected 今の `?user=` / `?owner=`（空文字＝すべて）
 * @param missingLabel 一覧に居ない id を残すときの名前。記録者と担当者で言い分ける
 */
export function assigneeOptions(
  users: AssigneeUser[],
  meId: string | null | undefined,
  selected: string,
  missingLabel = '指定の記録者',
): AssigneeOption[] {
  const opts: AssigneeOption[] = [{ value: ALL_ASSIGNEES, label: 'すべて' }];
  const me = meId ? users.find((u) => u.id === meId) : undefined;
  if (meId) opts.push({ value: meId, label: me ? `自分（${me.name}）` : '自分' });
  for (const u of users) {
    if (u.id !== meId) opts.push({ value: u.id, label: u.name });
  }
  if (selected && !opts.some((o) => o.value === selected)) {
    opts.push({ value: selected, label: missingLabel });
  }
  return opts;
}
