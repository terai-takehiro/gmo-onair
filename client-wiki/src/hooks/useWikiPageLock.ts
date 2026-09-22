/**
 * ページ単位の編集ロック（設計 §6-③・§10-4。運営マニュアルと同じ規則）
 *
 * - 開いたら取る。取れたら **60秒ごとに同じ道を呼んで延ばす**（サーバーは
 *   「取る」と「延ばす」を1本の口で兼ねている）
 * - 取れなかったら読み取り専用にして、**15秒ごとに空くのを待つ**（通知は作らない）
 * - 画面を離れたら放す
 * - manager は引き継げる。持っていない人は「編集を代わってほしい」と申し出られる
 *
 * ⚠️ **手が止まっているあいだはハートビートを送りません。**
 * 送り続けると `locked_at` が永久に新しいままになり、サーバーが決めた
 * 「10分手が止まれば空き」が一度も成立しません（開いたタブが他の人を締め出す）。
 * 制作技術支援で実際に指摘されて直した点です（`useManualEditLock.ts`）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyError, notifyWarning } from '@gmo-onair/shared/src/client/notify';
import { acquireLock, releaseLock, requestLockHandoff, takeoverLock } from './wikiEditApi';

/** 延ばす間隔（サーバーの10分より十分短くする） */
const HEARTBEAT_MS = 60_000;
/** 取れなかったときに、空いていないか見に行く間隔 */
const RETRY_MS = 15_000;
/** これより長く手が止まったら延ばさない（サーバーの `WIKI_LOCK_STALE_MS` と同じ長さ） */
const IDLE_MS = 10 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'wheel'] as const;

export interface WikiPageLock {
  /** 最初の応答がまだ来ていない（読み取り専用の表示が一瞬だけ出るのを防ぐ） */
  checking: boolean;
  /** 自分がいま編集できる状態か */
  held: boolean;
  /** 他の人が持っているときの名前 */
  heldByName: string | null;
  /** 自分が持っているとき、交代を申し出ている人の名前 */
  requestedByName: string | null;
  /** 自分がすでに交代を申し出たか */
  handoffRequested: boolean;
  requesting: boolean;
  requestHandoff: () => void;
  takingOver: boolean;
  takeover: () => void;
}

export function useWikiPageLock(
  pageId: string | undefined,
  currentUserId: string | null | undefined,
  enabled: boolean,
): WikiPageLock {
  const [checking, setChecking] = useState(true);
  const [held, setHeld] = useState(false);
  const [heldByName, setHeldByName] = useState<string | null>(null);
  const [requestedByName, setRequestedByName] = useState<string | null>(null);
  const [handoffRequested, setHandoffRequested] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [takingOver, setTakingOver] = useState(false);

  const mountedRef = useRef(true);
  const heldRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 1周期分の処理。引き継いだ直後に外から1回だけ回したいので ref で持つ */
  const tickRef = useRef<() => void>(() => {});
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    mountedRef.current = true;
    heldRef.current = false;

    if (!enabled || !pageId) {
      setChecking(false);
      setHeld(false);
      setHeldByName(null);
      setRequestedByName(null);
      setHandoffRequested(false);
      return () => { mountedRef.current = false; };
    }

    setChecking(true);
    lastActivityRef.current = Date.now();

    const schedule = (ms: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => tickRef.current(), ms);
    };

    const tick = () => {
      // 手が止まっているあいだは延ばさない（サーバーの10分を働かせる）
      if (heldRef.current && Date.now() - lastActivityRef.current > IDLE_MS) {
        schedule(HEARTBEAT_MS);
        return;
      }
      acquireLock(pageId)
        .then(({ acquired, lock }) => {
          if (!mountedRef.current) return;
          const wasHeld = heldRef.current;
          heldRef.current = acquired;
          setChecking(false);
          setHeld(acquired);
          if (acquired) {
            setHeldByName(null);
            setHandoffRequested(false);
            const by = lock.lock_requested_by;
            setRequestedByName(by && by !== currentUserId ? lock.lock_requested_by_name : null);
            schedule(HEARTBEAT_MS);
          } else {
            setRequestedByName(null);
            setHeldByName(lock.locked_by_name);
            setHandoffRequested(lock.lock_requested_by === currentUserId);
            if (wasHeld) {
              notifyWarning(`${lock.locked_by_name || '他のユーザー'} さんが編集を引き継ぎました`, {
                description: '打った内容はこの画面に残っています。保存はいったん止まります。',
              });
            }
            schedule(RETRY_MS);
          }
        })
        .catch(() => {
          // 一時的な通信の失敗でロックの状態を動かさない（次の周期に任せる）
          if (!mountedRef.current) return;
          setChecking(false);
          schedule(heldRef.current ? HEARTBEAT_MS : RETRY_MS);
        });
    };
    tickRef.current = tick;
    tick();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      // 放せるのは自分が保持者のときだけ、とサーバーが決めている（空振りしてよい）
      void releaseLock(pageId).catch(() => undefined);
    };
  }, [pageId, enabled, currentUserId]);

  // 実際に操作した時刻を覚える（延ばすかどうかの判定に使う）
  useEffect(() => {
    if (!enabled) return undefined;
    lastActivityRef.current = Date.now();
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
    };
  }, [enabled]);

  const requestHandoff = useCallback(() => {
    if (!pageId || requesting) return;
    setRequesting(true);
    requestLockHandoff(pageId)
      .then(() => { if (mountedRef.current) setHandoffRequested(true); })
      .catch(() => notifyError('申し出を送れませんでした', {
        description: '少し待ってから、もう一度お試しください。',
      }))
      .finally(() => { if (mountedRef.current) setRequesting(false); });
  }, [pageId, requesting]);

  const takeover = useCallback(() => {
    if (!pageId || takingOver) return;
    setTakingOver(true);
    takeoverLock(pageId)
      .then(() => {
        if (!mountedRef.current) return;
        setChecking(true);
        // もうサーバー側の保持者は自分なので、いつもの周期を1回前倒しで回せばよい
        tickRef.current();
      })
      .catch(() => notifyError('引き継げませんでした', {
        description: '少し待ってから、もう一度お試しください。',
      }))
      .finally(() => { if (mountedRef.current) setTakingOver(false); });
  }, [pageId, takingOver]);

  return {
    checking, held, heldByName, requestedByName, handoffRequested,
    requesting, requestHandoff, takingOver, takeover,
  };
}
