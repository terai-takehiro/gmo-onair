/**
 * 「回（エピソード）」の一覧（v4・案件詳細の「回」タブ ＋ タスクタブの折りたたみ）
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
 * （タスクタブの絞り込み）もスタジオ予約ダイアログも「既存の回から選ぶ」
 * だけで、作る口を持たない。レギュラー（GLS-A）案件は今日も回を増やしながら
 * 運用しているので、モックの簡易表と「回を足す」ボタンを残した（ご判断）。
 *
 * ── 「利用日でまとめて」見せる（9/2 の仕様変更・調査項目 S5） ──────────
 *
 * 実務は「9/7｜#17,18,19」と**日で束ねて**数える。回を1行ずつ並べて実施日を
 * 列で出す形だと、同じ日に3本撮った日が3行に散って「その日は何本か」が読めない。
 * そこで**利用日（収録日。無ければ放送日）の見出し＋その日の回**という形にした。
 * `episodes` に日付の実体テーブルは足していない（`recording_date` で束ねるだけ
 * ＝`docs/design/v4/regular-series.md` §2 の決めごとのまま）。
 *
 * ── 状態は自動で決める ─────────────────────────────────────
 *
 * `episodes.status` は自由文で運用されておらず、誰も書いていない。
 * 旧モックの「各回の状態は工程の進み方で自動で決まります」という決めごとを
 * そのまま踏襲し、**タスクの完了件数から導出する**（未着手／進行中／完了）。
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, ListChecks, Pencil, Receipt, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/platform/AuthContext';
import { Button } from '@/components/ui/button';
import { Row, RowHeader, RowMain, RowSlot, RowSub } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { describeEpisodeNumbers } from '@gmo-onair/shared/src/production/episodeSpec';
import type { Episode } from '@gmo-onair/shared/src/types';
import { ApplyEpisodeTaskTemplateDialog } from './ApplyEpisodeTaskTemplateDialog';
import { EditEpisodeDialog } from './EditEpisodeDialog';
import { AddEpisodesDialog, type SeriesDefaults } from './AddEpisodesDialog';

/** 呼び出し元（`TasksTab.tsx`・案件詳細の回タブ）が渡す「レギュラーの取り決め」 */
export type { SeriesDefaults };

type EpisodeState = 'todo' | 'doing' | 'done';

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
const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

/** 利用日。収録日が無ければ放送日にフォールバックする（生放送は収録＝放送のため） */
function dateOf(e: Episode): string | null {
  return e.recording_date || e.broadcast_date || null;
}

/** 見出しの日付。`2026-09-07` を `2026/09/07（月）` にする */
function formatDateHead(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const wd = Number.isNaN(d.getTime()) ? '' : `（${WEEKDAY[d.getDay()]}）`;
  return `${iso.replace(/-/g, '/')}${wd}`;
}

/**
 * この回の「1日あたりの本数」（migration 269・仕様変更 #16）と、
 * この回に紐づく見積・売上の件数を一行で表す。
 *
 * ⚠️ 「回の単価」（`episode_unit_price`）は 2026-09 の依頼で廃止した——
 * 1日で複数本撮ると回あたりの単価が下がるため固定値は成立せず、金額は
 * ひとまとまり（見積・確定売上）単位で持つ（`shared/src/types.ts` の `Episode` 参照）。
 *
 * どれも決めていなければ何も出さない（0本との混同を避けるため、
 * 「決めていない」は空文字を返す＝行に何も表示しない）
 */
function perEpisodeSummary(e: Episode): string {
  const parts: string[] = [];
  if (e.recording_per_day_count != null) parts.push(`1日${e.recording_per_day_count}本`);
  // 0件のときは出さない（「まだ無い」を毎行に書くと、回が多い案件ほど画面が煩雑になる）
  if (e.estimate_count) parts.push(`見積${e.estimate_count}件`);
  if (e.revenue_count) parts.push(`売上${e.revenue_count}件`);
  return parts.join('・');
}

interface EpisodeGroup {
  /** 利用日（`null` = まだ決まっていない回の束） */
  date: string | null;
  episodes: Episode[];
}

/**
 * 利用日で束ねる。日付の無い回は**末尾に1つの束**としてまとめる
 * （消さない — 「話数で指定」で作った回は日付を持たないので、ここから
 * 「この回を直す」に入って日を入れてもらう導線が要る）。
 */
