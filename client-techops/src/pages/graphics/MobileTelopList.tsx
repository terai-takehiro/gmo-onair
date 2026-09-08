// テロップCG — ⑥一覧（スマホ・閲覧＋緊急CLEAR）。`GraphicsHubPage.tsx` の
// `block sm:hidden` ブロックから呼ばれる（段D・docs/design/v4/graphics-redesign.md §5 ⑥・§12-4）。
// ①と同じURL（`/techops/graphics/:ownerKey`）だが、狭い画面のときだけこちらが描画される。
//
// **読み取り専用。** 文言の編集・並べ替え・NEXT送出は一切できない——できるのは
// 「いま出ているもの」を確認なしの1タップで消すことだけ（§12-4の決定。PCのCLEARと違い
// 確認ダイアログを経由しない）。見出し・案内文・一覧・緊急CLEARの実装を丸ごとこの
// ファイルが持つ（`GraphicsHubPage.tsx` の400行規律のため・呼び出し側は props を渡すだけ）。
//
// PCの②本番モード（`ConsoleSlotLanes.tsx`／`ConsolePageList.tsx`）と見た目の系統は合わせるが、
// あちらは送出コンソールそのもの・こちらは閲覧＋緊急停止だけの別物のため実装は独立させた
// （ドラッグハンドル・NEXT化・「進める」操作は一切持たない）。
import { Fragment, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { PageShell } from '@gmo-onair/shared/src/client/ui/pageShell';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { notifyError } from '@/lib/notify';
import {
  PART_LABELS, setGraphicsCue,
  type GraphicsCueRow, type GraphicsPageRow, type GraphicsSlot,
} from '@/lib/graphicsApi';
import { groupPagesBySection } from './telopGrouping';

export default function MobileTelopList({ projectName, projectId, pages, cues, reload }: {
  projectName: string;
  projectId: string;
  /** 出す順（呼び出し側で既に sortOrder/callNo でソート済み） */
  pages: GraphicsPageRow[];
  cues: GraphicsCueRow[];
  reload: () => Promise<void>;
}) {
  // 「いま出ているもの」をなるべく最新に保つための定期リロード（段D）。`reload` は
  // `useGraphicsProject.ts` 側で `useCallback(…, [])` の安定参照のため無限ループしない
  useEffect(() => {
    const id = setInterval(() => { void reload(); }, 5000);
    return () => clearInterval(id);
  }, [reload]);

  // 「消す」ボタンの二重押し防止用。押している間はそのスロットのボタンだけ disabled にする
  const [clearingSlot, setClearingSlot] = useState<GraphicsSlot | null>(null);

  // 緊急CLEAR（§12-4）。**確認ダイアログを一切経由しない**——押した瞬間に OUT する
  const handleClearSlot = async (slot: GraphicsSlot) => {
    setClearingSlot(slot);
    try {
      await setGraphicsCue(projectId, slot, null);
      await reload();
    } catch {
      notifyError('消せませんでした');
    } finally {
      setClearingSlot(null);
    }
  };

  const pageById = new Map(pages.map((p) => [p.id, p] as const));
  // 「いま出ているもの」＝ pageId を持つ cue を、対応するページと突き合わせたもの。
  // ページが見つからない（削除済み等）cue は表示しない — 消せないものを見せても事故のもと
  const onAirRows = cues
    .filter((c): c is GraphicsCueRow & { pageId: string } => !!c.pageId)
    .map((cue) => ({ cue, page: pageById.get(cue.pageId) }))
    .filter((row): row is { cue: GraphicsCueRow & { pageId: string }; page: GraphicsPageRow } => !!row.page);

  return (
    <PageShell>
      <PageHeader
        title={projectName}
        sub="編集・並べ替えはPCのテロップ一覧で行ってください。「いま出ているもの」だけ、緊急時はここから消せます。"
      />

      <div className="space-y-4">
        {/* 0件なら帯ごと出さない（①の RequestQueueSection と同じ「0件なら null」の作法） */}
        {onAirRows.length > 0 && (
          <section className="overflow-hidden rounded-card border border-destructive-border bg-destructive-surface">
            <div className="flex items-center gap-1.5 px-4 py-2 text-note font-bold text-destructive">
              <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" aria-hidden="true" />
              いま出ているもの（{onAirRows.length}）
            </div>
            {onAirRows.map(({ cue, page }) => (
              <div
                key={cue.slot}
                className="flex min-h-tap items-center gap-3 border-t border-destructive-border/50 bg-card px-4 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-list font-bold">{page.name}</p>
                  <p className="text-note text-muted-foreground">{PART_LABELS[page.partKey]}</p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="min-h-tap shrink-0"
                  aria-label={`「${page.name}」を消す`}
                  disabled={clearingSlot === cue.slot}
                  onClick={() => void handleClearSlot(cue.slot)}
                >
                  {clearingSlot === cue.slot
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : '消す'}
                </Button>
              </div>
            ))}
          </section>
        )}

        <section>
          <h2 className="text-th font-bold text-muted-foreground">出す順</h2>
          <div className="mt-2 overflow-hidden rounded-card border border-border bg-card">
            {pages.length === 0 ? (
              <EmptyState title="テロップがまだありません" description="PCのテロップ一覧から作れます。" />
            ) : (
              groupPagesBySection(pages).map((group) => (
                <Fragment key={group.pages[0].id}>
                  {group.section != null && (
                    <div className="border-b border-border-faint bg-surface-subtle px-4 py-1.5 text-note font-bold text-muted-foreground">
                      {group.section}
                    </div>
                  )}
                  {group.pages.map((page) => (
                    <MobileTelopRow key={page.id} page={page} />
                  ))}
                </Fragment>
              ))
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

/**
 * 読み取り専用の行。**押しても何も起きない**——onClick は一切付けない
 * （編集・並べ替えはこの画面の対象外・§5「編集はしない」）。
 * タップ領域だけは他の画面と同じ `min-h-tap`（44px）を確保しておく。
 */
function MobileTelopRow({ page }: { page: GraphicsPageRow }) {
  const confirmed = page.proofState === 'proofed';
  return (
    <div className="flex min-h-tap items-center gap-3 border-b border-border-faint px-4 py-2 last:border-b-0">
      <span className="font-number w-9 shrink-0 text-right text-list font-bold">{page.callNo}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-list">{page.name}</span>
        <span className="block text-note text-muted-foreground">{PART_LABELS[page.partKey]}</span>
      </span>
      {confirmed ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" aria-label="確認済み" />
      ) : (
        <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" aria-label="未確認" />
      )}
    </div>
  );
}
