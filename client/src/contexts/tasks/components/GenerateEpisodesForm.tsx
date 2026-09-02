/**
 * 「頻度で作る」— 頻度×期間×1日あたりの本数で回をまとめて作る
 * （`docs/design/v4/regular-series.md` §7・§10 の5番目）
 *
 * `EpisodesPanel.tsx` の「回を足す」ダイアログに、既存の**テキスト入力方式**
 * （"1-2" 等・`AddEpisodesDialog`）に加えてタブで切り替えられるようにした
 * もう一つの作り方。ここでは日付を1件ずつ書かず、「毎週／隔週／毎月第N◯曜日」の
 * 繰り返しと期間・1日あたりの本数から**サーバーに計画させる**
 * （`POST /projects/:id/episodes/generate`）。
 *
 * ── 実行前に必ずプレビュー（dry_run）を見せる ──────────────────────
 *
 * お金の行（**確定売上**）が一緒に増えるので、押したあとで
 * 分かるのは事故（設計文書 §7）。「内容を確かめる」→ プレビュー表示 →
 * 「作成する」の2段階にしてあり、**入力を変えたらプレビューは無効に戻す**
 * （`previewKey` が今の入力と一致しないときは古いプレビューとして警告に差し替える）。
 *
 * 日付の計算そのもの（第N◯曜日の割り出し等）はここでは行わない
 * （サーバー `episodeGenerate.service.ts` が正・複製しない設計）。
 *
 * ── 初期値は案件の「レギュラーの取り決め」から引き継ぐ ────────────
 *
 * `defaultCadence` / `defaultPerDayCount` / `defaultUnitPrice` は案件（projects）に
 * 1度だけ置いた取り決め（migration 262・regular-series.md §3・§10-6）。渡されれば
 * 開いたときの初期値にするだけで、**この画面の中で書き換えても案件側の値は変わらない**
 * （回ごとに違う本数・単価で作りたいこともあるため）。
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, TriangleAlert } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';

type Cadence = 'weekly' | 'biweekly' | 'monthly_nth_weekday' | 'none';
type EndMode = 'count' | 'end_date';

const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: '毎週',
  biweekly: '隔週',
  monthly_nth_weekday: '毎月第N◯曜日',
  none: 'なし（日付を手で並べる）',
};
const CADENCE_ORDER: Cadence[] = ['weekly', 'biweekly', 'monthly_nth_weekday', 'none'];

interface PreviewDate { date: string; planned: number; existing: number; skip: boolean }
interface PreviewSummary {
  dates_total: number; dates_to_create: number; dates_skipped: number;
  episodes_to_create: number; episodes_skipped: number;
}
interface PreviewData { dates: PreviewDate[]; summary: PreviewSummary }

/** 収録日の手入力（"なし"モード）。改行・カンマ・読点のどれで区切ってもよい */
function parseDatesText(text: string): string[] {
  return text.split(/[\n,、]/).map((s) => s.trim()).filter(Boolean);
}

