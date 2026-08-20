/**
 * ⑦ 取り込み（財務） (v4)
 *
 * 外から来た数字を財務の台帳に入れる**唯一の入口**です。
 *
 *   精算 PDF ／ 総勘定元帳 ／ 二重計上を調べる
 *     → 取り込む → 確認する → 登録する
 *
 * ── なぜ3画面を1つにしたか ──────────────────────────────────
 *
 * 旧実装は `/budget/xpoint-import`・`/budget/kessan-import`・
 * `/budget/dedup-screening` の**3つの別画面**でした。やることは全部
 * 「外の数字を読む → 中身を確かめる → 台帳に入れる」で同じなのに、
 * 手順の見せ方も、結果の出し方も、確認の訊き方もバラバラでした
 * （`alert()` と `window.confirm()` が計4か所）。
 *
 * 決算インポートと二重計上は**続けて使うもの**（入れる → 二重になっていないか調べる）
 * なのに別の URL にあり、メニューからしか行き来できませんでした。
 *
 * ── 権限の出し分け ──────────────────────────────────────────
 *
 * 精算 PDF は `budget` の editor、総勘定元帳と二重計上は `system_admin` だけです
 * （サーバーが `requireRole('system_admin')` で止めます）。
 * **押せないタブを出しません** — 料金表で決めた「権限が無い人には操作を出さない」に揃えます。
 * ただし**タブが1つしか無いときはタブ自体を出しません**（選べないものを選ばせない）。
 *
 * ── 旧 URL は生かしてある ────────────────────────────────────
 *
 * 毎月使う業務画面なのでブックマークされています。`App.tsx` が
 * `?src=pdf` / `?src=gl` / `?src=dedup` へ転送します。
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Database, CopyCheck } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { NoPermissionPanel } from '@gmo-onair/shared/src/client/states';
import { useAuth } from '@/contexts/platform/AuthContext';
import { LedgerTabs } from './ledger/LedgerTabs';
import { ImportSteps, type ImportStep } from './import/ImportSteps';
import { PdfTab } from './import/PdfTab';
import { GlTab } from './import/GlTab';
import { DedupTab } from './import/DedupTab';

type Src = 'pdf' | 'gl' | 'dedup';

const STEPS: Record<Src, ImportStep[]> = {
  pdf: [
    { title: '取り込む', desc: 'Box フォルダに置くか、この画面に PDF をアップロード' },
    { title: '確認する', desc: '読み取った内容を人の目で確かめて直す' },
    { title: '登録する', desc: '仕入 / 販管費に入れる（自動では入りません）' },
  ],
  gl: [
    { title: '取り込む', desc: 'freee の総勘定元帳（Box）を指定する' },
    { title: '確認する', desc: '件数・金額・重複候補を下書きで確かめる' },
    { title: '登録する', desc: '対象月ぶんを入れ直す（何度でもやり直せます）' },
  ],
  dedup: [
    { title: '調べる', desc: '手入力と決算インポートで二重になっている行を探す' },
    { title: '確認する', desc: '消す行と残す行を1件ずつ見比べる' },
    { title: '消す', desc: '決算インポート側だけを消す（手入力は残ります）' },
  ],
};

export default function ImportPage() {
  const [params, setParams] = useSearchParams();
  const { hasPermission, currentUser } = useAuth();
  const canBudget = hasPermission('sales', 'editor');
  const isAdmin = currentUser?.role === 'system_admin';

  const tabs = useMemo(() => [
    ...(canBudget ? [{ key: 'pdf', label: '精算 PDF', icon: <FileText className="h-3.5 w-3.5" aria-hidden="true" /> }] : []),
    ...(isAdmin ? [
      { key: 'gl', label: '総勘定元帳', icon: <Database className="h-3.5 w-3.5" aria-hidden="true" /> },
      { key: 'dedup', label: '二重計上を調べる', icon: <CopyCheck className="h-3.5 w-3.5" aria-hidden="true" /> },
    ] : []),
  ], [canBudget, isAdmin]);

  const asked = params.get('src') as Src | null;
  const src: Src = (tabs.some((t) => t.key === asked) ? asked : tabs[0]?.key) as Src;
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // `PdfTab` などが毎描画で走らないよう、身元の変わらない関数を渡す
  const onStep = useCallback((n: 1 | 2 | 3) => setStep(n), []);

  const goto = (key: string) => {
    setParams({ src: key }, { replace: true });
    setStep(1);
  };

  if (tabs.length === 0) {
    return (
      <div className="p-3 lg:p-6">
        <NoPermissionPanel modules={["sales", "admin"]} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="取り込み"
        sub="外から来た数字を財務の台帳に入れます。自動では入らず、必ず人が確かめてから登録します"
      />

      {/* タブが1つしか無い人には出さない（選べないものを選ばせない） */}
      {tabs.length > 1 && <LedgerTabs items={tabs} value={src} onChange={goto} />}

      <ImportSteps steps={STEPS[src]} current={step} />

      {src === 'pdf' && <PdfTab onStep={onStep} />}
      {src === 'gl' && <GlTab onStep={onStep} />}
      {src === 'dedup' && <DedupTab onStep={onStep} />}
    </div>
  );
}
