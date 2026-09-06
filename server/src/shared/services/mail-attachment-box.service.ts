/**
 * メールで届いた添付（請求書・見積書・注文書の PDF）を BOX に置く（migration 281）
 *
 * ── なぜ BOX か ─────────────────────────────────────────────
 *
 * 届いた PDF は**原本**です。DB に中身ごと入れるとバックアップが重くなり
 * （請求書 100件/月 × 1MB で年 10GB 規模）、復元にも時間がかかります。
 * 全社で見るのも BOX のほうが自然なので、**在り処だけ DB に持ちます**。
 *
 * ── どこに入れるか ──────────────────────────────────────────
 *
 * 受け取った時点では**まだどの案件か決まっていません**（決めるのは人）。
 * なので案件フォルダには入れられません。共通の受け皿を1つ作り、
 * **受信月ごとのサブフォルダ**に置きます。
 *
 *   <受け皿>/2026-09/20260904_カイロスマーケティング_請求書.pdf
 *
 * 受け皿は `BOX_MAIL_INTAKE_FOLDER_ID` があればそれ、無ければ
 * 案件フォルダの親（`BOX_PROJECT_PARENT_FOLDER_ID`）の下に
 * `MAIL_INTAKE_FOLDER_NAME` を作ります。
 *
 * ── 失敗は握り潰さない ──────────────────────────────────────
 *
 * **取込そのものは止めません。** BOX が落ちている日に請求書を記録できなく
 * なるのは本末転倒です（`box.ts` の「BOX 障害が業務をブロックしない」方針）。
 * ただし**入らなかったことは必ず理由付きで返し**、DB の
 * `finance_doc_attachments.failure_reason` に残します。
 * 画面はそれを見て「BOX に入っていません」と言います。
 * 黙って握り潰すと、**入ったつもりで原本がどこにも無い**状態になります。
 */
import { createHash } from 'node:crypto';
import { isBoxConfigured, ensureSubfolder, uploadToFolder, getBoxFolderUrl } from './box';
import { fetchGmailAttachment, type GmailFetchFailure } from './gmail-attachment.service';

/** 受け皿フォルダの名前。**画面にもこの名前を出す**（探しに行けるように） */
export const MAIL_INTAKE_FOLDER_NAME = '受領書類（メール）';

/** 1ファイルの上限。請求書の PDF は普通 1MB 以下で、10MB を超えるものは中身が違う */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** 1通あたりの添付の数。これを超えるものは請求書のメールではない */
export const MAX_ATTACHMENTS_PER_DOC = 10;

/**
 * 受け取ってよい種類。**実行できるものを受け取らない** —
 * MCP 経由で任意のファイルを BOX に置ける口になってはいけない。
 */
const ALLOWED_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'xlsx', 'xls', 'csv', 'zip'] as const;

export type AttachmentFailure =
  /** この環境は BOX につないでいない（検証・手元） */
  | 'NOT_CONFIGURED'
  /** Gmail から中身を取りに行けなかった（`gmail-attachment.service.ts` の理由をそのまま） */
  | GmailFetchFailure
  /** 受け皿フォルダを用意できなかった */
  | 'NO_FOLDER'
  /** BOX が応答しない・アップロードに失敗した */
  | 'UNAVAILABLE'
  /** 大きすぎる */
  | 'TOO_LARGE'
  /** 受け取らない種類 */
  | 'BAD_TYPE'
  /** base64 が壊れている */
  | 'BAD_CONTENT';

export interface IncomingAttachment {
  filename: string;
  mime_type?: string | null;
  /** 中身（base64）。手元にバイト列がある呼び出し（VPS の取込など）はこちら */
  content_base64?: string | null;
  /**
   * **中身の在り処（Gmail）。**
   *
   * Claude のルーティンから取り込むときはこちらです。
   * **Gmail コネクタは添付の中身を返さない**（名前と id だけ。実測）ので、
   * AI は在り処を渡し、**サーバーが Gmail API から取りに行きます**。
   *
   * ⚠️ **`gmail_attachment_id` は呼ぶたびに変わります。**
   * その場で取った新しいものを渡すこと（保存して後で使えません）。
   */
  gmail_message_id?: string | null;
  gmail_attachment_id?: string | null;
}

