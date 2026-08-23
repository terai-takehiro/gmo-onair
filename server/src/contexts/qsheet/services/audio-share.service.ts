// 公開音声サポート URL のトークン発行・失効・検証
//
// ── URL の形（実装設計 02-audio-share-token-impl.md §4-1 からの変更）─────
//
// 設計書は「パスの資料ID部分をトークンに差し替える」(/qsheet/audio/<token>) を
// 採っているが、実装時点で「公開画面 (AudioSupportPage) は URL の値をそのまま
// Socket.IO の room 名に使っている」(doc:<資料ID>, server/.../qsheet/socket.ts) こと
// が分かっている。パスをトークンに差し替えると、公開画面は誰もいない
// `doc:<token>` room に join してしまい、HTTP の30秒ポーリングは動き続けるので
// **画面は正常に見えるまま cue 同期だけが黙って止まる**（設計書 §10-1 が指摘する事故）。
//
// そのため実装では **URL のパスは資料IDのまま1文字も変えない**。トークンは
// `?token=` のクエリパラメータとして追加し、公開GET (public-audio.routes.ts) の
// 検証と失効判定だけに使う。Socket.IO の room キーは今までどおり資料ID
// (`getQsheetSocket(docId)` 側は無改造)。
//
// この設計変更の代償: ACCEPT_LEGACY_AUDIO_ACCESS を false にしても、
// Socket.IO の room キーは資料IDのまま（変えていない）なので、**資料IDだけ知っている
// 第三者が独自の Socket.IO クライアントを書けば cue の切り替わりタイミングだけは
// いまも拾える**（本文・マイク割当は HTTP 側の 410 で拾えない）。完全に閉じるには
// 改めてパス側の設計を見直す必要がある。詳細は
// docs/design/v4/qsheet-v4-coding/impl/02-audio-share-token-impl.md §10-1 を参照。

import crypto from 'crypto';
import { queryOne, execute } from '../../../shared/db/connection';

export interface AudioShareRow {
  token: string;
  document_id: string;
  label: string | null;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  last_seen_at: string | null;
}

/**
 * 旧URL（`?token=` 無しで資料IDだけを叩くリクエスト）を受け入れるか。
 *
 * 段階③（2026-08-23・ユーザー判断により実施）: false。トークン無しのリクエストは
 * `public-audio.routes.ts` が 410 を返すようになった。
 *
 * ⚠️ **これで閉じるのは HTTP 経路（マイク香盤・資料メタの取得）だけ。**
 * `AudioSupportPage.tsx` は `?token=` と無関係に Socket.IO の `doc:<資料ID>` room へ
 * join して `cue:sync` を受ける（ファイル冒頭のコメント参照・トークンを room キーに
 * 使うとカットオーバーの瞬間に同期が黙って止まる事故になるため、意図して資料IDのまま
 * にしてある）。つまり**資料IDだけ知っている第三者が独自の Socket.IO クライアントを
 * 書けば、いまも cue の切り替わりタイミングだけは拾える**（本文・マイク割当は拾えない）。
 * 実害は小さいと判断してこの段では見送ったが、完全に閉じるには room キーの設計変更が
 * 要る（詳細はファイル冒頭のコメントと
 * docs/design/v4/qsheet-v4-coding/impl/02-audio-share-token-impl.md §10-1）。
 * 環境変数にしない理由は CLAUDE.md「本番と検証で値が食い違うと事故る」と同じ。
 */
export const ACCEPT_LEGACY_AUDIO_ACCESS = false;

/** base64url 32文字 (192bit)。既存の資料ID (uuid v4, 122bit) より弱くしない。 */
function newToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/** その資料の「いま生きている」共有トークンを1本返す（無ければ undefined）。 */
export async function getActiveShare(documentId: string): Promise<AudioShareRow | undefined> {
  return (await queryOne(
    `SELECT * FROM qsheet_audio_shares
     WHERE document_id = $1 AND revoked_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [documentId],
  )) as AudioShareRow | undefined;
}

async function createShare(documentId: string, userId: string): Promise<AudioShareRow> {
  const token = newToken();
  await execute(
    `INSERT INTO qsheet_audio_shares (token, document_id, created_by) VALUES ($1, $2, $3)`,
    [token, documentId, userId],
  );
  const row = (await queryOne('SELECT * FROM qsheet_audio_shares WHERE token = $1', [token])) as AudioShareRow | undefined;
  if (!row) throw new Error('qsheet_audio_shares: INSERT 直後の SELECT が行を返さなかった');
  return row;
}

/**
 * 有効なトークンが無ければ新規発行、あればそれをそのまま返す（冪等）。
 * `studio.routes.ts` の `getOrCreateFeedToken()` と同じ形 — 共有ダイアログを
 * 開いた瞬間に QR を出すため、「発行ボタンを押させてから」にはしない。
 */
export async function ensureActiveShare(documentId: string, userId: string): Promise<AudioShareRow> {
  const existing = await getActiveShare(documentId);
  if (existing) return existing;
  return createShare(documentId, userId);
}

/** 有効なトークンを失効させる（無ければ何もしない）。 */
export async function revokeActiveShare(documentId: string, userId: string): Promise<void> {
  await execute(
    `UPDATE qsheet_audio_shares SET revoked_at = NOW(), revoked_by = $1
     WHERE document_id = $2 AND revoked_at IS NULL`,
    [userId, documentId],
  );
}

/** 「新しいURLにする」＝直前の有効なトークンを失効させてから新規発行。 */
export async function reissueShare(documentId: string, userId: string): Promise<AudioShareRow> {
  await revokeActiveShare(documentId, userId);
  return createShare(documentId, userId);
}

export type TokenResolution = 'valid' | 'revoked' | 'not_found';

/**
 * 公開GETが受け取った `?token=` を検証する。
 * `document_id` も一致しないと `not_found` 扱い（別の資料のトークンをすり替えて
 * 使わせない）。「失効した」と「存在しない」は呼び出し元が外から区別できないよう
 * どちらも 404/410 の別コードとして扱うだけで、詳細メッセージは出さないこと
 * （検証手順 §7-2 #4）。
 */
export async function resolvePublicToken(documentId: string, token: string): Promise<TokenResolution> {
  const row = (await queryOne(
    'SELECT document_id, revoked_at FROM qsheet_audio_shares WHERE token = $1',
    [token],
  )) as { document_id: string; revoked_at: string | null } | undefined;
  if (!row || row.document_id !== documentId) return 'not_found';
  if (row.revoked_at) return 'revoked';
  // 開かれた記録（人数は数えない・最後の1回だけ更新）。応答を待たせないよう fire-and-forget。
  execute('UPDATE qsheet_audio_shares SET last_seen_at = NOW() WHERE token = $1', [token]).catch((e) => {
    console.error('[qsheet] audio-share last_seen_at 更新に失敗', e);
  });
  return 'valid';
}
