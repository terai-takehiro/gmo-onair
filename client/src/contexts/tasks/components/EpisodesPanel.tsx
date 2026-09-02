/**
 * 「回（エピソード）」の簡易一覧（v4・タスクタブへ移設）
 *
 * ── なぜここにあるのか ──────────────────────────────────────
 *
 * 旧「エピソード」タブは最新モック（`v4-live-sales.dc.html`）の見えるタブバーに
 * 無い（概要／やり取り／タスク／見積／書類／当日／ふりかえりの7つだけ）。
 * モックの中には「回（エピソード）」の絵（回・名前・実施日・タスク進捗・状態の
 * 5列の表 ＋「回を足す」ボタン）自体は残っているが、どのタブにも紐づいていない
 * 死んだコードだった（`docs/v4-mock-deviations.md` 参照）。
 *
 * タブごと外すと、**回を新しく作る手段が無くなる**。`EpisodeScopeToggle`
 * （このすぐ下に出る絞り込み）もスタジオ予約ダイアログも「既存の回から選ぶ」
 * だけで、作る口を持たない。レギュラー（GLS-A）案件は今日も回を増やしながら
 * 運用しているので、モックの簡易表と「回を足す」ボタンだけをこの絞り込みの
 * すぐ隣に残した（ご判断）。
 *
 * ── 中身は自分で作った（レガシー `BusinessProjectView` は使わない） ─────
 *
 * 見積・売上・仕入は見積・請求タブの持ち物なのでここには出さない。
 * 列は `GET /projects/:id/episodes` が返す集計値（タスク件数・完了件数）
 * だけで組める。
 *
 * ── 状態は自動で決める ─────────────────────────────────────
 *
 * `episodes.status` は自由文で運用されておらず、誰も書いていない。
 * 旧モックの「各回の状態は工程の進み方で自動で決まります」という決めごとを
 * そのまま踏襲し、**タスクの完了件数から導出する**（未着手／進行中／完了）。
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, ListChecks, Pencil, Receipt } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Row, RowHeader, RowMain, RowSlot, RowSub } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import {
  parseEpisodeSpec, describeEpisodeNumbers, EpisodeSpecError,
} from '@gmo-onair/shared/src/production/episodeSpec';
import type { Episode } from '@gmo-onair/shared/src/types';
import { GenerateEpisodesForm } from './GenerateEpisodesForm';
import { ApplyEpisodeTaskTemplateDialog } from './ApplyEpisodeTaskTemplateDialog';
import { EditEpisodeDialog } from './EditEpisodeDialog';

type EpisodeState = 'todo' | 'doing' | 'done';

/**
 * 案件の「レギュラーの取り決め」（migration 262・regular-series.md §3）のうち、
 * 「頻度で作る」の初期値になる3つだけ。呼び出し元（`TasksTab.tsx`）は
 * `ProjectDetail` からそのまま渡せる（読むだけ・ここでは保存しない）。
 */
export interface SeriesDefaults {
  recording_cadence?: 'weekly' | 'biweekly' | 'monthly_nth_weekday' | 'none' | null;
  recording_per_day_count?: number | null;
  episode_unit_price?: number | null;
}

function stateOf(e: Episode): EpisodeState {
  const total = e.task_count ?? 0;
  const done = e.task_done_count ?? 0;
  if (total === 0 || done === 0) return 'todo';
  if (done >= total) return 'done';
  return 'doing';
}

const STATE_LABEL: Record<EpisodeState, string> = { todo: '未着手', doing: '進行中', done: '完了' };
const STATE_TONE: Record<EpisodeState, string> = {
  todo: 'border-transparent bg-muted text-muted-foreground',
  doing: 'border-transparent bg-primary-surface text-primary',
  done: 'border-transparent bg-success-surface text-success',
};

/** 実施日。収録日が無ければ放送日にフォールバックする（生放送は収録＝放送のため） */
function dateOf(e: Episode): string | null {
  return e.recording_date || e.broadcast_date || null;
}