export interface StoredAttachment {
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  content_sha256: string | null;
  box_file_id: string | null;
  box_url: string | null;
  stored_at: Date | null;
  failure_reason: AttachmentFailure | null;
}

export function attachmentFailureLabel(reason: string | null | undefined): string {
  switch (reason) {
    case 'NOT_CONFIGURED': return 'この環境は BOX につないでいないため保存していません';
    case 'NO_FOLDER': return `BOX に「${MAIL_INTAKE_FOLDER_NAME}」フォルダを用意できませんでした`;
    case 'UNAVAILABLE': return 'BOX が応答しなかったため保存できませんでした';
    case 'TOO_LARGE': return `${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB を超えるため保存していません`;
    case 'BAD_TYPE': return `${ALLOWED_EXT.join(' / ')} 以外は保存していません`;
    case 'BAD_CONTENT': return '中身を読み取れませんでした';
    case 'NO_GMAIL_ACCESS': return 'Gmail から取りに行けませんでした（Google 連携が無い環境です）';
    case 'NO_GMAIL_SCOPE': return 'Gmail の読み取りが許可されていません（設定画面から Google 連携をやり直してください）';
    case 'GMAIL_UNAVAILABLE': return 'Gmail が応答しなかったため取りに行けませんでした';
    default: return '';
  }
}

/**
 * base64 を**厳しく**読む。読めなければ `null`（黙ってゴミを返さない）。
 *
 * 素の base64 と URL 用（`-` `_`）の両方を受けます。改行は捨てます
 * （メールの添付は 76 文字ごとに折り返して届くのが普通）。
 */
export function decodeStrictBase64(input: string): Buffer | null {
  const cleaned = input.replace(/[\r\n\s]/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (cleaned.length === 0) return null;
  // 使える文字だけ（詰め物は上で落としてある）
  if (!/^[A-Za-z0-9+/]+$/.test(cleaned)) return null;
  /*
    **詰め物はこちらで足します。** 呼び出し側が詰め物を省いた base64 を渡すことは
    普通にあり（URL 用の書き方はそもそも詰め物を付けない）、そこで弾くと
    **正しい原本を「読めません」で落とします**。
    ⚠️ 余り1文字は base64 としてありえないので、そこは弾きます。
  */
  const rem = cleaned.length % 4;
  if (rem === 1) return null;
  const padded = rem === 0 ? cleaned : cleaned + '='.repeat(4 - rem);
  const buf = Buffer.from(padded, 'base64');
  // **戻して同じになるか。** ここまで通っても、知らない文字が落とされたものは弾ける
  if (buf.toString('base64').replace(/=+$/, '') !== cleaned) return null;
  return buf;
}

/** ファイル名から拡張子（小文字・ドット無し） */
function extOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i < 0 ? '' : filename.slice(i + 1).toLowerCase();
}

/**
 * BOX に置けるファイル名にする。
 * **パス区切りを落とす** — `../` を含む名前をそのまま渡さない。
 */
export function safeFilename(filename: string): string {
  const base = filename.replace(/[\\/]+/g, '_').replace(/^\.+/, '').trim();
  return (base || 'attachment').slice(0, 200);
}

/** 受け皿フォルダ（受信月まで）。用意できなければ null */
async function ensureIntakeFolder(month: string): Promise<{ id: string } | null> {
  const direct = process.env.BOX_MAIL_INTAKE_FOLDER_ID?.trim();
  let rootId = direct || null;
  if (!rootId) {
    const parent = process.env.BOX_PROJECT_PARENT_FOLDER_ID?.trim();
    if (!parent) return null;
    const root = await ensureSubfolder(parent, MAIL_INTAKE_FOLDER_NAME);
    if (!root) return null;
    rootId = root.id;
  }
  const byMonth = await ensureSubfolder(rootId, month);
  return byMonth ? { id: byMonth.id } : null;
}

