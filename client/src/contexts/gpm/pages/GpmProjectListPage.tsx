/**
 * ② プロジェクト一覧＝プロジェクト管理の案件台帳 (v4 GPM)
 *
 * ── 絞り込みは画面で掛ける ──────────────────────────────────
 *
 * `GET /gpm/projects` は状態・区分で絞れますが、**絞り込みチップの件数を
 * 返しません**。件数を出すために状態ごとに叩くと5往復になり、遅い1本のせいで
 * 数字が後から入れ替わります。構築プロジェクトは同時に数十件なので、
 * **1回で取って画面で分ける**ほうが正確です（数える場所も1か所になる）。
 * 探している言葉だけはサーバーに渡します（部分一致のエスケープはサーバーの仕事）。
 *
 * ── チップの件数の数え方 ────────────────────────────────────
 *
 * **その軸以外の絞り込みだけ**を掛けて数えます（案件一覧の `stage_counts` と
 * 同じ考え方）。全件の内訳を出すと、検索中に押した先が 0 件になります。
 *
 * ── 「リスト／ボード」の見え方を足した回 ────────────────────
 *
 * 案件管理の案件台帳（`sales/pages/ProjectListPage.tsx`）と**同じ考え方**で
 * 見え方を切り替えられるようにした。**同じ問い合わせの結果を並べ替えているだけ**
 * なので、リストとボードで件数・金額が食い違わない。並び順（おすすめ／見積が
 * 大きい順／期限が近い順）も画面側で並べ替える — 件数が数十件の規模なので、
 * サーバーに並び替えを頼むと1回のやり取りが増えるだけで正確さは変わらない
 * （`useGpmProjects` の説明と同じ理由）。
 *
 * **案件管理の台帳と違って持たせていないもの**: 実施期間の絞り込み・ページ送り・
 * Excel 入出力・並び替え時の FLIP アニメーション。
 * 構築プロジェクトは同時に数十件で、案件のように四半期単位で積み上がる数（数百件）
 * ではないため、まずは軽い形にしてある。件数が増えたら案件台帳から同じ部品を移す。
 *
 * ── ボードはスマホに出さない（2026-08 追記）─────────────────
 *
 * 案件一覧（`sales/pages/ProjectListPage.tsx`）は `useIsMobile()` で「ボード」の
 * 切替ボタン自体を隠している（240px 固定カラムが5列並ぶので、375px では1列も入らない）。
 * この画面には同じガードが無く、スマホでもボードを開けてしまっていた
 * （スマホ最適化の洗い出し 2026-08-20・要対応1）。案件一覧と同じ考え方で塞ぐ。
 *
 * ── スマホの絞り込みをシートに畳んだ（2026-08 追記）───────────
 *
 * 状態チップ・検索・区分・並び順が375pxでも1行にそのまま並び、折り返して縦に
 * 重なっていた（スマホ最適化の洗い出し 2026-08-20・要対応2）。案件一覧・機材台帳
 * などと同じ共通部品（`shared/src/client-v4/mobileFilterBar.tsx`）に載せ替えた。
 * **検索欄だけは畳まない**（探すのは絞り込みではなく目的そのもの、という決めごと）。
 * PC 側は1文字も変えていない。
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, LayoutGrid, Plus, Search } from 'lucide-react';
import { localDateStr } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/platform/AuthContext';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import {
  EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel,
} from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { PullToRefresh } from '@gmo-onair/shared/src/client-v4/pullToRefresh';
import { MobileFilterBar, MobileFilterField, MobileFilterSegments } from '@gmo-onair/shared/src/client-v4/mobileFilterBar';
import { useGpmProjects } from '../queries';
import { KIND_LABEL, STAGE_GROUPS, ymd, type GpmKind, type GpmProjectRow } from '../types';
import { ProjectRow, ProjectRowsHeader } from './projectList/ProjectRows';
import { GpmProjectCards } from './projectList/ProjectCards';
import { GpmProjectBoard } from './projectList/ProjectBoard';
/**
 * 「止まっている」の判定は案件一覧と同じ7日（`STALE_DAYS`）を使う。
 * ここだけ別の日数にすると、案件台帳の「おすすめ順」と並びの理由が食い違う
 * （レビュー指摘 Codex #177 で発見: 以前は並べ替えずサーバーの順のままにしていた）。
 */
import { STALE_DAYS, TERMINAL_STAGES } from '@/contexts/sales/pages/projectList/stages';

type SortKey = 'recommended' | 'estimate_desc' | 'due_asc';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recommended', label: 'おすすめ順' },
  { value: 'estimate_desc', label: '見積金額が大きい順' },
  { value: 'due_asc', label: '期限が近い順' },
];

/** 期限なしは末尾（無いことを「近い」とは見なさない）。null 同士・値同士はそれぞれ元の順を保つ */
function compareDue(da: string | null, db: string | null, tie: number): number {
  if (da === db) return tie;
  if (da === null) return 1;
  if (db === null) return -1;
  return da < db ? -1 : 1;
}

