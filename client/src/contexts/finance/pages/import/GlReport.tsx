/**
 * 総勘定元帳インポートの結果表示（下書き・投入済みの両方）。
 * `GlTab.tsx` から切り出した（1ファイル400行の上限のため）。
 */
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import type { KessanReport } from './types';

export function GlReport({ report }: { report: KessanReport }) {
  const dupTotal = report.duplicates
    ? report.duplicates.sga + report.duplicates.revenues + report.duplicates.purchases : 0;
  const ROWS = [
    ['販管費', report.summary.sga],
    ['売上', report.summary.revenues],
    ['仕入', report.summary.purchases],
    [`固定原価（→ ${report.summary.fixedCogs.routed}）`, report.summary.fixedCogs],
  ] as const;

  return (
    <div className="rounded-card flex flex-col gap-4 border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <TableBadge
          label={report.dryRun ? '下書き（未投入）' : '取り込み済み'}
          w={null}
          className={report.dryRun
            ? 'border-transparent bg-info-surface text-info'
            : 'border-transparent bg-success-surface text-success'}
        />
        <TableBadge
          label={`取り込み先: ${report.isProd ? '本番' : '検証'}（${report.targetDb}）`}
          w={null}
          className={report.isProd
            ? 'border-transparent bg-destructive-surface text-destructive'
            : 'border-transparent bg-muted text-muted-foreground'}
        />
      </div>

      <p className="text-sub text-secondary-foreground">
        対象期間:{' '}
        <strong className="font-bold text-foreground">
          {report.dateRange?.from && report.dateRange?.to
            ? `${report.dateRange.from} 〜 ${report.dateRange.to}` : report.period}
        </strong>
        {report.dateRange?.months?.length ? `（${report.dateRange.months.join('、')}）` : ''}
        <span className="text-note mt-0.5 block text-muted-foreground">
          マーカー月 {report.period} ／ 区分 {report.scopes.join('、')}
          {report.sourceFile ? ` ／ 取り込み元 ${report.sourceFile}` : ''}
        </span>
      </p>

      <div className="flex flex-col">
        <RowHeader className="hidden sm:flex">
          <RowMain>区分</RowMain>
          <RowSlot w={72} align="right">件数</RowSlot>
          <RowSlot w={160} align="right">金額</RowSlot>
        </RowHeader>
        {ROWS.map(([label, s]) => (
          <Row key={label}>
            <RowMain>{label}</RowMain>
            <RowSlot w={72} align="right"><span className="font-number">{s.count}</span></RowSlot>
            <MoneyCell value={s.amount} width={160} />
          </Row>
        ))}
      </div>

      {report.committed && (
        <p className="text-sub text-secondary-foreground">
          入った件数：販管費 <strong className="font-bold">{report.committed.sga}</strong>
          {' / '}売上 <strong className="font-bold">{report.committed.revenues}</strong>
          {' / '}仕入 <strong className="font-bold">{report.committed.purchases}</strong>
          {report.committed.dupSkipped ? ` / 重複で飛ばした ${report.committed.dupSkipped}` : ''}
          {report.committed.skipped ? ` / その他で飛ばした ${report.committed.skipped}` : ''}
          {' ｜ '}新しく作った：案件 {report.masters.created.projects}
          {' / '}顧客 {report.masters.created.customers} / 取引先 {report.masters.created.vendors}
          {report.masters.revivedProjects.length > 0 ? ` ｜ 復活させた案件 ${report.masters.revivedProjects.length}` : ''}
        </p>
      )}

      {(report.masters.missingProjects.length > 0 || report.masters.missingCustomers.length > 0 || report.masters.missingVendors.length > 0) && (
        <div className="rounded-control-lg border border-warning-border bg-warning-surface p-3">
          {report.masters.missingProjects.length > 0 && (
            <p className="text-note text-warning">
              登録の無い案件（GLS）{report.masters.missingProjects.length}件: {report.masters.missingProjects.join('、')}
            </p>
          )}
          {report.masters.missingCustomers.length > 0 && (
            <p className="text-note mt-1 text-warning">
              登録の無い顧客 {report.masters.missingCustomers.length}件: {report.masters.missingCustomers.slice(0, 20).join('、')}
            </p>
          )}
          {report.masters.missingVendors.length > 0 && (
            <p className="text-note mt-1 text-warning">
              登録の無い取引先 {report.masters.missingVendors.length}件: {report.masters.missingVendors.slice(0, 20).join('、')}
            </p>
          )}
          {report.dryRun && (
            <p className="text-note mt-1 text-muted-foreground">
              「案件・顧客・取引先を自動で作る」を入れて取り込むと作られます。
            </p>
          )}
        </div>
      )}

      {dupTotal > 0 && (
        <div className="rounded-control-lg border border-destructive-border bg-destructive-surface p-3">
          <p className="text-note font-bold text-destructive">
            既にあるデータと同じ金額＋内容の重複候補が {dupTotal} 件あります
            （販管費 {report.duplicates.sga} / 売上 {report.duplicates.revenues} / 仕入 {report.duplicates.purchases}）
          </p>
          <p className="text-note mt-1 text-destructive">
            手で入れた分とこの取り込みが二重計上にならないか確かめてください（決算の取り込みどうしの入れ直しは対象外です）。
          </p>
          {report.duplicates.samples.length > 0 && (
            <ul className="font-number mt-1">
              {report.duplicates.samples.map((s) => <li key={s} className="text-note truncate">{s}</li>)}
            </ul>
          )}
        </div>
      )}

      {report.warnings.length > 0 && (
        <div className="rounded-control-lg border border-warning-border bg-warning-surface p-3">
          {report.warnings.map((w) => <p key={w} className="text-note text-warning">{w}</p>)}
        </div>
      )}

      <details className="text-note">
        <summary className="min-h-tap flex cursor-pointer items-center text-muted-foreground">明細のサンプルを出す</summary>
        <div className="mt-2 flex flex-col gap-3">
          {(['sga', 'revenues', 'purchases'] as const).map((k) => (report.samples[k].length ? (
            <div key={k}>
              <p className="font-bold">{k === 'sga' ? '販管費' : k === 'revenues' ? '売上' : '仕入'}</p>
              <ul className="font-number mt-1">
                {report.samples[k].map((s) => <li key={s} className="truncate">{s}</li>)}
              </ul>
            </div>
          ) : null))}
        </div>
      </details>
    </div>
  );
}
