/**
 * 編集画面がサーバーを呼ぶところ（段B・書き込み）
 *
 * ⚠️ **本来は `lib/wikiApi.ts` の `WIKI_URL` に並べます**（`client-wiki/CLAUDE.md`）。
 * 段B は「サーバー」「編集画面」「ツリーとページの操作」を同時に書いているため、
 * 同じファイルを3人で取り合わないよう、編集画面が使う道だけをここに置いています。
 * **段B の検査でまとめて `WIKI_URL` へ移してください**（移す先が1つなので、
 * 移動そのものは機械的にできます）。
 *
 * サーバーの正は `server/src/contexts/wiki/`:
 *   PATCH  /wiki/pages/:id              保存（`savePageInternal`）
 *   POST   /wiki/pages/:id/lock         編集ロックを取る（**60秒ごとの延長も同じ道**）
 *   DELETE /wiki/pages/:id/lock         放す
 *   POST   /wiki/pages/:id/lock/takeover   引き継ぐ（manager）
 *   POST   /wiki/pages/:id/lock/request    「編集を代わってほしい」と申し出る
 *   POST   /wiki/files                  画像を上げる
 *
 * 応答はこの製品の作法どおり `{ success: true, data: … }` で包まれています。
 */
import type { WikiPage } from '@gmo-onair/shared/src/wiki/types';
import api from '@/lib/api';

export const WIKI_EDIT_URL = {
  page: (id: string) => `/wiki/pages/${id}`,
  lock: (id: string) => `/wiki/pages/${id}/lock`,
  lockTakeover: (id: string) => `/wiki/pages/${id}/lock/takeover`,
  lockRequest: (id: string) => `/wiki/pages/${id}/lock/request`,
  files: '/wiki/files',
} as const;

/**
 * 本文に差し込む画像の URL。
 *
 * サーバーは `/api/v1/internal` の下にいるので、画面から見た実物の道は
 * `/api/v1/internal/wiki/files/:id` です（設計 §5-5 の `/api/v1/wiki/files/:id` は
 * 内部向けの区切りを省いた書き方）。**上げたときにサーバーが `url` を返したら、
 * そちらをそのまま使います** — 置き場所が変わってもここを直さずに済みます。
 */
export function wikiFileUrl(id: string): string {
  return `/api/v1/internal/wiki/files/${id}`;
}

/** 保存で送るもの。**渡したものだけ**が書き換わる（サーバーの `SavePageInput` と同じ） */
export interface WikiSavePayload {
  title?: string;
  body_md?: string;
  status?: 'draft' | 'published' | 'archived';
  /** 画面が最後に受け取った `updated_at`。食い違えば 409 */
  expected_updated_at?: string;
}

/** `{ success, data }` の包みを外す */
function unwrap<T>(res: { data: { success?: boolean; data: T } }): T {
  return res.data.data;
}

export async function savePage(pageId: string, payload: WikiSavePayload): Promise<WikiPage> {
  return unwrap<WikiPage>(await api.patch(WIKI_EDIT_URL.page(pageId), payload));
}

/* ── 編集ロック ───────────────────────────────────────────── */

/** サーバーの `WikiLockState`（`services/wiki-lock.service.ts`）と同じ形 */
export interface WikiLockState {
  page_id?: string;
  locked_by: string | null;
  locked_by_name: string | null;
  locked_at: string | null;
  lock_requested_by: string | null;
  lock_requested_by_name: string | null;
  lock_requested_at?: string | null;
}

export interface WikiLockResult {
  /** 取れた（＝自分が保持者になった）か */
  acquired: boolean;
  lock: WikiLockState;
}

const EMPTY_LOCK: WikiLockState = {
  locked_by: null,
  locked_by_name: null,
  locked_at: null,
  lock_requested_by: null,
  lock_requested_by_name: null,
};

/**
 * 応答からロックの状態を取り出す。
 *
 * ⚠️ 「取る」は `{ acquired, lock }`、「放す・引き継ぐ・申し出る」は状態だけ、と
 * 形が2通りあります。**どちらで来ても読めるようにしてあります** — ここが割れると、
 * 編集できるのに読み取り専用に見える（またはその逆）という、画面を見ても
 * 原因の分からない不具合になります。
 */