/**
 * この回の「1日あたりの本数」「回の単価」（migration 269・仕様変更 #16）を一行で表す。
 * どちらも決めていなければ何も出さない（0本・¥0との混同を避けるため、
 * 「決めていない」は空文字を返す＝行に何も表示しない）
 */
function perEpisodeSummary(e: Episode): string {
  const parts: string[] = [];
  if (e.recording_per_day_count != null) parts.push(`1日${e.recording_per_day_count}本`);
  if (e.episode_unit_price != null) parts.push(formatCurrency(e.episode_unit_price));
  // この回に紐づく見積の件数（仕様変更 #18・migration 270）。0件のときは出さない
  // （「まだ無い」を毎行に書くと、回が多い案件ほど画面が煩雑になるため）
  if (e.estimate_count) parts.push(`見積${e.estimate_count}件`);
  return parts.join('・');
}

/**
 * 「回を足す」— 2つの作り方をタブで切り替える（`docs/design/v4/regular-series.md` §7・§10-5）。
 *
 * ① **話数で指定**（従来）: 「追加する数」をテキストで受ける（依頼: 「複数の回を
 * 登録することもあるのでテキストで入力出来るようにしたい『#1-2』みたいに」）。
 * パーサー（`shared/src/production/episodeSpec.ts`）が「単純な数＝件数」
 * 「範囲・カンマ区切り＝明示的な話数」を読み分ける。プレビューは**必ず実行前に出す**
 * （お金の行が増えることもあるので、押したあとで分かるのは事故 — 設計文書 §7）。
 *
 * ② **頻度で作る**（新規）: 「毎週／隔週／…」の繰り返し×期間×1日あたりの本数で
 * サーバーに日付を組み立てさせる（`POST /episodes/generate`）。中身は
 * `GenerateEpisodesForm.tsx`（1ファイル400行の上限のため分けてある）。
 *
 * `nextNum`（この案件の次の話数）は既に読み込み済みの一覧から出す簡易な見積もりで、
 * 採番そのものはサーバーが取引の中でアトミックに行う。ここでは「思っていた話数と
 * ズレていないか」を実行前に気づかせるだけの表示用途（①だけで使う）。
 */
