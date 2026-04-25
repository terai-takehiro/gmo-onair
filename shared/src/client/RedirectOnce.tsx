import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/**
 * RedirectOnce — `<Navigate replace />` の代替
 *
 * react-router v6 の `<Navigate>` は内部 useEffect が毎レンダーの
 * `navigate` 参照(location 変更で更新される)に依存するため、
 * URL が再書き込みされる度に effect が再発火し、history.replaceState が
 * 高頻度で呼ばれて Firefox/Safari の SecurityError を誘発することがある。
 *
 * 本コンポーネントは以下で防御:
 *  1. インスタンスレベルの useRef で「同一マウント中は1回だけ」発火
 *  2. モジュールレベルの WeakMap でターゲット URL ごとに最終発火時刻を記憶し、
 *     500ms 以内の同一 URL への再発火を抑制 (リマウントが連続した場合の保険)
 *  3. navigate 後 200ms 経っても URL が変わらない場合は window.location.replace に
 *     フォールバック (react-router の何らかの不調を回避するハード遷移)
 *
 * v2.4.1 で v2.3.1 の単純実装からこの強化版へ。
 */

const lastFiredAt = new Map<string, number>();
const SUPPRESS_WINDOW_MS = 500;

export function RedirectOnce({ to }: { to: string }) {
  const navigate = useNavigate();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    // モジュールレベル: 短期間に同一 URL への redirect が連続するなら抑制
    const now = Date.now();
    const last = lastFiredAt.get(to) ?? 0;
    if (now - last < SUPPRESS_WINDOW_MS) {
      // 連発ガード: 何もしない
      return;
    }
    lastFiredAt.set(to, now);

    // 通常パス: react-router の navigate
    try {
      navigate(to, { replace: true });
    } catch {
      // react-router 側の不調なら直ちに hard navigation
      window.location.replace(to);
      return;
    }

    // フォールバック: 200ms 経っても URL が一致しないなら hard navigation
    // (basename 考慮で endsWith で判定)
    const checkAt = window.setTimeout(() => {
      try {
        if (!window.location.pathname.endsWith(to)) {
          window.location.replace(to);
        }
      } catch {
        /* ignore */
      }
    }, 200);

    return () => window.clearTimeout(checkAt);
    // deps は意図的に空配列。一度だけ発火する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