export function groupEpisodesByDate(episodes: Episode[]): EpisodeGroup[] {
  const byDate = new Map<string, Episode[]>();
  const undated: Episode[] = [];
  for (const e of episodes) {
    const d = dateOf(e);
    if (!d) { undated.push(e); continue; }
    const bucket = byDate.get(d);
    if (bucket) bucket.push(e); else byDate.set(d, [e]);
  }
  const groups: EpisodeGroup[] = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => ({ date, episodes: list }));
  if (undated.length > 0) groups.push({ date: null, episodes: undated });
  return groups;
}

/**
 * 見出しに出す「#17〜#19　3件」。
 *
 * ⚠️ 以前はここに単価×件数の合計金額も出していたが、「回の単価」概念の廃止に伴い削除した
 * — 金額は「ひとまとまり」の見積・確定売上（別担当が実装）が持つため、ここでは数えない。
 */
function groupSummary(episodes: Episode[]): string {
  const numbers = episodes.map((e) => e.episode_number).filter((n) => Number.isFinite(n));
  return [describeEpisodeNumbers(numbers), `${episodes.length}件`].filter(Boolean).join('　');
}

function EpisodeRow({
  episode, projectId, canDelete, onEdit, onApplyTemplate, onDelete,
}: {
  episode: Episode;
  projectId: string;
  /** `sales` の `manager` 以上だけ削除ボタンを出す（サーバー側の権限と揃える） */
  canDelete: boolean;
  onEdit: (e: Episode) => void;
  onApplyTemplate: (e: Episode) => void;
  onDelete: (e: Episode) => void;
}) {
  const total = episode.task_count ?? 0;
  const done = episode.task_done_count ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const st = stateOf(episode);
  const summary = perEpisodeSummary(episode);

  return (
    <Row divider stackOnMobile align="center">
      <RowSlot w={56}>
        <span className="text-list font-number font-bold">{episode.episode_number}</span>
      </RowSlot>
      <RowMain>
        <span className="text-list block truncate">{episode.title || episode.episode_code}</span>
        {summary && <RowSub>{summary}</RowSub>}
      </RowMain>
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
        「この回の見積・売上」への導線（仕様変更 #18）。見積タブ（`/estimate`）に
        この回で絞り込んだ状態で遷移する — 見積の版一覧も「売上・請求」ペインも
        そのタブが持っているので、ここには金額を出さずリンクだけ置く
      */}
      <RowSlot w={56}>
        <Button
          variant="ghost" size="icon-sm" asChild
          aria-label={`回 #${episode.episode_number} の見積・売上を見る（見積${episode.estimate_count ?? 0}件）`}
        >
          <Link to={`/sales/projects/${projectId}/estimate?episode=${episode.id}`}>
            <Receipt className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </RowSlot>
      <RowSlot w={56}>
        <Button
          variant="ghost" size="icon-sm"
          aria-label={`回 #${episode.episode_number} を直す（利用日・放送日・タイトル・本数・フェーズ）`}
          onClick={() => onEdit(episode)}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
      </RowSlot>
      <RowSlot w={56}>
        <Button
          variant="ghost" size="icon-sm"
          aria-label={`回 #${episode.episode_number} に標準工程を当てる`}
          onClick={() => onApplyTemplate(episode)}
        >
          <ListChecks className="h-4 w-4" aria-hidden="true" />
        </Button>
      </RowSlot>
      <RowSlot w={56}>
        {canDelete && (
          <Button
            variant="ghost" size="icon-sm"
            aria-label={`回 #${episode.episode_number} を削除する`}
            onClick={() => onDelete(episode)}
          >
            <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
          </Button>
        )}
      </RowSlot>
    </Row>
  );
}