/**
 * **「おすすめ順」は案件台帳の `sort_by=recommended` と同じ考え方で並べる**
 * （`server/.../project.service.ts` の `RECOMMENDED_SORT_SQL`）:
 * ① 動いている案件のうち7日動いていないもの（`STALE_DAYS`）を先に ②期限が近い順
 * ③受注に近い段（進行中 → 準備中の中でも受注に近い順）。
 *
 * サーバーが返す順をそのまま使わないのは、それが「ステージ順 → 実施日 → 作成日」
 * （`gpm.service.ts` の一覧 SQL）で、**止まっている案件を先に出す**という
 * 案件台帳の「おすすめ」の意味を持っていないため（レビュー指摘で発見）。
 * GPM には案件の `last_activity_at`（活動記録）に相当する列が無いので、
 * 止まっている判定は行の `updated_at` で代用する。
 */
function recommendedRank(p: GpmProjectRow, today: number): number {
  if (TERMINAL_STAGES.includes(p.stage)) return 1;
  const t = new Date(p.updated_at).getTime();
  if (!Number.isFinite(t)) return 1;
  return today - t >= STALE_DAYS * 86_400_000 ? 0 : 1;
}

function sortRows(rows: GpmProjectRow[], sort: SortKey): GpmProjectRow[] {
  const withKey = rows.map((p, i) => ({ p, i }));
  if (sort === 'estimate_desc') {
    withKey.sort((a, b) => (b.p.estimate_amount ?? -1) - (a.p.estimate_amount ?? -1) || a.i - b.i);
  } else if (sort === 'due_asc') {
    withKey.sort((a, b) => compareDue(ymd(a.p.next_due), ymd(b.p.next_due), a.i - b.i));
  } else {
    const now = Date.now();
    withKey.sort((a, b) => {
      const rankDiff = recommendedRank(a.p, now) - recommendedRank(b.p, now);
      if (rankDiff !== 0) return rankDiff;
      return compareDue(ymd(a.p.next_due), ymd(b.p.next_due), a.i - b.i);
    });
  }
  return withKey.map((x) => x.p);
}

/**
 * 状態のチップ。**束ねるのは読むときだけ** — 保存するのはいつも `stage` そのもの
 * （`types.ts` の `STAGE_GROUPS`。サーバーの `STAGE_GROUPS` と同じ束ね方）。
 * 「動いているもの」を先頭に置く（毎日見るのはここ）。
 */
const STAGE_CHIPS = [
  { key: 'open', label: '動いているもの',
    stages: [...STAGE_GROUPS[1].stages, ...STAGE_GROUPS[2].stages] },
  ...STAGE_GROUPS.filter((g) => g.key !== 'all'),
  { key: 'all', label: 'すべて', stages: [] as typeof STAGE_GROUPS[number]['stages'] },
];

const KINDS: GpmKind[] = ['self_build', 'group_order'];

