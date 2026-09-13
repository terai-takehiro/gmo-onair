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
// `manual.service.ts` の `LOCK_STALE_MS` と同じ値（サーバーが stale とみなす境）。
// ⚠️⚠️ 外部レビュー再指摘（P2）: 以前はタブを開いたまま操作しなくても60秒ごとの
// ハートビートが無条件で`locked_at`を延ばし続けており、サーバー側が謳う
// 「10分操作が無ければ空き」が実質一度も成立しなかった（タブを閉じるか manager が
// 強制解除するまで、他の編集者はずっと待たされる）。実際に操作（マウス/キー/タッチ）
// した時刻を追い、これより長く操作が無ければハートビートを送らない
// （＝`locked_at`を更新しない）ようにし、サーバー側の stale 判定が働けるようにする。
const IDLE_THRESHOLD_MS = 10 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "wheel"] as const;

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
  /**
   * 自分が保持者のまま、他の誰か（manager とは限らない——確定に編集ロックの保持は
   * 不要）が冊子を確定したとハートビートで気づいたときに呼ぶ（外部レビュー再指摘・
   * P1）。呼び出し側は冊子の詳細を引き直す（`isFixed`/`lockEnabled` を最新化する）。
   */
  onFixed?: () => void,
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
  const onFixedRef = useRef(onFixed);
  onFixedRef.current = onFixed;
  // 次に呼ぶべき1周期分の処理。effect の外（`release`）からも同じ経路で即座に1周させたい
  // ため ref に置く（`useCallback` にすると enabled/manualId が変わるたびに作り直しが要る）
  const tickRef = useRef<() => void>(() => {});
  // 直近の操作時刻（マウント時点を初期値にする——開いた直後にいきなり stale 扱いにしない）
  const lastActivityRef = useRef(Date.now());

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
          // ⚠️⚠️ 外部レビュー再指摘（P1）: `acquireManualLock()`に`status != 'fixed'`
          // ガードを足したことで、確定後のハートビートはここに来るようになった
          // （以前はロックだけ見て`acquired:true`を返し続け、次の保存が汎用の400で
          // 失敗するまで気づけなかった）。「引き継がれた」と紛らわしいため、確定は
          // 別文言にし、呼び出し側に詳細の再取得を促す。
          if (manual.status === "fixed") {
            notifyWarning("この冊子は確定されました。", {
              description: "保存していない変更は下書きとして手元に残っています。",
            });
            onFixedRef.current?.();
          } else {
            notifyWarning(`${manual.locked_by_name || "他のユーザー"}さんが編集を引き継ぎました`, {
              description: "保存していない変更は下書きとして手元に残っています。",
            });
          }
        }
        schedule(RETRY_MS);
      }
    };

    const tick = () => {
      // ⚠️⚠️ 外部レビュー再指摘（P2）: 自分が保持者のまま一定時間操作が無ければ、
      // ハートビートそのものを送らない——`locked_at` を更新させないことで、
      // サーバー側の stale 判定（10分）が働けるようにする。`held`/`heldRef` は
      // そのままなので、この画面は編集可能な見た目のまま。操作が戻れば次の周期で
      // 通常どおり延ばしに行く（読み込み直しは不要）。
      if (heldRef.current && Date.now() - lastActivityRef.current > IDLE_THRESHOLD_MS) {
        schedule(HEARTBEAT_MS);
        return;
      }
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

  // 実際の操作（マウス/キー/タッチ）の時刻を追う（`tick()` の idle 判定用）。
  // `enabled` の間だけ——`window` 直付けなので、無効時に外しておく。
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
      .then((manual) => {
        if (!mountedRef.current) return;
        // ⚠️⚠️ 外部レビュー再指摘（P1）: 以前はここで`tickRef.current()`
        // （＝取る/延ばすPOST）を即座に呼んでいた。放した直後にもう一度同じ関数を
        // 呼べば、サーバー側ではもうロックが空いているため**放した本人がその場で
        // 取り返してしまい**、相手の15秒ごとの再試行が追いつく前に「渡す」が実質
        // 無効化されていた。DELETEの応答（放した直後の最新状態）をそのままUIへ
        // 反映するだけにし（`applyResult`の「取れなかった」分岐と同じ扱い）、
        // 次の周期は通常の再試行間隔（RETRY_MS）を空けてから回す——取得は試みない。
        heldRef.current = false;
        setChecking(false);
        setHeld(false);
        setRequestedByName(null);
        setHeldByName(manual.locked_by_name);
        setHandoffRequested(manual.lock_requested_by === currentUserId);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => tickRef.current(), RETRY_MS);
      })
      .catch(() => notifyError("編集を渡せませんでした。", { description: "少し待ってから、もう一度お試しください。" }));
  }, [manualId, currentUserId]);

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
