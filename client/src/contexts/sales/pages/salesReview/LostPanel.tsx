/**
 * 営業レビュー — 失注分析タブ (v4)
 *
 * 計算は旧実装のまま（`sales-analytics.service.ts` の `getLostReasonAnalysis`）。
 *
 * ── スマホ対応（2026-09・利用者からのご指摘）──────────────────
 *
 * 2つのパネルは `lg:grid-cols-2` なので 375px では既に単列に落ちる。直したのは
 * **月別推移の行の固定幅**で、以前は金額だけ `hidden sm:block` で消していた:
 * 失注分析でいちばん見たいのが金額なのに、スマホでは件数しか出ていなかった。
 *
 * 固定分を測り直すと `w-8`(32) ＋ `w-12`(48) ＋ 金額 `w-20`(80) ＋ 隙間(36) = 196px で、
 * 375px の実効幅（左右の余白とカードの内側を引いて 311px）に対し棒へ 115px 残る。
 * **金額は全幅で出す**ことにした。金額の枠を `w-20` にしたのは実測の結果で、
 * `w-16`(64px) では ¥123,457万 が2行に折り返して「万」だけ次の行へ落ちた
 * （`font-number` は `whitespace-nowrap` を持たないので、枠に入らないと折り返す）。
 */
import { Hash, Wallet, Scale } from 'lucide-react';
import { manYen } from '@gmo-onair/shared/src/client/ui/numbers';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { Panel } from './Panel';
import { Strip, type StripItem } from './Strip';
import type { LostAnalysis } from './types';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function LostPanel({ lost, year }: { lost: LostAnalysis; year: number }) {
  const kpis: StripItem[] = [
    { key: 'count', label: '失注件数', icon: Hash, value: String(lost.total_lost), unit: '件' },
    { key: 'amount', label: '失注金額合計', icon: Wallet, value: manYen(lost.total_lost_amount) },
    { key: 'avg', label: '平均失注金額', icon: Scale, value: manYen(lost.avg_lost_amount) },
  ];

  const trend = lost.monthly_trend;
  const maxTrend = Math.max(1, ...trend.map((t) => t.count ?? 0));

  return (
    <div className="flex flex-col gap-3.5">
      <Strip items={kpis} />

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <Panel title="失注理由の内訳">
          {lost.total_lost === 0 ? (
            <EmptyState title="条件に合う失注案件はありません" description="期間を変えてお試しください。" />
          ) : (
            <div className="flex flex-col gap-3">
              {lost.reasons.map((r) => {
                const pct = lost.total_lost > 0 ? Math.round((r.count / lost.total_lost) * 100) : 0;
                return (
                  <div key={r.reason}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-list truncate">{r.reason || '理由未設定'}</span>
                      <span className="text-note shrink-0 text-muted-foreground">{r.count}件（{pct}%）</span>
                    </div>
                    {/*
                      棒に金額を重ねる。**枠の全幅に対して右寄せ**なので、割合が
                      小さくて棒が短い行でも金額の位置は変わらない（375px でも
                      枠は親の全幅なので切れない）
                    */}
                    <span className="relative flex h-5 overflow-hidden rounded bg-muted">
                      <span className="v4-bar h-full rounded bg-destructive/70" style={{ width: `${pct}%` }} />
                      <span className="font-number absolute inset-0 flex items-center justify-end px-2 text-note">
                        {manYen(r.total_amount)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title={`月別失注推移（${year}年）`}>
          {trend.length === 0 ? (
            <EmptyState title="条件に合う月別の推移はありません" description="期間を変えてお試しください。" />
          ) : (
            <div className="flex flex-col gap-2">
              {MONTHS.map((m) => {
                const d = trend.find((t) => parseInt(t.month) === m);
                const count = d?.count ?? 0;
                const amount = d?.total_amount ?? 0;
                const w = (count / maxTrend) * 100;
                return (
                  <div key={m} className="flex items-center gap-3">
                    <span className="text-note w-8 shrink-0 text-right">{m}月</span>
                    <span className="h-4 min-w-0 flex-1 overflow-hidden rounded bg-muted">
                      {w > 0 && <span className="v4-bar block h-full rounded bg-destructive/70" style={{ width: `${w}%` }} />}
                    </span>
                    <span className="font-number text-note w-12 shrink-0 text-right">{count}件</span>
                    {/*
                      金額はスマホでも出す（失注分析で見たいのは金額。上の段落を参照）。
                      **`w-16`(64px) では足りない** — 実ブラウザで測ると ¥123,457万 が
                      2行に折り返して「万」だけ次の行に落ちた。7段の次の段 `w-20`(80px) と
                      `whitespace-nowrap` で折り返しを止める
                    */}
                    <span className="font-number text-note w-20 shrink-0 whitespace-nowrap text-right text-muted-foreground">
                      {amount > 0 ? manYen(amount) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/*
        「教訓・学び」パネルは 2026-08-27 の棚卸しで削除した（Phase B・ユーザー判断。
        `docs/project-ledger-simplification-plan.md` §5 の `lessons_learned`）。失注ダイアログが
        値を送らなくなって以来 Web 画面からは永久に空欄だったため、失注の振り返りは
        KPT・イベントレポートに一本化する。
      */}
    </div>
  );
}
