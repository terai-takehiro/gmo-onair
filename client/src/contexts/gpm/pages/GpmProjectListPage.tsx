/**
 * ② プロジェクト一覧 (v4 GPM)
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
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { localDateStr } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/platform/AuthContext';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import {
  EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel,
} from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useGpmProjects } from '../queries';
import { KIND_LABEL, type GpmKind, type GpmStatus } from '../types';
import { ProjectRow, ProjectRowsHeader } from './projectList/ProjectRows';

/** 状態のチップ。「動いているもの」を先頭に置く（毎日見るのはここ） */
const STATUS_CHIPS: { key: string; label: string; statuses: GpmStatus[] }[] = [
  { key: 'open', label: '動いているもの', statuses: ['active', 'planning'] },
  { key: 'active', label: '進行中', statuses: ['active'] },
  { key: 'planning', label: '準備中', statuses: ['planning'] },
  { key: 'onhold', label: '保留', statuses: ['onhold'] },
  { key: 'done', label: '完了', statuses: ['done'] },
  { key: 'all', label: 'すべて', statuses: ['active', 'planning', 'onhold', 'done'] },
];

const KINDS: GpmKind[] = ['self_build', 'group_order'];

export default function GpmProjectListPage() {
  const navigate = useNavigate();
  // **作れない人にボタンを出さない。** 出しても押せば権限がありませんと言われるだけ
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('gpm', 'editor');
  const [statusKey, setStatusKey] = useState('open');
  const [kind, setKind] = useState<GpmKind | ''>('');
  const [search, setSearch] = useState('');

  const today = useMemo(() => localDateStr(new Date()), []);
  const { data, isLoading, isError, refetch } = useGpmProjects(search.trim());
  const all = useMemo(() => data ?? [], [data]);

  // 区分だけを掛けた集合。**状態チップの件数はここから数える**
  const byKind = useMemo(() => (kind ? all.filter((p) => p.kind === kind) : all), [all, kind]);
  const rows = useMemo(() => {
    const statuses = STATUS_CHIPS.find((c) => c.key === statusKey)?.statuses ?? [];
    return byKind.filter((p) => statuses.includes(p.status));
  }, [byKind, statusKey]);

  const chips = STATUS_CHIPS.map((c) => ({
    key: c.key,
    label: c.label,
    // 読み込み前は数字を出さない（0 と紛らわしい）
    count: data ? byKind.filter((p) => c.statuses.includes(p.status)).length : null,
  }));

  const activeFilters = [
    search.trim() ? `探している言葉: ${search.trim()}` : null,
    kind ? `区分: ${KIND_LABEL[kind]}` : null,
    statusKey !== 'all' ? `状態: ${STATUS_CHIPS.find((c) => c.key === statusKey)?.label}` : null,
  ].filter((f): f is string => f !== null);

  const clearFilters = () => { setSearch(''); setKind(''); setStatusKey('all'); };

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
      />

      <FilterChips label="状態で絞り込む" items={chips} value={statusKey} onChange={setStatusKey} />

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
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-card">
          <ProjectRowsHeader />
          {rows.map((p) => (
            <ProjectRow key={p.id} p={p} today={today} onOpen={() => navigate(`/gpm/projects/${p.id}`)} />
          ))}
        </div>
      )}

      <p className="text-note text-muted-foreground">
        金額の列はありません。プロジェクト管理には見積・請求のデータがまだ入っていないので、
        持っていない数字を並べないようにしています。
      </p>
    </div>
  );
}
