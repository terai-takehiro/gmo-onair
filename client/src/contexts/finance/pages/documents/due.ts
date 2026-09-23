/**
 * ⑥ 受領書類 — 支払期日の急ぎ具合と、書類の経緯
 *
 * ── なぜ画面の外に出すか ────────────────────────────────────
 *
 * この画面は**払う前に確かめる画面**なのに、支払期日は `08/20` と
 * 出ているだけでした（`md()` で月日に切るだけ）。**過ぎているのか
 * 明日なのかが、読む人の引き算に任されていた**ということです。
 * 日付の境目（今日ちょうど・月またぎ）は画面を開いても確かめられないので、
 * 純粋な関数にして `shared/tests/financeDocDue.test.ts` で固定します。
 *
 * ⚠️ **`Date` の現地時刻を使わない。** `new Date('2026-08-31')` は UTC の
 * 真夜中として読まれるので、日本時間の午前中に1日ずれます。
 * ここは `YYYY-MM-DD` の文字列のまま比べます（日数の差だけ `Date.UTC`）。
 *
 * ── 色だけに頼らない ────────────────────────────────────────
 *
 * 「赤い」は色が見えない人には何も伝えません。**文字にも
 * 「2日超過」「今日」と書きます**（`text` がそれ）。
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'none';

export interface DueState {
  tone: DueTone;
  /** 一覧に出す文字。**日付と急ぎ具合の両方**を書く（`8/29（2日超過）`） */
  text: string;
  /** 今日から期日までの日数。過ぎていれば負。期日が無ければ null */
  days: number | null;
}

/** 「3日以内」を急ぎとする段（ユーザーの依頼どおり） */
export const DUE_SOON_DAYS = 3;

/** `to` - `from` の日数。どちらも `YYYY-MM-DD` */
export function daysBetween(from: string, to: string): number {
  const a = ISO.exec(from);
  const b = ISO.exec(to);
  if (!a || !b) return 0;
  const ms = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]))
    - Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  return Math.round(ms / 86_400_000);
}

/** `2026-08-20` → `8/20` */
export function md(iso: string | null | undefined): string {
  const m = iso ? ISO.exec(iso) : null;
  return m ? `${Number(m[2])}/${Number(m[3])}` : '—';
}

/**
 * 支払期日の急ぎ具合。
 *
 * **期日が入っていない書類を「急がない」と言わない。** AI が読み取れなかった
 * だけかもしれないので、`none` として「期日なし」とだけ出します
 * （黙って空欄にすると、期日の無い請求書が一覧のいちばん下で忘れられる）。
 */
export function dueState(due: string | null | undefined, today: string): DueState {
  if (!due || !ISO.test(due)) return { tone: 'none', text: '期日なし', days: null };
  const days = daysBetween(today, due);
  // **列に収まる長さで書く**（支払期日の列は 128px）。
  // 「期限超過」はこの製品で既に使っている言い方（ホームの札と同じ）
  if (days < 0) return { tone: 'overdue', text: `${md(due)}（${-days}日超過）`, days };
  // 当日・残りは「本日」「残りN日」（`docs/wording.md` ルール8・9）。
  // ✕「（今日）」「（あと3日）」は口語で、営業活動記録（`activityLog/dueState.ts`）と言い方が割れていた
  if (days === 0) return { tone: 'today', text: `${md(due)}（本日）`, days };
  if (days <= DUE_SOON_DAYS) return { tone: 'soon', text: `${md(due)}（残り${days}日）`, days };
  return { tone: 'later', text: md(due), days };
}

/**
 * 書類の経緯（誰がいつ取り込み／台帳に入れたか）。
 *
 * ── なぜ足したか ────────────────────────────────────────────
 *
 * `processed_by` / `processed_at` は保存していたのに、**画面に1文字も
 * 出していませんでした**。承認する人には「この書類がどこまで進んだか」が
 * 状態バッジ1つでしか届いておらず、**誰に訊けばよいか**が分かりません。
 *
 * **分からないところは書かない。** 「不明」と埋めると、記録が無いことと
 * 「不明という人が触った」ことの区別が付かなくなります。
 */
export function docTrail(doc: {
  is_ai?: boolean;
  created_by_name?: string | null;
  created_at?: string | null;
  processed_by?: string | null;
  processed_at?: string | null;
}): string[] {
  const out: string[] = [];
  const day = (t: string | null | undefined) => (t && t.length >= 10 ? md(t.slice(0, 10)) : null);

  const inDay = day(doc.created_at);
  if (doc.is_ai) out.push(`AI が取り込み${inDay ? ` ${inDay}` : ''}`);
  else if (doc.created_by_name) out.push(`${doc.created_by_name} が登録${inDay ? ` ${inDay}` : ''}`);
  else if (inDay) out.push(`受け取り ${inDay}`);

  const doneDay = day(doc.processed_at);
  if (doc.processed_by) out.push(`${doc.processed_by} が台帳に入れました${doneDay ? ` ${doneDay}` : ''}`);
  else if (doneDay) out.push(`台帳に入れました ${doneDay}`);

  return out;
}
