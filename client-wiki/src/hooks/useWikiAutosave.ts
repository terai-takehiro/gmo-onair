/**
 * 自動保存（打つのを止めて 1.5 秒で `PATCH /wiki/pages/:id`）
 *
 * ── いちばん大事なこと ──────────────────────────────────────
 *
 * **保存の応答で本文の値を書き戻しません。** 書き戻すと、変換中の文字が消え、
 * カーソルが文末へ飛びます（1.5 秒おきに起きるので、日本語では実質入力できません）。
 * 本文と題名の正は画面の手元の state で、サーバーから返るもののうちここが使うのは
 * `updated_at`（次の保存に添える突き合わせの値）だけです。
 *
 * ── 送るもの ────────────────────────────────────────────────
 *
 * 変わった項目だけを送ります（サーバーは `undefined` の項目を触りません）。
 * 題名だけ直したときに本文まで送ると、本文の履歴が1版増えるだけで中身は同じ、
 * という版が並びます。
 *
 * ── 衝突（409） ─────────────────────────────────────────────
 *
 * `expected_updated_at` が食い違うと 409 が返ります（他のタブ・他の人が先に保存した）。
 * **黙って上書きし直しません。** 画面は読み込み直しを促し、打った文字はそのまま残します
 * （読み込み直すまでは保存を止めます）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyApiError, notifyError } from '@gmo-onair/shared/src/client/notify';
import type { WikiPage } from '@gmo-onair/shared/src/wiki/types';
import {
  isConflictError,
  isLockedError,
  lockedByNameOf,
  savePage,
  type WikiSavePayload,
} from './wikiEditApi';

/** 打つのが止まってから保存するまで（設計 §6-③） */
const AUTOSAVE_DELAY = 1_500;

export type WikiSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

export interface WikiDraft {
  title: string;
  body: string;
}

export interface WikiAutosave {
  state: WikiSaveState;
  /** 最後に保存が通った時刻（ヘッダーの「保存しました 14:02」） */
  savedAt: Date | null;
  /** 読み込んだページで、突き合わせの値と「保存済みの中身」を置き直す */
  reset: (page: WikiPage) => void;
  /** 打つたびに呼ぶ。1.5 秒後に保存する */
  queue: (draft: WikiDraft) => void;
  /**
   * 値は受け取るが、保存の待ちは進めない（**日本語の変換の途中**）。
   * 変換の途中で保存すると、履歴に読みだけの版・ローマ字の版が残ります。
   */
  hold: (draft: WikiDraft) => void;
  /** いますぐ保存する（公開する・画面を離れる）。保存が通れば true */
  saveNow: (extra?: Pick<WikiSavePayload, 'status'>) => Promise<boolean>;
}