/**
 * 添付を1つ BOX に置く。**投げません**（理由を返します）。
 *
 * @param month 受信月 `YYYY-MM`。分からなければ今日の月を渡すこと
 * @param prefix ファイル名の頭に付ける文字列（受信日＋取引先など）。無くてもよい
 */
export async function storeAttachment(
  att: IncomingAttachment, month: string, prefix?: string | null,
): Promise<StoredAttachment> {
  const filename = safeFilename(att.filename);
  const base: StoredAttachment = {
    filename,
    mime_type: att.mime_type ?? null,
    size_bytes: null,
    content_sha256: null,
    box_file_id: null,
    box_url: null,
    stored_at: null,
    failure_reason: null,
  };
  const fail = (reason: AttachmentFailure): StoredAttachment => ({ ...base, failure_reason: reason });

  if (!ALLOWED_EXT.includes(extOf(filename) as (typeof ALLOWED_EXT)[number])) return fail('BAD_TYPE');

  /*
    中身の取り方は2通り。**どちらも無ければ記録だけ残します**
    （あとで人が BOX に置いたときに突き合わせられる）。

     ① `content_base64` … 呼び出し側の手元にバイト列がある
     ② `gmail_*_id`     … 在り処だけ渡され、**サーバーが Gmail から取りに行く**
        （Claude のルーティンはこちら。Gmail コネクタは中身を返さないため）
  */
  let buffer: Buffer;
  if (att.content_base64) {
    /*
      ⚠️ **`Buffer.from(s, 'base64')` は壊れた文字列でも投げません。**
      知らない文字を黙って捨てて**それらしい長さのゴミ**を返します
      （`'not base64'` → 6 バイト。実測）。長さだけ見ると通ってしまい、
      **壊れた PDF を BOX に上げて「保存しました」と報告します** — 原本が
      壊れていることに、誰かが開くまで気づけません。
      **使える文字だけか**を先に見て、**戻して同じになるか**まで確かめます。
    */
    const decoded = decodeStrictBase64(att.content_base64);
    if (!decoded || decoded.length === 0) return fail('BAD_CONTENT');
    buffer = decoded;
  } else if (att.gmail_message_id && att.gmail_attachment_id) {
    const got = await fetchGmailAttachment(att.gmail_message_id, att.gmail_attachment_id);
    if (!got.buffer) return fail(got.failure ?? 'BAD_CONTENT');
    buffer = got.buffer;
  } else {
    return fail('BAD_CONTENT');
  }

  base.size_bytes = buffer.length;
  base.content_sha256 = createHash('sha256').update(buffer).digest('hex');
  if (buffer.length > MAX_ATTACHMENT_BYTES) return { ...base, failure_reason: 'TOO_LARGE' };

  if (!isBoxConfigured()) return { ...base, failure_reason: 'NOT_CONFIGURED' };

  const folder = await ensureIntakeFolder(month);
  if (!folder) return { ...base, failure_reason: 'NO_FOLDER' };

  const named = prefix ? `${safeFilename(prefix)}_${filename}` : filename;
  try {
    const stored = await uploadToFolder(folder.id, named, buffer);
    return {
      ...base,
      filename: named,
      box_file_id: stored.id,
      box_url: `https://app.box.com/file/${stored.id}`,
      stored_at: new Date(),
      failure_reason: null,
    };
  } catch (err) {
    console.error(`[mail-attachment] failed to store '${named}':`, (err as Error).message);
    return { ...base, filename: named, failure_reason: 'UNAVAILABLE' };
  }
}

/** 受け皿フォルダの URL（画面の案内用）。設定していなければ null */
export function mailIntakeFolderUrl(): string | null {
  const direct = process.env.BOX_MAIL_INTAKE_FOLDER_ID?.trim();
  return direct ? getBoxFolderUrl(direct) : null;
}
