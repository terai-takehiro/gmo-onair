// 会場図面 — 図面まるごとの編集ロック（設計: docs/design/v4/venue-layout.md §5-6）。
// `client-techops/src/pages/opsmanual/useManualEditLock.ts` の写し。マウント時に
// `lockVenueLayout()`（＝ POST …/lock）を呼ぶ。このAPIは「取る」と「60秒ごとに
// 延ばす」を兼ねる契約——取れた（acquired:true）ら60秒後にまた同じ関数を呼ぶだけで
// ハートビートになる。取れなかった／取り上げられたときは読み取り専用へ切り替え、
// 15秒ごとに再試行する。
//
// ⚠️ `venueApi.ts`（型の正）の `VenueLockState` は `status`（確定済みかどうか）を
// 含まない——運営マニュアル版が持つ「確定をハートビートで検知する」通知はここでは
// 作れない（サーバー側の応答が増えたら足す）。確定の検知は呼び出し側が別途
// `getVenueLayout` の再取得で行う。
import { useCallback, useEffect, useRef, useState } from "react";
import * as venueApi from "@/lib/venueApi";
import { notifyError, notifyWarning } from "@/lib/notify";

const HEARTBEAT_MS = 60_000;
const RETRY_MS = 15_000;
const IDLE_THRESHOLD_MS = 10 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "wheel"] as const;

export interface VenueEditLockState {
  checking: boolean;
  held: boolean;
  heldByName: string | null;
  requestedByName: string | null;
  handoffRequested: boolean;
  requesting: boolean;
  requestHandoff: () => void;
  release: () => void;
  takingOver: boolean;
  takeover: () => void;
}

export function useVenueEditLock(
  layoutId: string | undefined,
  currentUserId: string | null | undefined,
  enabled: boolean,
): VenueEditLockState {
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
  const tickRef = useRef<() => void>(() => {});
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    mountedRef.current = true;
    heldRef.current = false;

    if (!enabled || !layoutId) {
      setChecking(false);
      setHeld(false);
      setHeldByName(null);
      setRequestedByName(null);
      setHandoffRequested(false);
      return () => {
        mountedRef.current = false;
      };
    }

    setChecking(true);

    const schedule = (ms: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => tickRef.current(), ms);
    };

    const applyResult = ({ acquired, layout }: venueApi.LockVenueLayoutResult) => {
      if (!mountedRef.current) return;
      const wasHeld = heldRef.current;
      heldRef.current = acquired;
      setChecking(false);
      setHeld(acquired);

      if (acquired) {
        setHeldByName(null);
        setHandoffRequested(false);
        const requestedBy = layout.lockRequestedBy;
        setRequestedByName(requestedBy && requestedBy !== currentUserId ? layout.lockRequestedByName ?? null : null);
        schedule(HEARTBEAT_MS);
      } else {
        setRequestedByName(null);
        setHeldByName(layout.lockedByName ?? null);
        setHandoffRequested(layout.lockRequestedBy === currentUserId);
        if (wasHeld) {
          notifyWarning(`${layout.lockedByName || "他のユーザー"}さんが編集を引き継ぎました`, {
            description: "保存していない変更は下書きとして手元に残っています。",
          });
        }
        schedule(RETRY_MS);
      }
    };

    const tick = () => {
      // 一定時間操作が無ければハートビートを送らない（`locked_at` を更新させない）。
      // サーバー側の stale 判定（10分）が働けるようにするため（運営マニュアルと同じ）。
      if (heldRef.current && Date.now() - lastActivityRef.current > IDLE_THRESHOLD_MS) {
        schedule(HEARTBEAT_MS);
        return;
      }
      venueApi
        .lockVenueLayout(layoutId)
        .then(applyResult)
        .catch(() => {
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
      venueApi.unlockVenueLayout(layoutId).catch(() => {});
    };
  }, [layoutId, enabled, currentUserId]);

  useEffect(() => {
    if (!enabled) return;
    lastActivityRef.current = Date.now();
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
    };
  }, [enabled]);

  const requestHandoff = useCallback(() => {
    if (!layoutId || requesting) return;
    setRequesting(true);
    venueApi
      .requestVenueLayoutLockHandoff(layoutId)
      .then(() => {
        if (mountedRef.current) setHandoffRequested(true);
      })
      .catch(() => notifyError("申し出を送れませんでした。", { description: "少し待ってから、もう一度お試しください。" }))
      .finally(() => {
        if (mountedRef.current) setRequesting(false);
      });
  }, [layoutId, requesting]);

  const release = useCallback(() => {
    if (!layoutId) return;
    venueApi
      .unlockVenueLayout(layoutId)
      .then((layout) => {
        if (!mountedRef.current) return;
        heldRef.current = false;
        setChecking(false);
        setHeld(false);
        setRequestedByName(null);
        setHeldByName(layout.lockedByName ?? null);
        setHandoffRequested(layout.lockRequestedBy === currentUserId);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => tickRef.current(), RETRY_MS);
      })
      .catch(() => notifyError("編集を渡せませんでした。", { description: "少し待ってから、もう一度お試しください。" }));
  }, [layoutId, currentUserId]);

  const takeover = useCallback(() => {
    if (!layoutId || takingOver) return;
    setTakingOver(true);
    venueApi
      .takeoverVenueLayoutLock(layoutId)
      .then(() => {
        if (!mountedRef.current) return;
        setChecking(true);
        tickRef.current();
      })
      .catch(() => notifyError("引き継げませんでした。", { description: "少し待ってから、もう一度お試しください。" }))
      .finally(() => {
        if (mountedRef.current) setTakingOver(false);
      });
  }, [layoutId, takingOver]);

  return {
    checking, held, heldByName, requestedByName, handoffRequested, requesting, requestHandoff, release,
    takingOver, takeover,
  };
}
