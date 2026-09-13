/**
 * 台帳3画面（③ 売上 ／ ④ 仕入 ／ ⑤ 販管費）の絞り込み（計上月・引き継いだ期間）の状態
 *
 * **変換の規則そのものは `ledgerUrlPeriod.ts`（純関数）に置いてある。**
 * ここは React に繋ぐだけ — 分けてあるのは、規則のほうを
 * `shared/tests/financeDashboardPeriod.test.ts` から**React 抜きで**固定するため。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ledgerPeriodFromUrl,
  type LedgerUrlPeriod,
  type LedgerUrlPeriodState,
} from './ledgerUrlPeriod';

/**
 * URL のクエリを台帳の絞り込みへ取り込む。**URL が変わったときだけ**入れ直す。
 *
 * ⚠️ `useState` の初期化子は**初回しか走らない**ので、同じ画面のままクエリだけ
 * 変わって遷移した（別の月の「台帳を開く」を押した）ときに古い月が残る。
 * かといって毎レンダーで入れ直すと、利用者が手で選んだ月を踏み潰す。だから
 * **URL の値が変わった時だけ**入れ直す ref のガードを置く
 * （v4.5.17 で横展開した「props→state の再同期漏れ」と同じ形）。
 */
export function useLedgerUrlPeriod(searchParams: URLSearchParams): LedgerUrlPeriodState {
  const from = searchParams.get('recognition_from') || '';
  const to = searchParams.get('recognition_to') || '';
  const label = searchParams.get('period_label') || '';
  const all = searchParams.get('period_all') === '1';
  const hasProject = !!searchParams.get('project_id');

  const [state, setState] = useState<LedgerUrlPeriod>(
    () => ledgerPeriodFromUrl(from, to, label, all, hasProject),
  );
  const lastUrl = useRef(`${from}|${to}|${all}|${hasProject}`);

  useEffect(() => {
    const key = `${from}|${to}|${all}|${hasProject}`;
    if (lastUrl.current === key) return;
    lastUrl.current = key;
    setState(ledgerPeriodFromUrl(from, to, label, all, hasProject));
  }, [from, to, label, all, hasProject]);

  // 月を触ったら期間は外す。両方をサーバーへ送ると AND で交差して0件になる
  const setMonth = useCallback((value: string) => {
    setState({ month: value, range: null, handoff: null });
  }, []);
  const clearPeriod = useCallback(() => {
    setState({ month: '', range: null, handoff: null });
  }, []);

  return { ...state, setMonth, clearPeriod };
}