export function useWikiAutosave(
  pageId: string | undefined,
  opts: { enabled: boolean; onSaved?: (page: WikiPage) => void },
): WikiAutosave {
  const [state, setState] = useState<WikiSaveState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  /** 最後に保存が通った中身。これと違うところだけを送る */
  const savedRef = useRef<WikiDraft>({ title: '', body: '' });
  /** 画面が最後に受け取った `updated_at` */
  const expectedRef = useRef<string | undefined>(undefined);
  /** いま画面に出ている中身（まだ送っていないかもしれない） */
  const draftRef = useRef<WikiDraft>({ title: '', body: '' });
  /**
   * **いま手元にある中身が、どのページのものか。**
   *
   * ⚠️ 引数の `pageId` ではなくこちらを使って送ります。編集画面から別のページの
   * 編集画面へ移ると URL の id だけが先に変わり、**まだ送っていない前のページの
   * 本文を、次のページへ書き込んでしまいます**（画面は同じまま `:id` だけが
   * 変わるので、部品は作り直されません）。`reset()` が読み込んだページの id を
   * ここに置き、ページが変わる瞬間に前のぶんを送り切ってから空にします。
   */
  const draftPageRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * 保存を1本の列にする（前の保存が終わってから次を送る）。
   *
   * ⚠️ 「送っている間は送らない」だけにすると、**送っている最中に押した
   * 「公開する」が落ちます**（あとから来た保存に `status` が乗らないため）。
   * 列に並べれば、前の保存が終わってから必ず自分の番が回ってきます。
   */
  const chainRef = useRef<Promise<boolean>>(Promise.resolve(true));
  /** 衝突したら、読み込み直すまで保存を止める（上書きの取り合いを繰り返さない） */
  const haltedRef = useRef(false);
  const mountedRef = useRef(true);
  const enabledRef = useRef(opts.enabled);
  enabledRef.current = opts.enabled;
  const onSavedRef = useRef(opts.onSaved);
  onSavedRef.current = opts.onSaved;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const reset = useCallback((page: WikiPage) => {
    savedRef.current = { title: page.title, body: page.body_md ?? '' };
    draftRef.current = { ...savedRef.current };
    draftPageRef.current = page.id;
    expectedRef.current = page.updated_at;
    haltedRef.current = false;
    if (timer.current) clearTimeout(timer.current);
    setState('idle');
  }, []);

  /** いま送るべきものを組む。送るものが無ければ null */
  const payloadOf = useCallback((extra?: Pick<WikiSavePayload, 'status'>): WikiSavePayload | null => {
    const draft = draftRef.current;
    const saved = savedRef.current;
    const payload: WikiSavePayload = {};
    const title = draft.title.trim();
    // 題が空のままサーバーへ送ると 400 で弾かれる。空のときは題だけ送らない
    if (title && title !== saved.title) payload.title = title;
    if (draft.body !== saved.body) payload.body_md = draft.body;
    if (extra?.status) payload.status = extra.status;
    if (Object.keys(payload).length === 0) return null;
    if (expectedRef.current) payload.expected_updated_at = expectedRef.current;
    return payload;
  }, []);

  const send = useCallback(async (
    target: string,
    extra?: Pick<WikiSavePayload, 'status'>,
  ): Promise<boolean> => {
    if (!enabledRef.current || haltedRef.current) return false;
    const payload = payloadOf(extra);
    if (!payload) {
      if (mountedRef.current) setState((s) => (s === 'dirty' ? 'idle' : s));
      return true;
    }
    // 送った中身を覚えておく（応答を待つ間に打たれた分と混ぜない）
    const sent = { ...draftRef.current };
    if (mountedRef.current) setState('saving');
    try {
      const page = await savePage(target, payload);
      savedRef.current = {
        title: payload.title !== undefined ? sent.title.trim() : savedRef.current.title,
        body: payload.body_md !== undefined ? sent.body : savedRef.current.body,
      };
      expectedRef.current = page.updated_at;
      if (mountedRef.current) {
        setSavedAt(new Date());
        setState('saved');
      }
      onSavedRef.current?.(page);
      return true;
    } catch (err) {
      if (isConflictError(err)) {
        haltedRef.current = true;
        if (mountedRef.current) setState('conflict');
        notifyError('他の人が先に保存しました', {
          description: '打った内容はこの画面に残っています。読み込み直してから、もう一度貼り直してください。',
        });
      } else if (isLockedError(err)) {
        if (mountedRef.current) setState('error');
        notifyError(`${lockedByNameOf(err) ?? '他のユーザー'} さんが編集中です`, {
          description: 'このページはいま読むだけになっています。「編集を代わってほしい」と申し出られます。',
        });
      } else {
        if (mountedRef.current) setState('error');
        notifyApiError('保存できませんでした', err, '通信が不安定かもしれません。しばらくして打ち直すと保存し直します。');
      }
      return false;
    }
  }, [payloadOf]);

  /**
   * 列の最後に並べる。前の保存が終わってから、そのときの中身で送る。
   * **送り先は並べた時点で決める** — 待っている間にページが切り替わっても、
   * 中身と送り先が入れ替わらないようにする。
   */
  const run = useCallback((extra?: Pick<WikiSavePayload, 'status'>): Promise<boolean> => {
    const target = draftPageRef.current;
    if (!target) return Promise.resolve(false);
    const next = chainRef.current.catch(() => false).then(() => send(target, extra));
    chainRef.current = next;
    return next;
  }, [send]);

  /**
   * ページが切り替わるとき・画面から外れるときに、**まだ送っていない分を送り切る**。
   * 1.5 秒を待たずに出ていけるようにするのと、次のページへ前の本文を持ち越さないため。
   */
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (draftPageRef.current) void run();
    draftPageRef.current = null;
  }, [pageId, run]);

  const queue = useCallback((draft: WikiDraft) => {
    draftRef.current = draft;
    if (!enabledRef.current || haltedRef.current) return;
    const saved = savedRef.current;
    if (draft.title.trim() === saved.title && draft.body === saved.body) return;
    setState((s) => (s === 'saving' ? s : 'dirty'));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void run(); }, AUTOSAVE_DELAY);
  }, [run]);

  const hold = useCallback((draft: WikiDraft) => {
    draftRef.current = draft;
    if (timer.current) clearTimeout(timer.current);
    if (!enabledRef.current || haltedRef.current) return;
    setState((s) => (s === 'saving' ? s : 'dirty'));
  }, []);

  const saveNow = useCallback((extra?: Pick<WikiSavePayload, 'status'>) => {
    if (timer.current) clearTimeout(timer.current);
    return run(extra);
  }, [run]);

  return { state, savedAt, reset, queue, hold, saveNow };
}
