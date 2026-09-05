/**
 * 二重計上を調べるタブ (⑦ 取り込み・v4)
 *
 * 旧 `DedupScreeningPage.tsx`。手で入れた行と決算から取り込んだ行が
 * 同じもの（金額＋GLS/取引先＋計上年月）になっているのを見つけ、
 * **決算の取り込み側だけ**を削除する候補にします（手入力は必ず残します）。
 *
 * ⚠️ **画面では「インポート」「論理削除」と書かない**（2026-09-05 の用語棚卸し・
 * `scripts/check-ui-tokens.mjs`）。「決算インポート」→「決算の取り込み」、
 * 「論理削除」→「消しても記録は残る」と、起きることを日本語で書く。
 *
 * ── 確認ダイアログから落としてはいけない2文 ────────────────
 *
 * 「手で入れた行は残ります」と「消しても記録は残るので戻せます」。
 * これが無いと、押す人は**何が起きるか分からないまま**本番の売上・仕入・販管費を削除します。
 * 期間を空にすると全期間が対象になることも、押す前に読める場所に置いてあります。
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { TABLE_LABEL, type ImportScope, type DedupScreenReport } from './types';

export function DedupTab({ onStep }: { onStep: (n: 1 | 2 | 3) => void }) {
  const [scope, setScope] = useState<ImportScope>('all');
  const [monthFrom, setMonthFrom] = useState('');
  const [monthTo, setMonthTo] = useState('');
  const [report, setReport] = useState<DedupScreenReport | null>(null);

  const run = useMutation<DedupScreenReport, Error, boolean>({
    mutationFn: async (commit) => (await api.post('/admin/kessan/screen-duplicates', {
      scope, commit, monthFrom: monthFrom || undefined, monthTo: monthTo || undefined,
    }, { timeout: 180_000 })).data.data as DedupScreenReport,
    onSuccess: (d) => {
      setReport(d);
      onStep(d.deleted ? 3 : 2);
      if (d.deleted) notifySuccess(`決算の取り込み行を ${d.deleted.total} 件削除しました`);
    },
    onError: (err) => notifyApiError('二重計上を調べられませんでした', err, '少し時間をおいてもう一度お試しください。'),
  });

  const remove = async () => {
    const n = report?.summary.total.count ?? 0;
    const ok = await confirmAction({
      title: `決算の取り込み行 ${n} 件を削除しますか`,
      description: '**手で入れた行は残ります**（削除するのは決算の取り込み側だけです）。\n\n'
        + '**消しても記録は残るので、必要なら戻せます。**'
        + (report?.isProd ? '\n\n削除する先は**本番のデータベース**です。' : ''),
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (ok) run.mutate(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-control-lg flex items-start gap-2 border border-warning-border bg-warning-surface p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-sub text-secondary-foreground">
          手で入れた行と決算から取り込んだ行（<code>[kessan:…]</code>）が
          <strong className="font-bold">同じもの（金額＋GLS/取引先＋計上年月）で二重に載っている</strong>のを見つけ、
          <strong className="font-bold">決算の取り込み側だけ</strong>を削除する候補にします。
          同じ GLS・同じ月に同額の明細が複数あっても、手入力の件数と同じ数だけ間引くので、正しい複数明細は消えません。
        </p>
      </div>

      <div className="rounded-card flex flex-col gap-4 border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>対象</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ImportScope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて（売上・仕入・販管費）</SelectItem>
                <SelectItem value="revenues">売上だけ</SelectItem>
                <SelectItem value="purchases">仕入だけ</SelectItem>
                <SelectItem value="sga">販管費だけ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>対象期間（開始・任意）</Label>
            <Input type="month" value={monthFrom} onChange={(e) => setMonthFrom(e.target.value)} />
          </div>
          <div>
            <Label>対象期間（終了・任意）</Label>
            <Input type="month" value={monthTo} onChange={(e) => setMonthTo(e.target.value)} />
          </div>
        </div>
        <p className="text-note text-muted-foreground">
          <strong className="font-bold">期間を空にすると全期間</strong>（過去のデータも含む）が対象です。
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={run.isPending} onClick={() => run.mutate(false)}>
            {run.isPending && !run.variables && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            調べる（削除しません）
          </Button>
          <Button
            variant="destructive"
            disabled={run.isPending || !report || report.summary.total.count === 0}
            onClick={remove}
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />削除
          </Button>
          {!report && (
            <span className="text-note self-center text-muted-foreground">
              先に「調べる」で候補を確かめてください
            </span>
          )}
        </div>
      </div>

      {report && (
        <div className="flex flex-col gap-4">
          <div className="rounded-card border border-border bg-card p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <TableBadge
                label={report.deleted ? '削除しました' : '候補（まだ削除していません）'}
                w={null}
                className={report.deleted
                  ? 'border-transparent bg-destructive-surface text-destructive'
                  : 'border-transparent bg-muted text-muted-foreground'}
              />
              <TableBadge
                label={`${report.isProd ? '本番' : '検証'}（${report.targetDb}）`}
                w={null}
                className={report.isProd
                  ? 'border-transparent bg-destructive-surface text-destructive'
                  : 'border-transparent bg-success-surface text-success'}
              />
              {(report.monthFrom || report.monthTo) && (
                <span className="text-note text-muted-foreground">
                  対象期間: {report.monthFrom || '最古'} 〜 {report.monthTo || '最新'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['revenues', 'purchases', 'sga'] as const).map((t) => (
                <div key={t} className="rounded-control-lg border border-border p-3">
                  <div className="text-note text-muted-foreground">{TABLE_LABEL[t]}</div>
                  <div className="text-h2 font-number">{report.summary[t].count} 件</div>
                  <div className="text-note text-muted-foreground"><Money value={report.summary[t].amount} /></div>
                </div>
              ))}
              <div className="rounded-control-lg border border-primary-border bg-primary-surface-weak p-3">
                <div className="text-note text-muted-foreground">{report.deleted ? '削除した合計' : '候補の合計'}</div>
                <div className="text-h2 font-number text-primary">
                  {(report.deleted?.total ?? report.summary.total.count)} 件
                </div>
                <div className="text-note text-muted-foreground"><Money value={report.summary.total.amount} /></div>
              </div>
            </div>

            {report.deleted && (
              <p className="rounded-control-lg text-sub mt-3 bg-success-surface px-3 py-2 text-success">
                決算の取り込み行を {report.deleted.total} 件削除しました
                （売上 {report.deleted.revenues} / 仕入 {report.deleted.purchases} / 販管費 {report.deleted.sga}）。
                手で入れた行は残っています。
              </p>
            )}
          </div>

          {report.candidates.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h2 className="text-cardtitle">
                {report.deleted ? '削除した' : '削除する候補の'}決算の取り込み行
                <span className="text-note ml-2 text-muted-foreground">
                  {report.truncated
                    ? `先頭 ${report.candidates.length} 件だけ出しています（これより多くあります）`
                    : `${report.candidates.length} 件`}
                </span>
              </h2>
              <div className="flex flex-col">
                <RowHeader className="hidden sm:flex">
                  <RowSlot w={72}>区分</RowSlot>
                  <RowMain>削除する行（決算の取り込み）</RowMain>
                  <RowMain>残す行（手で入れたもの）</RowMain>
                </RowHeader>
                {report.candidates.map((c) => (
                  <Row key={`${c.table}-${c.id}`} align="start">
                    <RowSlot w={72}>
                      <span className="text-sub-sm text-secondary-foreground">{TABLE_LABEL[c.table]}</span>
                    </RowSlot>
                    <RowMain><span className="text-sub-sm text-destructive line-through">{c.label}</span></RowMain>
                    <RowMain><span className="text-sub-sm text-success">{c.keptLabel}</span></RowMain>
                  </Row>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="同じ支払いが2回入っている行は見つかりませんでした"
              description="決算から取り込んだ行と手で入れた行に、同じ金額・同じ相手・同じ計上月の組み合わせはありませんでした。対象や期間を変えると別の範囲を調べられます。"
            />
          )}
        </div>
      )}
    </div>
  );
}