export default function GpmProjectListPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  // **作れない人にボタンを出さない。** 出しても押せば権限がありませんと言われるだけ
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  const [stageKey, setStageKey] = useState('open');
  const [kind, setKind] = useState<GpmKind | ''>('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [sort, setSort] = useState<SortKey>('recommended');

  // **スマホでボードを選んだまま画面を回転・PCから引き継いだ場合に備える。**
  // 240px 固定カラムが5列並ぶボードは375pxに1列も入らないので、スマホでは常にリストへ落とす
  useEffect(() => {
    if (isMobile && view === 'board') setView('list');
  }, [isMobile, view]);

  const today = useMemo(() => localDateStr(new Date()), []);
  const { data, isLoading, isError, refetch } = useGpmProjects(search.trim());
  const all = useMemo(() => data ?? [], [data]);

  // 区分だけを掛けた集合。**状態チップの件数はここから数える**
  const byKind = useMemo(() => (kind ? all.filter((p) => p.gpm_kind === kind) : all), [all, kind]);
  const stageFiltered = useMemo(() => {
    const stages = STAGE_CHIPS.find((c) => c.key === stageKey)?.stages ?? [];
    // 「すべて」は畳まない（見送りも含めて全部出す）
    return stages.length === 0 ? byKind : byKind.filter((p) => stages.includes(p.stage));
  }, [byKind, stageKey]);
  const rows = useMemo(() => sortRows(stageFiltered, sort), [stageFiltered, sort]);

  const chips = STAGE_CHIPS.map((c) => ({
    key: c.key,
    label: c.label,
    // 読み込み前は数字を出さない（0 と紛らわしい）
    count: data
      ? (c.stages.length === 0 ? byKind.length : byKind.filter((p) => c.stages.includes(p.stage)).length)
      : null,
  }));

  const activeFilters = [
    search.trim() ? `探している言葉: ${search.trim()}` : null,
    kind ? `区分: ${KIND_LABEL[kind]}` : null,
    stageKey !== 'all' ? `状態: ${STAGE_CHIPS.find((c) => c.key === stageKey)?.label}` : null,
  ].filter((f): f is string => f !== null);

  const clearFilters = () => { setSearch(''); setKind(''); setStageKey('all'); };

  return (
    <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <PageHeader
        title="プロジェクト一覧"
        sub={
          data
            ? `${all.length}件 ・ すべて発注が確定したもの（売れるかどうかを追う段階は案件管理です）`
            : 'すべて発注が確定したもの'
        }
        primaryAction={
          canEdit ? (
            <Button onClick={() => navigate('/gpm/projects/new')}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />プロジェクトを作る
            </Button>
          ) : undefined
        }
      >
        {/* **スマホでは出さない。** ボードは選べても開けない画面になるので、切替そのものを隠す */}
        {!isMobile && (
          <div className="inline-flex shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="見え方を切り替える">
            {([['list', 'リスト', List], ['board', 'ボード', LayoutGrid]] as const).map(([v, label, Icon], i) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn(
                  'min-h-tap text-sub inline-flex items-center gap-1.5 px-3.5 lg:min-h-[40px]',
                  i > 0 && 'border-l border-border',
                  view === v ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
        )}
      </PageHeader>

      {/* **スマホでは畳んでシートで開く。** 状態チップ・区分・並び順の3つが
          375pxでは1行に収まらず折り返して縦に重なっていた */}
      {isMobile ? (
        <MobileFilterBar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'プロジェクト名・依頼元で探す',
            label: 'プロジェクトを探す',
          }}
          activeCount={(stageKey !== 'open' ? 1 : 0) + (kind ? 1 : 0) + (sort !== 'recommended' ? 1 : 0)}
          onClearAll={() => { setStageKey('open'); setKind(''); setSort('recommended'); }}
          title="状態・区分・並び順"
        >
          <MobileFilterField label="状態">
            <FilterChips label="状態で絞り込む" items={chips} value={stageKey} onChange={setStageKey} />
          </MobileFilterField>
          <MobileFilterField label="区分">
            <MobileFilterSegments
              label="区分で絞り込む"
              items={[['', 'すべて'], ...KINDS.map((k) => [k, KIND_LABEL[k]] as const)] as [GpmKind | '', string][]}
              value={kind}
              onChange={setKind}
            />
          </MobileFilterField>
          <MobileFilterField label="並び順">
            <MobileFilterSegments
              label="並び順"
              items={SORT_OPTIONS.map((o) => [o.value, o.label] as [SortKey, string])}
              value={sort}
              onChange={setSort}
            />
          </MobileFilterField>
        </MobileFilterBar>
      ) : (
        <>
          <FilterChips label="状態で絞り込む" items={chips} value={stageKey} onChange={setStageKey} />

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="プロジェクト名・依頼元で探す"
                className="pl-9"
                aria-label="プロジェクトを探す"
              />
            </div>
            <div className="inline-flex overflow-hidden rounded-control border border-border" role="group" aria-label="区分で絞り込む">
              {([['', 'すべての区分'], ...KINDS.map((k) => [k, KIND_LABEL[k]] as const)] as const).map(([v, label], i) => (
                <button
                  key={v || 'all'}
                  type="button"
                  aria-pressed={kind === v}
                  onClick={() => setKind(v as GpmKind | '')}
                  className={cn(
                    'min-h-tap text-sub inline-flex items-center px-3.5 lg:min-h-[40px]',
                    i > 0 && 'border-l border-border',
                    kind === v ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="w-auto min-w-0 gap-1.5" aria-label="並び順">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {isError ? (
        <ErrorPanel title="プロジェクトを読み込めませんでした" onRetry={() => refetch()} />
      ) : isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : rows.length === 0 ? (
        all.length === 0 && !search.trim() ? (
          <EmptyState
            title="プロジェクトがまだありません"
            description="発注が確定した構築案件をここで工程管理します。標準工程を選ぶと、工程とタスクが日付付きで入ります。"
            action={
              canEdit ? (
                <Button onClick={() => navigate('/gpm/projects/new')}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />プロジェクトを作る
                </Button>
              ) : undefined
            }
          />
        ) : (
          <NoSearchResults activeFilters={activeFilters} onClearFilters={clearFilters} />
        )
      ) : view === 'board' ? (
        <GpmProjectBoard rows={rows} today={today} onOpen={(id) => navigate(`/gpm/projects/${id}`)} />
      ) : isMobile ? (
        <PullToRefresh onRefresh={refetch}>
          <GpmProjectCards rows={rows} today={today} onOpen={(id) => navigate(`/gpm/projects/${id}`)} />
        </PullToRefresh>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-card">
          <ProjectRowsHeader />
          {rows.map((p) => (
            <ProjectRow key={p.id} p={p} today={today} onOpen={() => navigate(`/gpm/projects/${p.id}`)} />
          ))}
        </div>
      )}

      <p className="text-note text-muted-foreground">
        「見積」は<strong className="font-bold">いま出ている金額</strong>です
        （束ごとに最新版・値引きを引いた税抜。数え方は案件一覧の「見積金額」と同じ式）。
        請求の状況はプロジェクトを開いて「請求」タブで見ます。
      </p>
    </div>
  );
}