export function EpisodesPanel({ projectId, seriesDefaults }: { projectId: string; seriesDefaults?: SeriesDefaults }) {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  // サーバー（`episodes.routes.ts` の `requirePermission('sales', 'manager')`）と揃える。
  // ボタンだけ隠しても他画面から呼べば 403 になるが、押せるのに弾かれる体験を避ける
  const canDelete = hasPermission('sales', 'manager');
  const [addOpen, setAddOpen] = useState(false);
  /** 「標準工程を当てる」ダイアログの対象回。null = 閉じている */
  const [templateTarget, setTemplateTarget] = useState<Episode | null>(null);
  /** 「この回を直す」ダイアログの対象回。null = 閉じている */
  const [editTarget, setEditTarget] = useState<Episode | null>(null);

  const list = useQuery<Episode[]>({
    queryKey: ['episodes', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/episodes`, { params: { limit: 200 } })).data.data,
    // **開くたびに必ず読み直す**（ProjectDetailPage.tsx の `['project', id]` と同じ注記）。
    // `useEstimateEpisodeFilter.ts` が同じ鍵を持つので、そちらとオプションを揃えてある
    // （揃えないと1つの鍵に2つの観測者が違う挙動をする、という DetailHeader.tsx が
    // 直前まで踏んでいたのと同じ形になる）
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const episodes = useMemo(() => list.data ?? [], [list.data]);
  const groups = useMemo(() => groupEpisodesByDate(episodes), [episodes]);

  // 「次の話数」はダイアログのプレビュー表示だけに使う簡易な見積もり
  // （実際の採番はサーバーが取引の中でアトミックに行う。ここは読み込み済みの
  // 一覧の最大値+1でよい）
  const nextNum = episodes.reduce((max, e) => Math.max(max, e.episode_number ?? 0), 0) + 1;

  // ソフトデリート。売上・仕入が紐づく回はサーバーが 409（`EPISODE_HAS_FINANCE_RECORDS`）
  // で拒否し、`notifyApiError` がそのメッセージ（何件紐づいているか）をそのまま出す
  const remove = useMutation({
    mutationFn: (episodeId: string) => api.delete(`/projects/${projectId}/episodes/${episodeId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['episodes', projectId] });
      // 削除した回が請求まとめ（invoice_groups）に入っていた場合に備えて、
      // `EditEpisodeDialog.tsx`・`DatedEpisodesForm.tsx` と同じ対で落とす
      qc.invalidateQueries({ queryKey: ['invoice-groups', projectId] });
      notifySuccess('回を削除しました');
    },
    onError: (e) => notifyApiError('削除できませんでした', e),
  });

  const handleDelete = async (e: Episode) => {
    const ok = await confirmAction({
      title: `#${e.episode_number} ${e.title || e.episode_code} を削除しますか？`,
      description: '紐づく売上・仕入があると削除できません。先に財務管理の売上・仕入台帳でこの回の紐づきを外してください。元に戻せません。',
      confirmLabel: '削除する',
      tone: 'danger',
    });
    if (ok) remove.mutate(e.id);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-cardtitle">回（エピソード）</p>
        <p className="text-sub text-muted-foreground">利用日ごとにまとめています。回ごとにタスク・見積・売上を持ちます</p>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />回を足す
        </Button>
      </div>

      {list.isLoading ? (
        <Delayed><SkeletonRows rows={3} /></Delayed>
      ) : episodes.length === 0 ? (
        <EmptyState
          title="回はまだありません"
          description="「回を足す」で、利用日とその日の回（例: 9/7 に #17,18,19）を登録します。"
          action={<Button size="sm" onClick={() => setAddOpen(true)}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />回を足す</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.date ?? 'undated'} className="overflow-hidden rounded-card border border-border bg-card">
              {/* 利用日の見出し。ここが実務の数え方の単位（「9/7 に3本」） */}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-surface-subtle px-4 py-2">
                <span className="text-list font-number font-bold">
                  {g.date ? formatDateHead(g.date) : '利用日が未設定'}
                </span>
                <span className="text-sub text-muted-foreground">{groupSummary(g.episodes)}</span>
                {!g.date && (
                  <span className="text-sub-sm text-warning">
                    鉛筆から利用日を入れられます
                  </span>
                )}
              </div>
              <RowHeader className="hidden sm:flex">
                <RowSlot w={56}>回</RowSlot>
                <RowMain>名前</RowMain>
                <RowSlot w={128}>タスク</RowSlot>
                <RowSlot w={96}>状態</RowSlot>
                <RowSlot w={56}> </RowSlot>
                <RowSlot w={56}> </RowSlot>
                <RowSlot w={56}> </RowSlot>
                <RowSlot w={56}> </RowSlot>
              </RowHeader>
              {g.episodes.map((e) => (
                <EpisodeRow
                  key={e.id} episode={e} projectId={projectId} canDelete={canDelete}
                  onEdit={setEditTarget} onApplyTemplate={setTemplateTarget} onDelete={handleDelete}
                />
              ))}
            </div>
          ))}
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
          // 対象が裏（react-query）で変わっても取り違えないよう、回ごとに作り直す
          key={editTarget.id}
          open onOpenChange={(o) => { if (!o) setEditTarget(null); }}
          projectId={projectId} episode={editTarget}
        />
      )}
    </div>
  );
}
