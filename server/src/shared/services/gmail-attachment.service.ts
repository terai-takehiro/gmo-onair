/**
 * Gmail に付いてきた添付を**サーバーが自分で取りに行く**（2026-09）
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * メールの仕分けを **Claude のルーティン**（定期実行）で回すことにしたため、
 * 取込は Gmail コネクタ経由になりました。ところが **Gmail コネクタは
 * 添付の「中身」を返しません** — 返ってくるのは
 *
 *   { filename: '請求書.pdf', id: 'ANGjdJ9…', mimeType: 'application/pdf' }
 *
 * の**名前と id だけ**です（`get_message` を FULL_CONTENT で呼んでも同じ。実測）。
 * つまり **AI の手元に PDF のバイト列は来ません**。
 *
 * そこで、AI には**在り処（メールの id ＋ 添付の id）だけ**を渡してもらい、
 * **サーバーが Gmail API から取りに行きます**。取った中身は
 * `mail-attachment-box.service.ts` が BOX へ置きます。
 *
 * ⚠️ **添付の id は呼ぶたびに変わります**（同じ添付を2回引いたら別の文字列。実測）。
 * だから**保存して後で使うことはできません** — 取込のその場で取りに行く必要があります。
 * 取り損ねたときは、メールの id は変わらないので**メールから引き直す**しかありません。
 *
 * ── 誰の権限で取りに行くか ──────────────────────────────────
 *
 * マイカレンダーの Google 連携（`personal_google_accounts`・migration 123）を
 * そのまま使います。**新しい認証の仕組みを作りません**（refresh_token の暗号化・
 * access_token の更新は `google-calendar.service.ts` に既にあります）。
 *
 * 取りに行くアカウントは `MAIL_INTAKE_GOOGLE_EMAIL` で指定します
 * （指定が無ければ、連携している中で一番最近使われたアカウント）。
 *
 * ⚠️ **`gmail.readonly` のスコープが要ります。** カレンダー連携だけを済ませた
 * アカウントでは 403 になります。その人が設定画面から**連携し直す**と付きます
 * （`google-oauth.routes.ts` の `SCOPE` に足してあります）。
 * 付いていないときは**握り潰さず理由を返します** — 黙って落とすと
 * 「原本が入ったつもりでどこにも無い」状態になります。
 */
import axios from 'axios';
import { queryOne } from '../db/connection';
import { getAccessTokenForAccount, isGoogleConfigured } from '../../contexts/schedule/services/google-calendar.service';

const GMAIL_ATTACHMENT_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';

/** 取りに行けなかった理由。**画面がそのまま文言に直せる粒度**にする */
export type GmailFetchFailure =
  /** この環境は Google 連携の設定が無い（検証・手元） */
  | 'NO_GMAIL_ACCESS'
  /** 連携はあるが `gmail.readonly` を許可していない（連携し直しが要る） */
  | 'NO_GMAIL_SCOPE'
  /** Gmail が応答しない・そのメールがもう無い */
  | 'GMAIL_UNAVAILABLE';

export interface GmailFetchResult {
  buffer: Buffer | null;
  failure: GmailFetchFailure | null;
}

interface AccountRow {
  id: string;
  user_id: string;
  google_email: string | null;
  refresh_token_enc: string;
  access_token_enc: string | null;
  token_expiry: string | Date | null;
}

/**
 * 取りに行くアカウント。**メールボックスの持ち主**を選ぶ。
 *
 * `MAIL_INTAKE_GOOGLE_EMAIL` があればその人。無ければ**最後に同期したアカウント** —
 * 「連携している人が1人しかいない」いまの運用ではそれで当たります。
 * ⚠️ **誰でもいいわけではありません** — 別の人の権限で引くと、その人に見えない
 * メールの添付は取れません（403 ではなく 404 で返り、理由が分かりにくくなります）。
 */
async function pickAccount(): Promise<AccountRow | null> {
  const email = process.env.MAIL_INTAKE_GOOGLE_EMAIL?.trim();
  const row = email
    ? await queryOne(
        `SELECT id, user_id, google_email, refresh_token_enc, access_token_enc, token_expiry
           FROM personal_google_accounts
          WHERE LOWER(google_email) = LOWER(?) AND enabled = 1 AND deleted_at IS NULL`,
        [email],
      )
    : await queryOne(
        `SELECT id, user_id, google_email, refresh_token_enc, access_token_enc, token_expiry
           FROM personal_google_accounts
          WHERE enabled = 1 AND deleted_at IS NULL
          ORDER BY last_synced_at DESC NULLS LAST, updated_at DESC
          LIMIT 1`,
      );
  return (row as AccountRow | undefined) ?? null;
}

export function isGmailIntakeConfigured(): boolean {
  return isGoogleConfigured();
}

/**
 * 添付を1つ取りに行く。**投げません**（理由を返します）。
 *
 * @param messageId    Gmail のメール id（AI が `get_message` で見たもの）
 * @param attachmentId 添付の id。**その場で取った新しいもの**を渡すこと
 */
export async function fetchGmailAttachment(
  messageId: string, attachmentId: string,
): Promise<GmailFetchResult> {
  if (!isGoogleConfigured()) return { buffer: null, failure: 'NO_GMAIL_ACCESS' };
  const account = await pickAccount();
  if (!account) return { buffer: null, failure: 'NO_GMAIL_ACCESS' };

  let token: string;
  try {
    token = await getAccessTokenForAccount(account);
  } catch (err) {
    console.error('[gmail-attachment] token refresh failed:', (err as Error).message);
    return { buffer: null, failure: 'NO_GMAIL_ACCESS' };
  }

  try {
    const res = await axios.get(
      `${GMAIL_ATTACHMENT_URL}/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 30_000 },
    );
    const data = (res.data as { data?: string }).data;
    if (!data) return { buffer: null, failure: 'GMAIL_UNAVAILABLE' };
    // Gmail は **base64url**（`-` `_`・パディング無し）で返す。素の base64 として
    // 読むと壊れた PDF になり、**開けるまで誰も気づけない**
    return { buffer: Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64'), failure: null };
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === 401 || status === 403) {
      console.warn('[gmail-attachment] no gmail.readonly scope — the account must re-authorize');
      return { buffer: null, failure: 'NO_GMAIL_SCOPE' };
    }
    console.error('[gmail-attachment] fetch failed:', (err as Error).message);
    return { buffer: null, failure: 'GMAIL_UNAVAILABLE' };
  }
}
