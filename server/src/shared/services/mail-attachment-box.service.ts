/**
 * メールで届いた添付（請求書・見積書・注文書の PDF）を BOX に置く（migration 280）
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
  /** 中身（base64）。**渡されないと在り処だけの記録になる** */
  content_base64?: string | null;
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
    default: return '';
  }
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

  let buffer: Buffer;
  if (att.content_base64) {
    try {
      buffer = Buffer.from(att.content_base64, 'base64');
    } catch {
      return fail('BAD_CONTENT');
    }
    // Buffer.from は壊れた base64 でも投げずに短いものを返すので、長さで見る
    if (buffer.length === 0) return fail('BAD_CONTENT');
  } else {
    // 中身が無いときは**記録だけ残す**（あとで人が BOX に置いたときに突き合わせられる）
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
