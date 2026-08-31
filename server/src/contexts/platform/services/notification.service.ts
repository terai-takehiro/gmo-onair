/**
 * 社内通知（ベル）— v4 設定 ⑦
 *
 * ── 二重に出さない ──────────────────────────────────────────
 *
 * 定時実行は**コンテナが再起動すればまた走ります**。素直に INSERT すると
 * 同じ督促が何行も並び、そのうち誰もベルを見なくなります。
 *
 * `notifications` に一意索引（人 × ひな形 × 対象 × 日）を張ってあり、
 * ここでは `ON CONFLICT DO NOTHING` で受けます。**「作れた件数」を返す**ので、
 * 呼び出し側は「今回いくつ新しく出たか」を記録できます。
 *
 * ── 宛先の決め方 ────────────────────────────────────────────
 *
 * ひな形の `send_to`（「経理 ・ 自社担当」）は**人が読む文**で、判定には使いません。
 * 宛先はコード側が決めます — 文字列で人を探すと、名前を直した日に届かなくなります。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';

export interface NotifyInput {
  userId: string;
  templateId: string | null;
  title: string;
  body?: string | null;
  link?: string | null;
  refType?: string | null;
  refId?: string | null;
  /** その日ぶんの鍵。毎日出してよい通知に使う。1回きりのものは空のまま */
  refDate?: string;
}

/**
 * 1件出す。**すでに同じものがあれば何もしない**（戻り値 false）。
 *
 * `execute` は件数を返さない作りなので `RETURNING id` で見ます。
 * `ON CONFLICT DO NOTHING` は**入らなかったとき行を返さない**ので、
 * これが「新しく出たか」の判定になります。
 */
export async function notify(input: NotifyInput): Promise<boolean> {
  const row = await queryOne(
    `INSERT INTO notifications (id, user_id, template_id, title, body, link, ref_type, ref_id, ref_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [uuidv4(), input.userId, input.templateId, input.title, input.body ?? null,
     input.link ?? null, input.refType ?? null, input.refId ?? null, input.refDate ?? ''],
  ) as { id?: string } | null;
  return !!row?.id;
}

/** まとめて出す。戻り値は**新しく出た件数** */
export async function notifyMany(inputs: NotifyInput[]): Promise<number> {
  let n = 0;
  for (const i of inputs) if (await notify(i)) n++;
  return n;
}

/**
 * その区画を**直せる人**（既定では ＋ system_admin）。
 *
 * 「経理に送る」は `budget` を editor 以上で持っている人、と読み替えます。
 * 役割の名前で探すと、役割を作り直した日に届かなくなります
 * （役割は権限の型であって、宛先の定義ではない）。
 *
 * ── ⚠️ `includeAdmins: false` を足した理由 ──────────────────
 *
 * ここは**必ず system_admin 全員を足して**いました。「誰にも届かない通知」を
 * 作らないための保険で、できごと型の通知（依頼・コメント）には要ります。
 * ですが**督促**（未入金・請求書未発行・機材返却・週報未確認）では逆に働きます —
 * 督促は「動ける人」に届いて初めて意味があるのに、system_admin は権限の管理者で
 * あって経理でも機材担当でもないことがあり、**動けない人のベルに毎日積み上がる**。
 * ユーザーの言う「ゴミ通知」の一因がここでした。
 *
 * **既定は今までどおり足します**（呼び出し側を1つも変えずに済ませるため）。
 * 督促の側だけが明示的に `{ includeAdmins: false }` を渡します。
 */
export async function usersWithPermission(
  module: string,
  min: 'reader' | 'editor' | 'manager',
  opts: { includeAdmins?: boolean } = {},
): Promise<string[]> {
  const order: Record<string, number> = { reader: 1, exporter: 1, editor: 2, manager: 3, owner: 3 };
  const rows = await queryAll(
    `SELECT u.id, p.access_level
       FROM users u
       LEFT JOIN user_permissions p ON p.user_id = u.id AND p.module = ?
      WHERE u.deleted_at IS NULL AND u.status = 'active'`,
    [module],
  );
  const need = order[min];
  // **未指定は true**（既存の呼び出しの挙動を1ミリも変えない）
  const admins = opts.includeAdmins === false ? [] : await queryAll(
    `SELECT id FROM users WHERE deleted_at IS NULL AND status = 'active' AND role = 'system_admin'`,
  );
  const set = new Set(admins.map((a) => a.id as string));
  for (const r of rows) {
    if ((order[String(r.access_level ?? '')] ?? 0) >= need) set.add(r.id as string);
  }
  return [...set];
}

export async function listFor(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
  return queryAll(
    `SELECT id, template_id, title, body, link, ref_type, ref_id, created_at, read_at
       FROM notifications
      WHERE user_id = ? ${opts.unreadOnly ? 'AND read_at IS NULL' : ''}
      ORDER BY created_at DESC
      LIMIT ?`,
    [userId, Math.min(opts.limit ?? 50, 200)],
  );
}

export async function unreadCount(userId: string): Promise<number> {
  const row = await queryOne(
    'SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = ? AND read_at IS NULL',
    [userId],
  ) as { c?: number } | null;
  return Number(row?.c ?? 0);
}

/** 既読にする。**他人の通知は動かせない**（`user_id` を条件に含める） */
export async function markRead(userId: string, ids: string[] | 'all'): Promise<void> {
  if (ids === 'all') {
    await execute('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [userId]);
    return;
  }
  if (ids.length === 0) return;
  const ph = ids.map(() => '?').join(', ');
  await execute(
    `UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND id IN (${ph})`,
    [userId, ...ids],
  );
}

/** ひな形を読む。**差し込みはここでは行わない**（呼び出し側が値を持っている） */
export async function template(id: string): Promise<{ subject: string; body: string; enabled: boolean } | null> {
  return (await queryOne(
    'SELECT subject, body, enabled FROM notification_templates WHERE id = ?', [id],
  )) as { subject: string; body: string; enabled: boolean } | null;
}

/**
 * 差し込み語を埋める。**知らない語はそのまま残す** —
 * 空にすると「・金額：」のような欠けた行になり、値が 0 円なのか
 * 差し込み漏れなのか読み手に分かりません。
 */
export function fill(text: string, vars: Record<string, string | number | null | undefined>): string {
  return text.replace(/\{([^}]+)\}/g, (whole, key) => {
    const v = vars[key];
    return v === null || v === undefined || v === '' ? whole : String(v);
  });
}