export function GenerateEpisodesForm({
  projectId, onDone, defaultCadence, defaultPerDayCount, defaultUnitPrice,
}: {
  projectId: string;
  onDone: () => void;
  /** 案件の「レギュラーの取り決め」（migration 262）。無ければ従来どおりの既定値を使う */
  defaultCadence?: Cadence | null;
  defaultPerDayCount?: number | null;
  defaultUnitPrice?: number | null;
}) {
  const qc = useQueryClient();
  const [cadence, setCadence] = useState<Cadence>(defaultCadence || 'weekly');
  const [startDate, setStartDate] = useState('');
  const [perDayCount, setPerDayCount] = useState(defaultPerDayCount ? String(defaultPerDayCount) : '1');
  const [endMode, setEndMode] = useState<EndMode>('count');
  const [count, setCount] = useState('12');
  const [endDate, setEndDate] = useState('');
  const [datesText, setDatesText] = useState('');
  const [revenueBudget, setRevenueBudget] = useState(defaultUnitPrice ? String(defaultUnitPrice) : '');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  // 入力を変えたらプレビューを無効化する（クリアではなく「古い」印にする —
  // 直前の結果を見ながら何を変えたか比べられるようにするため）
  const touch = () => setPreviewKey(null);

  const payload = useMemo(() => {
    const base: Record<string, unknown> = { cadence, per_day_count: Number(perDayCount) || 1 };
    if (revenueBudget.trim()) base.revenue_budget_per_episode = Number(revenueBudget);
    if (cadence === 'none') {
      base.dates = parseDatesText(datesText);
    } else {
      base.start_date = startDate;
      if (endMode === 'count') base.count = Number(count) || 0;
      else base.end_date = endDate;
    }
    return base;
  }, [cadence, perDayCount, revenueBudget, datesText, startDate, endMode, count, endDate]);

  const currentKey = JSON.stringify(payload);
  const isStale = preview !== null && previewKey !== currentKey;
  const canSubmit = cadence === 'none'
    ? parseDatesText(datesText).length > 0
    : !!startDate && (endMode === 'count' ? Number(count) > 0 : !!endDate);

  const previewMutation = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/episodes/generate`, { ...payload, dry_run: true }),
    onSuccess: (r) => { setPreview(r.data.data as PreviewData); setPreviewKey(currentKey); },
    onError: (e) => notifyApiError('確かめられませんでした', e),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/episodes/generate`, payload),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['episodes', projectId] });
      // 単価があるとサーバーが回ごとに売上行も作る。見積タブの
      // `['revenues','project',projectId]`（前方一致で当たる）と財務③の
      // `['revenues-all']` も落とさないと、作った売上が最大60秒古いまま見える
      qc.invalidateQueries({ queryKey: ['revenues'] });
      qc.invalidateQueries({ queryKey: ['revenues-all'] });
      // サーバーは作った回に標準工程テンプレートも自動適用する（episode-generate.routes.ts）
      qc.invalidateQueries({ queryKey: ['task-dashboard'] });
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] });
      const n = r.data?.data?.summary?.episodes_created ?? 0;
      notifySuccess(`回を${n}件作りました`);
      onDone();
    },
    onError: (e) => notifyApiError('回を作れませんでした', e),
  });

  const readyToCreate = !!preview && !isStale && preview.summary.episodes_to_create > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="gen-cadence">繰り返し</Label>
          <Select value={cadence} onValueChange={(v) => { setCadence(v as Cadence); touch(); }}>
            {/* Radix の SelectTrigger は button — htmlFor/id を結ぶとラベルのタップで開く */}
            <SelectTrigger id="gen-cadence" className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CADENCE_ORDER.map((c) => <SelectItem key={c} value={c}>{CADENCE_LABEL[c]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="gen-per-day">1日あたりの本数</Label>
          <Input
            id="gen-per-day" type="number" inputMode="numeric" min={1} className="mt-1"
            value={perDayCount} onChange={(e) => { setPerDayCount(e.target.value); touch(); }}
          />
        </div>
      </div>

      {cadence === 'none' ? (
        <div>
          <Label htmlFor="gen-dates">収録日（1行または読点区切りで複数）</Label>
          <Textarea
            id="gen-dates" className="mt-1 min-h-[88px]" placeholder={'例:\n2026-09-10\n2026-09-24'}
            value={datesText} onChange={(e) => { setDatesText(e.target.value); touch(); }}
          />
        </div>
      ) : (
        <>
          <div>
            <Label htmlFor="gen-start">開始日</Label>
            <Input
              id="gen-start" type="date" className="mt-1"
              value={startDate} onChange={(e) => { setStartDate(e.target.value); touch(); }}
            />
          </div>
          <div>
            <Label>終了条件</Label>
            {/* タブの ARIA は名乗らない (矢印キー・tabpanel 未実装)。aria-pressed の組にする */}
            <div role="group" aria-label="終了条件を選ぶ" className="mt-1 grid grid-cols-2 gap-1.5">
              {([['count', '回数'], ['end_date', '終了日']] as const).map(([key, label]) => {
                const on = endMode === key;
                return (
                  <button
                    key={key} type="button" aria-pressed={on}
                    onClick={() => { setEndMode(key); touch(); }}
                    className={`min-h-tap rounded-control border text-sub ${
                      on ? 'border-primary-border bg-primary-surface font-bold text-primary' : 'border-border text-muted-foreground'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {endMode === 'count' ? (
              <Input
                type="number" inputMode="numeric" min={1} className="mt-2" placeholder="全12回"
                value={count} onChange={(e) => { setCount(e.target.value); touch(); }}
              />
            ) : (
              <Input
                type="date" className="mt-2"
                value={endDate} onChange={(e) => { setEndDate(e.target.value); touch(); }}
              />
            )}
          </div>
        </>
      )}

      <div>
        <Label htmlFor="gen-revenue">回の単価（任意・確定売上）</Label>
        <Input
          id="gen-revenue" type="number" inputMode="numeric" className="mt-1" placeholder="例: 84000"
          value={revenueBudget} onChange={(e) => { setRevenueBudget(e.target.value); touch(); }}
        />
        {/*
          ⚠️ **ここは「見込み」ではありません。** サーバー
          (`episode-generate.routes.ts` の `INSERT INTO revenues`) は `status` を
          渡しておらず、列の既定 `confirmed` が効いて**確定売上**の行になります。
          `getSummaries` は `status='confirmed'` を日付条件なしで足すので、
          作った瞬間に案件の売上・粗利へ乗ります。
          長らくラベルだけ「見込み」と書いてあり実態と食い違っていたので直しました
          （「日付で指定」タブの同じ欄と表記を揃えてあります — 同じ操作が入口によって
          違う言葉で説明されるのが、今回の一連の取り違えの元でした）。
        */}
        <p className="text-sub mt-1 text-muted-foreground">
          単価を入れた回には確定売上が1件ずつ作られ、案件の売上・粗利にすぐ乗ります。空欄にすれば売上は作りません。
        </p>
      </div>

      <Button
        type="button" variant="outline" disabled={!canSubmit || previewMutation.isPending}
        onClick={() => previewMutation.mutate()}
      >
        <CalendarClock className="mr-1 h-4 w-4" aria-hidden="true" />
        内容を確かめる
      </Button>

      {preview && (
        <div className="rounded-note border border-border bg-surface-subtle p-2">
          {isStale ? (
            <p className="text-sub flex items-center gap-1 text-warning">
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              内容が変わりました。もう一度「内容を確かめる」を押してください。
            </p>
          ) : (
            <>
              <p className="text-sub">
                作成: {preview.summary.dates_to_create}日・{preview.summary.episodes_to_create}件
                {preview.summary.dates_skipped > 0 && (
                  <span className="text-warning">
                    　／　既存とぶつかって飛ばす: {preview.summary.dates_skipped}日・{preview.summary.episodes_skipped}件
                  </span>
                )}
              </p>
              <ul className="text-sub-sm mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto text-muted-foreground">
                {preview.dates.map((d) => (
                  <li key={d.date} className={d.skip ? 'text-warning' : undefined}>
                    {d.date.replace(/-/g, '/')}　{d.skip ? `飛ばす（既に${d.existing}件）` : `${d.planned}件`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <Button type="button" disabled={!readyToCreate || createMutation.isPending} onClick={() => createMutation.mutate()}>
        {preview && !isStale ? `${preview.summary.episodes_to_create}件作成する` : '作成する'}
      </Button>
    </div>
  );
}
