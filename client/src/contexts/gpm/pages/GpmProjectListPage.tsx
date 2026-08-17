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
 * Excel 入出力・スマホのシート化・並び替え時の FLIP アニメーション。
 * 構築プロジェクトは同時に数十件で、案件のように四半期単位で積み上がる数（数百件）
 * ではないため、まずは軽い形にしてある。件数が増えたら案件台帳から同じ部品を移す。
 */
import { useMemo, useState } from 'react';
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
import { useGpmProjects } from '../queries';
import { KIND_LABEL, STAGE_GROUPS, ymd, type GpmKind, type GpmProjectRow } from '../types';
import { ProjectRow, ProjectRowsHeader } from './projectList/ProjectRows';
import { GpmProjectBoard } from './projectList/ProjectBoard';

type SortKey = 'recommended' | 'estimate_desc' | 'due_asc';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recommended', label: 'おすすめ順' },
  { value: 'estimate_desc', label: '見積金額が大きい順' },
  { value: 'due_asc', label: '期限が近い順' },
];

/**
 * **サーバーが返した順を「おすすめ順」の既定にする。** ここで作り話の重み付けを
 * しない — 画面ごとに違う「おすすめ」の式ができると、案件台帳の「おすすめ順」
 * （`sort_by=recommended`）と意味が食い違う。
 */
function sortRows(rows: GpmProjectRow[], sort: SortKey): GpmProjectRow[] {
  if (sort === 'recommended') return rows;
  const withKey = rows.map((p, i) => ({ p, i }));
  if (sort === 'estimate_desc') {
    withKey.sort((a, b) => (b.p.estimate_amount ?? -1) - (a.p.estimate_amount ?? -1) || a.i - b.i);
  } else {
    // 期限なしは末尾（無いことを「近い」とは見なさない）
    withKey.sort((a, b) => {
      const da = ymd(a.p.next_due);
      const db = ymd(b.p.next_due);
      if (da === db) return a.i - b.i;
      if (da === null) return 1;
      if (db === null) return -1;
      return da < db ? -1 : 1;
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
  // **作れない人にボタンを出さない。** 出しても押せば権限がありませんと言われるだけ
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('gpm', 'editor');
  const [stageKey, setStageKey] = useState('open');
  const [kind, setKind] = useState<GpmKind | ''>('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [sort, setSort] = useState<SortKey>('recommended');

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
      </PageHeader>

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
