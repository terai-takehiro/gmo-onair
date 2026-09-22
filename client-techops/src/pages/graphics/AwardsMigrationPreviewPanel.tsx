// テロップCG — 移行プレビュー（`AwardsMigrationPage.tsx` から切り出し。ファイルサイズ規律・400行）。
// 変換後の graphics_projects / graphics_pages（ranking）のプレビューと、警告つきの
// カテゴリ一覧・「移行する」ボタンを表示する（DBへはまだ何も書き込んでいない段階）。
import { AlertTriangle, CheckCircle2, Info, Loader2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import type { AwardsMigrationPreview } from '@/lib/graphicsAwardsMigrationApi';

const PATTERN_LABELS: Record<string, string> = { direct: 'No.1を直接発表', vote: '投票No.1決定' };

export default function AwardsMigrationPreviewPanel({
  preview, loading, error, committing, onCommit,
}: {
  preview: AwardsMigrationPreview | null;
  loading: boolean;
  error: boolean;
  committing: boolean;
  onCommit: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-card border border-border py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="プレビューを読み込み中" />
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="flex items-center gap-2 rounded-card border border-destructive/40 bg-destructive/5 p-4 text-sub text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />プレビューを取得できませんでした
      </div>
    );
  }

  const totalEntries = preview.pages.reduce((sum, p) => sum + p.entryCount, 0);
  const canCommit = !preview.alreadyMigrated && preview.pages.length > 0;

  return (
    <section className="space-y-3 rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-list font-bold">作成されるテロップCG</p>
          <p className="text-sub text-muted-foreground">
            {preview.project.name}（見た目: 式典（金））
          </p>
        </div>
        <Button type="button" onClick={onCommit} disabled={!canCommit || committing}>
          {committing ? '移行中…' : preview.alreadyMigrated ? '移行済みです' : `移行する（テロップ${preview.pages.length}件・エントリー${totalEntries}件）`}
        </Button>
      </div>

      {preview.alreadyMigrated && (
        <div className="flex items-center gap-2 rounded-card border border-info-border bg-info-surface p-3 text-sub text-info">
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
          このイベントは既に移行済みです。重複して移行することはできません。
        </div>
      )}

      {preview.warnings.length > 0 && (
        <WarningBlock title="イベント全体の警告" warnings={preview.warnings} />
      )}

      {preview.pages.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-5 w-5" aria-hidden="true" />}
          title="このイベントには賞（カテゴリ）がありません"
          description="旧リアルタイムCG側でカテゴリを登録してから、もう一度プレビューを開いてください。"
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border-faint">
          <div className="flex items-center gap-3 border-b border-border-faint bg-surface-subtle px-3 py-2 text-th text-muted-foreground">
            <span className="min-w-0 flex-1">賞名</span>
            <span className="w-32 shrink-0 text-center">パターン</span>
            <span className="w-20 shrink-0 text-center">エントリー</span>
          </div>
          {preview.pages.map((p) => (
            <div key={p.categoryId} className="border-b border-border-faint px-3 py-2.5 last:border-b-0">
              <div className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-list">
                  <Trophy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">
                    {p.categoryName}
                    {p.categoryNameEn && <span className="ml-1 text-note text-muted-foreground">{p.categoryNameEn}</span>}
                  </span>
                </span>
                <span className="w-32 shrink-0 text-center text-sub text-muted-foreground">{PATTERN_LABELS[p.awardPattern] ?? p.awardPattern}</span>
                <span className="font-number w-20 shrink-0 text-center text-sub">{p.entryCount}件</span>
              </div>
              {p.warnings.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 pl-5 text-note text-warning">
                  {p.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{w}
                    </li>
                  ))}
                </ul>
              )}
              {p.warnings.length === 0 && (
                <p className="mt-1 flex items-center gap-1 pl-5 text-note text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-success" aria-hidden="true" />警告なし
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WarningBlock({ title, warnings }: { title: string; warnings: string[] }) {
  return (
    <div className="rounded-card border border-warning-border bg-warning-surface p-3">
      <p className="mb-1 flex items-center gap-1.5 text-sub font-bold">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />{title}
      </p>
      <ul className="space-y-0.5 text-note text-muted-foreground">
        {warnings.map((w, i) => <li key={i}>{w}</li>)}
      </ul>
    </div>
  );
}