function AddEpisodesDialog({
  open, onOpenChange, projectId, nextNum, seriesDefaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  nextNum: number;
  /** 案件の「レギュラーの取り決め」（migration 262）。「頻度で作る」タブの初期値になる */
  seriesDefaults?: SeriesDefaults;
}) {
  const [mode, setMode] = useState<'text' | 'frequency'>('text');
  const [text, setText] = useState('1');
  const qc = useQueryClient();

  const parsed = useMemo(() => {
    try {
      return { ok: true as const, spec: parseEpisodeSpec(text) };
    } catch (e) {
      const message = e instanceof EpisodeSpecError ? e.message : '読み取れませんでした';
      return { ok: false as const, message };
    }
  }, [text]);

  // プレビュー表示用の話数リスト（件数入力は「次の話数から連番」と仮定して見せる）
  const previewNumbers = useMemo(() => {
    if (!parsed.ok) return null;
    if (parsed.spec.mode === 'explicit') return parsed.spec.numbers;
    return Array.from({ length: parsed.spec.count }, (_, i) => nextNum + i);
  }, [parsed, nextNum]);

  const mismatch = parsed.ok && parsed.spec.mode === 'explicit' && previewNumbers != null
    && previewNumbers[0] !== nextNum;

  const create = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/episodes/batch`, { episodes: text }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['episodes', projectId] });
      // サーバーは `revenue_budget_per_episode` 付きの呼び出しで回ごとに売上行も作る。
      // この画面は単価を送らないが、「頻度で作る」側と同じ対で落としておく
      // （片方だけだと将来単価を配線した日に「作ったのに古いまま」が再発する）
      qc.invalidateQueries({ queryKey: ['revenues'] });
      qc.invalidateQueries({ queryKey: ['revenues-all'] });
      const n = Array.isArray(r.data?.data) ? r.data.data.length : (previewNumbers?.length ?? 1);
      notifySuccess(`回を${n}件足しました`);
      onOpenChange(false);
      setText('1');
    },
    onError: (e) => notifyApiError('回を足せませんでした', e),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="回を足す"
      sub={mode === 'text'
        ? '数字だけなら「次の話数から連番でN件」、"1-2" や "1,3,5-8" のように書くと話数を指定して作れます。'
        : '頻度・期間・1日あたりの本数から日付を組み立てます。作る前に必ず内容を確かめます。'}
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>やめる</Button>
          {/* 「頻度で作る」は確認→実行の2段階を中の GenerateEpisodesForm が持つので、
              ここには置かない（下端に2つ実行ボタンが並ぶのを避ける） */}
          {mode === 'text' && (
            <Button onClick={() => create.mutate()} disabled={create.isPending || !parsed.ok}>
              足す
            </Button>
          )}
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-3">
        {/* タブの ARIA (tab/tablist) は名乗らない — 矢印キー移動・tabpanel を
            実装していないので、読み上げに「タブ」と言うと約束と挙動が食い違う。
            押した状態を持つボタンの組 (aria-pressed) として出す */}
        <div role="group" aria-label="回の作り方を切り替える" className="grid grid-cols-2 gap-1.5">
          {([['text', '話数で指定'], ['frequency', '頻度で作る']] as const).map(([key, label]) => {
            const on = mode === key;
            return (
              <button
                key={key} type="button" aria-pressed={on}
                onClick={() => setMode(key)}
                className={`min-h-tap rounded-control border text-sub ${
                  on ? 'border-primary-border bg-primary-surface font-bold text-primary' : 'border-border text-muted-foreground'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {mode === 'text' ? (
          <div className="flex flex-col gap-2">
            <div>
              <Label htmlFor="ep-spec">追加する数</Label>
              <Input
                id="ep-spec" type="text" inputMode="text" className="mt-1"
                placeholder={'例: 2 ／ 1-2 ／ #1-2 ／ 1,3,5-8'}
                value={text} onChange={(e) => setText(e.target.value)}
              />
            </div>
            {!parsed.ok ? (
              <p className="text-sub text-destructive">{parsed.message}</p>
            ) : previewNumbers ? (
              <div className="rounded-note border border-border bg-surface-subtle p-2">
                <p className="text-sub">
                  作成する回: {describeEpisodeNumbers(previewNumbers)}（{previewNumbers.length}件）
                </p>
                {mismatch && (
                  <p className="text-sub text-warning mt-1">
                    ⚠ 次の話数は #{nextNum} です。指定と次の話数がズレています — 意図した範囲か確かめてください。
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <GenerateEpisodesForm
            projectId={projectId}
            onDone={() => { onOpenChange(false); setMode('text'); }}
            defaultCadence={seriesDefaults?.recording_cadence}
            defaultPerDayCount={seriesDefaults?.recording_per_day_count}
            defaultUnitPrice={seriesDefaults?.episode_unit_price}
          />
        )}
      </div>
    </FormDialog>
  );
}

export function EpisodesPanel({ projectId, seriesDefaults }: { projectId: string; seriesDefaults?: SeriesDefaults }) {
  const [addOpen, setAddOpen] = useState(false);
  /** 「標準工程を当てる」ダイアログの対象回。null = 閉じている */
  const [templateTarget, setTemplateTarget] = useState<Episode | null>(null);
  /** 「1日あたりの本数・回の単価を直す」ダイアログの対象回（migration 269・仕様変更 #16）。null = 閉じている */
  const [editTarget, setEditTarget] = useState<Episode | null>(null);

  const list = useQuery<Episode[]>({
    queryKey: ['episodes', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/episodes`, { params: { limit: 200 } })).data.data,
  });

  // 「次の話数」はダイアログのプレビュー表示だけに使う簡易な見積もり
  // （実際の採番はサーバーが取引の中でアトミックに行う。ここは読み込み済みの
  // 一覧の最大値+1でよい — 200件を超える案件が出てきたら見直す）
  const nextNum = (list.data ?? []).reduce((max, e) => Math.max(max, e.episode_number ?? 0), 0) + 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-cardtitle">回（エピソード）</p>
        <p className="text-sub text-muted-foreground">回ごとにタスクと予約を持ちます</p>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />回を足す
        </Button>
      </div>

      {list.isLoading ? (
        <Delayed><SkeletonRows rows={3} /></Delayed>
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          title="回はまだありません"
          description="「回を足す」で最初の回をつくります。"
          action={<Button size="sm" onClick={() => setAddOpen(true)}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />回を足す</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-card">
          <RowHeader className="hidden sm:flex">
            <RowSlot w={56}>回</RowSlot>
            <RowMain>名前</RowMain>
            <RowSlot w={96}>実施日</RowSlot>
            <RowSlot w={128}>タスク</RowSlot>
            <RowSlot w={96}>状態</RowSlot>
            <RowSlot w={56}> </RowSlot>
            <RowSlot w={56}> </RowSlot>
            <RowSlot w={56}> </RowSlot>
          </RowHeader>
          {(list.data ?? []).map((e) => {
            const total = e.task_count ?? 0;
            const done = e.task_done_count ?? 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const st = stateOf(e);
            return (
              <Row key={e.id} divider stackOnMobile align="center">
                <RowSlot w={56}>
                  <span className="text-list font-number font-bold">{e.episode_number}</span>
                </RowSlot>
                <RowMain>
                  <span className="text-list block truncate">{e.title || e.episode_code}</span>
                  {perEpisodeSummary(e) && <RowSub>{perEpisodeSummary(e)}</RowSub>}
                </RowMain>
                <RowSlot w={96}>
                  <span className="text-sub font-number">{dateOf(e)?.replace(/-/g, '/') ?? '—'}</span>
                </RowSlot>
                <RowSlot w={128}>
                  {total > 0 ? (
                    <span className="flex w-full items-center gap-2">
                      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="font-number text-sub-sm w-8 shrink-0 text-right text-muted-foreground">{pct}%</span>
                    </span>
                  ) : (
                    <span className="text-sub-sm text-muted-foreground">—</span>
                  )}
                </RowSlot>
                <TableBadge w={96} label={STATE_LABEL[st]} className={STATE_TONE[st]} />
                {/*
                  「この回の見積」への導線（仕様変更 #18）。見積タブ（`/estimate`）に
                  この回で絞り込んだ状態で遷移する — 見積・売上は見積タブの持ち物なので
                  ここには金額を出さず、リンクだけ置く（この回のトップのコメント参照）
                */}
                <RowSlot w={56}>
                  <Button
                    variant="ghost" size="icon-sm" asChild
                    aria-label={`回 #${e.episode_number} の見積を見る（${e.estimate_count ?? 0}件）`}
                  >
                    <Link to={`/sales/projects/${projectId}/estimate?episode=${e.id}`}>
                      <Receipt className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </RowSlot>
                <RowSlot w={56}>
                  <Button
                    variant="ghost" size="icon-sm"
                    aria-label={`回 #${e.episode_number} の本数・単価を直す`}
                    onClick={() => setEditTarget(e)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </RowSlot>
                <RowSlot w={56}>
                  <Button
                    variant="ghost" size="icon-sm"
                    aria-label={`回 #${e.episode_number} に標準工程を当てる`}
                    onClick={() => setTemplateTarget(e)}
                  >
                    <ListChecks className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </RowSlot>
              </Row>
            );
          })}
        </div>
      )}

      <AddEpisodesDialog
        open={addOpen} onOpenChange={setAddOpen} projectId={projectId} nextNum={nextNum}
        seriesDefaults={seriesDefaults}
      />

      {templateTarget && (
        <ApplyEpisodeTaskTemplateDialog
          open onOpenChange={(o) => { if (!o) setTemplateTarget(null); }}
          projectId={projectId} episodeId={templateTarget.id}
          episodeLabel={`#${templateTarget.episode_number} ${templateTarget.title || templateTarget.episode_code}`}
        />
      )}

      {editTarget && (
        <EditEpisodeDialog
          open onOpenChange={(o) => { if (!o) setEditTarget(null); }}
          projectId={projectId} episode={editTarget}
        />
      )}
    </div>
  );
}