function toLock(data: unknown): WikiLockState {
  const d = (data ?? {}) as Record<string, unknown>;
  const inner = (d.lock ?? d.page ?? d) as Record<string, unknown>;
  return {
    page_id: typeof inner.page_id === 'string' ? inner.page_id : undefined,
    locked_by: (inner.locked_by as string | null) ?? null,
    locked_by_name: (inner.locked_by_name as string | null) ?? null,
    locked_at: (inner.locked_at as string | null) ?? null,
    lock_requested_by: (inner.lock_requested_by as string | null) ?? null,
    lock_requested_by_name: (inner.lock_requested_by_name as string | null) ?? null,
    lock_requested_at: (inner.lock_requested_at as string | null) ?? null,
  };
}

/** 取る（**60秒ごとの延長も同じ道**）。取れなくても例外にはしない */
export async function acquireLock(pageId: string): Promise<WikiLockResult> {
  const data = unwrap<unknown>(await api.post(WIKI_EDIT_URL.lock(pageId), {}));
  const d = (data ?? {}) as Record<string, unknown>;
  return { acquired: d.acquired !== false, lock: toLock(data) };
}

/** 放す。自分が保持者のときだけ効く（保持者でなくても呼んでよい＝空振りするだけ） */
export async function releaseLock(pageId: string): Promise<WikiLockState> {
  const data = unwrap<unknown>(await api.delete(WIKI_EDIT_URL.lock(pageId)));
  return toLock(data ?? EMPTY_LOCK);
}

/** 引き継ぐ（manager） */
export async function takeoverLock(pageId: string): Promise<WikiLockState> {
  return toLock(unwrap<unknown>(await api.post(WIKI_EDIT_URL.lockTakeover(pageId), {})));
}

/** 「編集を代わってほしい」と申し出る */
export async function requestLockHandoff(pageId: string): Promise<WikiLockState> {
  return toLock(unwrap<unknown>(await api.post(WIKI_EDIT_URL.lockRequest(pageId), {})));
}

/* ── 画像 ─────────────────────────────────────────────────── */

export interface WikiUploadedFile {
  id: string;
  /** 本文に差し込む URL。サーバーが返さないときは `wikiFileUrl(id)` を使う */
  url: string;
}

/**
 * 画像を1枚上げる。`pageId` を添えると、その画像はページと同じ範囲の人にだけ配られる
 * （サーバーの `GET /wiki/files/:id` がページの閲覧可否を見る）。
 *
 * ⚠️ `Content-Type` を手で書かないこと — `createApi` の受け口が FormData のときに
 * 外します（書くと境界の文字が付かず、ファイルが丸ごと消えます）。
 */
export async function uploadWikiFile(file: File, pageId?: string): Promise<WikiUploadedFile> {
  const form = new FormData();
  form.append('file', file);
  if (pageId) form.append('page_id', pageId);
  const data = unwrap<Record<string, unknown>>(await api.post(WIKI_EDIT_URL.files, form));
  const id = String(data?.id ?? '');
  const url = typeof data?.url === 'string' && data.url ? data.url : wikiFileUrl(id);
  return { id, url };
}

/* ── サーバーからのエラーを見分ける ───────────────────────── */

interface ApiErrorShape {
  response?: {
    status?: number;
    data?: { error?: { code?: string; message?: string; locked_by_name?: string | null } };
  };
}

/** 他の人が先に保存していた（楽観ロックの衝突） */
export function isConflictError(err: unknown): boolean {
  const e = err as ApiErrorShape;
  return e?.response?.status === 409 && e?.response?.data?.error?.code === 'CONFLICT';
}

/** 他の人が編集ロックを持っている */
export function isLockedError(err: unknown): boolean {
  const e = err as ApiErrorShape;
  return e?.response?.status === 409 && e?.response?.data?.error?.code === 'LOCKED';
}

/** 編集ロックを持っている人の名前（分からなければ null） */
export function lockedByNameOf(err: unknown): string | null {
  return (err as ApiErrorShape)?.response?.data?.error?.locked_by_name ?? null;
}
