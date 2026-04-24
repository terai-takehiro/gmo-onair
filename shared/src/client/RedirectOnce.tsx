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
 * 本コンポーネントは `useRef` で「一度だけ replace する」保証を与える。
 * 使い方は Navigate と同じ:
 *
 *   <Route path="*" element={<RedirectOnce to="/login" />} />
 */
export function RedirectOnce({ to }: { to: string }) {
  const navigate = useNavigate();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    navigate(to, { replace: true });
    // deps は意図的に空配列。一度だけ発火する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
