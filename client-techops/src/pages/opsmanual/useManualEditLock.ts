// 運営マニュアル — 冊子まるごとの編集ロック（段E・production-manual.md §6-2-1）。
//
// マウント時（`enabled` が true の間）に `lockManual()`（＝ `POST …/lock`）を呼ぶ。
// **このAPIは「取る」と「60秒ごとに延ばす」を兼ねる契約**——取れた（`acquired:true`）ら
// 60秒後にまた同じ関数を呼ぶだけでハートビートになる。取れなかった／後から誰かに
// 取り上げられた（`acquired:false`）ときは読み取り専用へ切り替え、15秒ごとに
// 取れないか再試行する（プッシュ通知は作らない設計・§6-2-1「プッシュ通知は作らない」）。
//
// 直前まで自分が持っていたのに次のハートビートで `acquired:false` になった＝
// **manager に強制的に引き継がれた**ということなので、その場でだけ知らせる
// （「◯◯さんが編集を引き継ぎました」）。
//
// アンマウント時は `unlockManual()` を best-effort で呼ぶ（放せるのは自分が保持者の
// ときだけ、とサーバー側が決めるので、保持者でなくても呼んで構わない＝空振りするだけ）。
//
// `enabled=false`（qsheet editor 権限が無い・確定済みで編集自体ができない、など
// 呼び出し側が別の理由ですでに読み取り専用にしている場面）のときは何もしない。
import { useCallback, useEffect, useRef, useState } from "react";
import * as manualApi from "@/lib/manualApi";
import { notifyError, notifyWarning } from "@/lib/notify";

const HEARTBEAT_MS = 60_000;
const RETRY_MS = 15_000;

export interface ManualEditLockState {
  /** 最初の応答がまだ来ていない間 true（読み取り専用の帯が一瞬だけ出るのを防ぐのに使う） */
  checking: boolean;
  /** 自分がいま編集ロックを持っているか */
  held: boolean;
  /** 自分以外がいま持っているときの名前（持っていない・未取得なら null） */
  heldByName: string | null;
  /** 自分が保持者のとき、他の誰かが交代を申し出てきていればその名前（無ければ null） */
  requestedByName: string | null;
  /** 自分が保持者でないとき、自分がすでに交代を申し出ているか */
  handoffRequested: boolean;
  /** 「編集を代わってほしい」を送信中（連打防止） */
  requesting: boolean;
  /** 「編集を代わってほしい」ボタン。自分が保持者でないときに押す */
  requestHandoff: () => void;
  /** 「渡す」ボタン。自分が保持者のときに押す（`unlockManual()` を呼ぶだけ） */
  release: () => void;
  /** 「強制的に引き継ぐ」を送信中（連打防止） */
  takingOver: boolean;
  /** 「強制的に引き継ぐ」ボタン（manager 限定・§6-2-1「強制解除」）。
   *  自分が保持者でないときに押す。取れたら、その場で通常のハートビート経路
   *  （`tickRef`）に乗せ直して `held` を更新する——`POST …/lock/takeover` の
   *  直後はサーバー側もう自分が保持者なので、続く `POST …/lock` は必ず即座に
   *  `acquired:true` を返す（`acquireManualLock` の `canAcquire` 条件参照）。 */
  takeover: () => void;
}

export function useManualEditLock(
  manualId: string | undefined,
  currentUserId: string | null | undefined,
  enabled: boolean,
): ManualEditLockState {
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
  // 次に呼ぶべき1周期分の処理。effect の外（`release`）からも同じ経路で即座に1周させたい
  // ため ref に置く（`useCallback` にすると enabled/manualId が変わるたびに作り直しが要る）
  const tickRef = useRef<() => void>(() => {});

  useEffect(() => {
    mountedRef.current = true;
    heldRef.current = false;

    if (!enabled || !manualId) {
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

    const applyResult = ({ acquired, manual }: manualApi.LockManualResult) => {
      if (!mountedRef.current) return;
      const wasHeld = heldRef.current;
      heldRef.current = acquired;
      setChecking(false);
      setHeld(acquired);

      if (acquired) {
        setHeldByName(null);
        setHandoffRequested(false);
        const requestedBy = manual.lock_requested_by;
        setRequestedByName(requestedBy && requestedBy !== currentUserId ? manual.lock_requested_by_name : null);
        schedule(HEARTBEAT_MS);
      } else {
        setRequestedByName(null);
        setHeldByName(manual.locked_by_name);
        setHandoffRequested(manual.lock_requested_by === currentUserId);
        if (wasHeld) {
          notifyWarning(`${manual.locked_by_name || "他のユーザー"}さんが編集を引き継ぎました`, {
            description: "保存していない変更は下書きとして手元に残っています。",
          });
        }
        schedule(RETRY_MS);
      }
    };

    const tick = () => {
      manualApi
        .lockManual(manualId)
        .then(applyResult)
        .catch(() => {
          // 通信の一時的な失敗はロック状態を動かさず、次の周期に委ねる
          // （ロックは事故を防ぐための補助であって、これ自体が壊れて画面全部を
          //  止めてはいけない）。
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
      manualApi.unlockManual(manualId).catch(() => {});
    };
  }, [manualId, enabled, currentUserId]);

  const requestHandoff = useCallback(() => {
    if (!manualId || requesting) return;
    setRequesting(true);
    manualApi
      .requestManualLockHandoff(manualId)
      .then(() => {
        if (mountedRef.current) setHandoffRequested(true);
      })
      .catch(() => notifyError("申し出を送れませんでした。", { description: "少し待ってから、もう一度お試しください。" }))
      .finally(() => {
        if (mountedRef.current) setRequesting(false);
      });
  }, [manualId, requesting]);

  const release = useCallback(() => {
    if (!manualId) return;
    manualApi
      .unlockManual(manualId)
      .then(() => {
        if (!mountedRef.current) return;
        heldRef.current = false;
        setHeld(false);
        setRequestedByName(null);
        setChecking(true);
        tickRef.current(); // すぐ次の周期を回し、「いま誰が持っているか」を取りに行く
      })
      .catch(() => notifyError("編集を渡せませんでした。", { description: "少し待ってから、もう一度お試しください。" }));
  }, [manualId]);

  // 強制的に引き継ぐ（manager 限定・§6-2-1「強制解除」）。`POST …/lock/takeover` で
  // サーバー側の保持者を自分にしたあと、通常の周期（`tickRef`）を1回前倒しで回すだけで
  // よい——もう自分が保持者なので、続く `POST …/lock` は `acquired:true` を返し、
  // `applyResult` が `held`・ハートビートの予約を通常どおりセットする。
  const takeover = useCallback(() => {
    if (!manualId || takingOver) return;
    setTakingOver(true);
    manualApi
      .takeoverManualLock(manualId)
      .then(() => {
        if (!mountedRef.current) return;
        setChecking(true);
        tickRef.current();
      })
      .catch(() => notifyError("引き継げませんでした。", { description: "少し待ってから、もう一度お試しください。" }))
      .finally(() => {
        if (mountedRef.current) setTakingOver(false);
      });
  }, [manualId, takingOver]);

  return {
    checking, held, heldByName, requestedByName, handoffRequested, requesting, requestHandoff, release,
    takingOver, takeover,
  };
}
