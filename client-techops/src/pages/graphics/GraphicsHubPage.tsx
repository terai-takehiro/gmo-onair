// テロップCG — ①テロップ一覧（準備）＝ホーム（`/techops/graphics/:ownerKey`）。
//
// **2026-09-06 のゼロベース再設計（docs/design/v4/graphics-redesign.md §5 ①）で作り直した。**
// 変えたこと:
//   ・ヘッダーのボタンを 設定／＋テロップ／本番モード の3つだけにした（旧は7個平積み）
//   ・行を押すと右パネル（`TelopEditorPanel`）に開く。ダイアログの往復をやめた
//   ・状態帯は 全部／確認済み／未確認 の3チップ（絞り込み）＋ 依頼件数の表示
//   ・出す順はドラッグで並べ替えられる（`@dnd-kit`）。**並べ替えても呼出番号は変わらない**
//     （§12-3の決定・`callNo` は据え置き、動かすのは `sortOrder` だけ）
//   ・行に本物の描画サムネイル（`TelopThumb`）を付けた
//   ・「OBS に貼る URL」は最下段の折りたたみにした
// 変えていないこと: データの形・API・名簿からの一括生成（`RosterImportDialog`）・
// 未作画の発注列（`RequestQueueSection`）はそのまま。
import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
  AlertCircle, ChevronDown, ChevronLeft, Loader2, Radio, Settings2, Tv, Type,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { notifyError, notifyInfo } from '@/lib/notify';
import {
  fetchGraphicsRequests, updateGraphicsPage, updateGraphicsRequest,
  type GraphicsBundle, type GraphicsPageRow, type GraphicsRequestRow,
} from '@/lib/graphicsApi';
import { fetchQsheetLiveText } from '@/lib/graphicsQsheetImportApi';
import type { OwnerContext } from '@/lib/deviceSettingsApi';
import { useGraphicsProject } from './useGraphicsProject';
import TelopEditorPanel, { type PageFormInitialValues } from './TelopEditorPanel';
import TelopAddMenu from './TelopAddMenu';
import TelopListSection, { type StatusFilter } from './TelopListSection';
import RequestQueueSection, { graphicsRequestsQueryKey } from './RequestQueueSection';
import RosterImportDialog from './RosterImportDialog';
import QsheetImportDialog from './QsheetImportDialog';
import OutputUrlCard from './OutputUrlCard';
import MobileTelopList from './MobileTelopList';
import { resolveTelopTheme } from './telopTheme';
import { PRIMARY_FIELD_KEY } from './pageFields';

export default function GraphicsHubPage() {
  const { ownerKey } = useParams<{ ownerKey: string }>();
  const { state, reload } = useGraphicsProject(ownerKey);

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }

  if (state.status === 'not-found') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState
          icon={<Type />}
          title="見つかりませんでした"
          description="GLS番号が合っているか確かめてください。"
        />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState icon={<AlertCircle />} title="開けませんでした" description={state.message} />
      </div>
    );
  }

  return <HubContent ownerKey={ownerKey ?? ''} owner={state.owner} bundle={state.bundle} reload={reload} />;
}

function hubPath(owner: OwnerContext): string {
  const id = encodeURIComponent(owner.id);
  return owner.kind === 'project' ? `/techops/projects/${id}` : `/techops/programs/${id}`;
}

/** 台本のいまの文言（段C・「台本と違います」バッジの判定材料）。`RequestQueueSection.tsx` の
 *  `graphicsRequestsQueryKey` と同じ考え方——今はこのファイルだけが使うが、キーを
 *  一か所にまとめておくと invalidate 漏れが起きにくい */
function qsheetLiveTextQueryKey(projectId: string) {
  return ['graphics-qsheet-live-text', projectId] as const;
}

type PanelState =
  | { mode: 'closed' }
  | { mode: 'edit'; pageId: string }
  | { mode: 'new'; initialValues?: PageFormInitialValues; convertingRequestId?: string };

function HubContent({ ownerKey, owner, bundle, reload }: {
  ownerKey: string;
  owner: OwnerContext;
  bundle: GraphicsBundle;
  reload: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<PanelState>({ mode: 'closed' });
  const [rosterOpen, setRosterOpen] = useState(false);
  const [qsheetImportOpen, setQsheetImportOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [obsOpen, setObsOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const requestSectionRef = useRef<HTMLDivElement>(null);

  // 「＋テロップ」の「依頼から作る」が件数を知るためだけの軽い問い合わせ。
  // `RequestQueueSection` 内の同じ `queryKey` の取得と React Query 上でキャッシュを共有する
  // ため、実際の通信が2本になるわけではない
  const pendingRequestsQuery = useQuery({
    queryKey: graphicsRequestsQueryKey(bundle.project.id),
    queryFn: () => fetchGraphicsRequests(bundle.project.id, 'requested'),
  });
  const pendingRequestCount = pendingRequestsQuery.data?.length ?? 0;

  // 台本から取り込んだページの「いまの文言」（段C。「台本と違います」バッジの判定材料）。
  // 取り込み済みページが1件も無いプロジェクトでは空配列が返るだけ（サーバー側は
  // qsheet_row_id が入っている行だけを見る契約 — graphicsQsheetImportApi.ts 冒頭コメント）
  const qsheetLiveTextQuery = useQuery({
    queryKey: qsheetLiveTextQueryKey(bundle.project.id),
    queryFn: () => fetchQsheetLiveText(bundle.project.id),
  });
  const liveTextEntries = useMemo(() => qsheetLiveTextQuery.data ?? [], [qsheetLiveTextQuery.data]);

  const pages = useMemo(
    () => [...bundle.pages].sort((a, b) => (a.sortOrder - b.sortOrder) || (a.callNo - b.callNo)),
    [bundle.pages],
  );
  const isConfirmed = (p: GraphicsPageRow) => p.proofState === 'proofed';
  const unconfirmedCount = pages.filter((p) => !isConfirmed(p)).length;
  const confirmedCount = pages.length - unconfirmedCount;

  // 「台本と違います」の判定（段C）。liveText が null（台本・行・テロップ列のいずれかが
  // 無くなっている）のときは差分ありと判定しない——false negative でよい・誤検知を避ける
  // という設計判断（graphics-redesign.md §9 実装指示）。主フィールドが文字列でない部品
  // （一覧・スコア・ランキング等の配列型）も同じ理由で対象外にする——取り込みが作るのは
  // 常に name/title（inferPartKey）だが、取り込み後に手動で種類を変えることもできるため、
  // 型が合わない組み合わせは「違う」と決め打たず安全側に倒す
  const driftPageIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of liveTextEntries) {
      if (entry.liveText == null) continue;
      const page = pages.find((p) => p.id === entry.pageId);
      if (!page) continue;
      const key = PRIMARY_FIELD_KEY[page.partKey];
      if (!key) continue;
      const current = page.fields[key];
      if (typeof current !== 'string') continue;
      if (current !== entry.liveText) ids.add(page.id);
    }
    return ids;
  }, [liveTextEntries, pages]);

  const visiblePages = filter === 'ok'
    ? pages.filter(isConfirmed)
    : filter === 'un'
    ? pages.filter((p) => !isConfirmed(p))
    : filter === 'drift'
    ? pages.filter((p) => driftPageIds.has(p.id))
    : pages;
  // 並べ替えは「全部」表示のときだけ許す — 絞り込み中に動かすと、見えていない行との
  // 前後関係が分からなくなる（§12-3の決定を安全に運用するための最小限のガード）
  const reorderable = filter === 'all';

  const selectedPage = panel.mode === 'edit' ? pages.find((p) => p.id === panel.pageId) ?? null : null;

  const openNew = (initialValues?: PageFormInitialValues) => { setPanel({ mode: 'new', initialValues }); setAddMenuOpen(false); };
  const openEdit = (page: GraphicsPageRow) => setPanel({ mode: 'edit', pageId: page.id });
  const openConvert = (request: GraphicsRequestRow) => {
    setPanel({
      mode: 'new',
      convertingRequestId: request.id,
      initialValues: {
        name: request.title,
        slot: request.desiredSlot ?? undefined,
        partKey: request.desiredPartKey ?? undefined,
        firstFieldValue: request.detail || request.desiredTiming || undefined,
      },
    });
  };

  const handleSaved = async (savedPage: GraphicsPageRow) => {
    const converting = panel.mode === 'new' ? panel.convertingRequestId : undefined;
    if (converting) {
      try {
        await updateGraphicsRequest(converting, { status: 'converted', convertedPageId: savedPage.id });
      } catch {
        notifyError('依頼を「テロップ化済み」にできませんでした（テロップ自体は作成されています）');
      }
      void queryClient.invalidateQueries({ queryKey: graphicsRequestsQueryKey(bundle.project.id) });
    }
    setPanel({ mode: 'edit', pageId: savedPage.id });
    void reload();
  };

  const handleDeleted = () => {
    setPanel({ mode: 'closed' });
    void reload();
  };

  // 一覧の✓ボタン（即時トグル・パネルのスイッチと同じ挙動に揃える・§12-1）。
  // 文言が空（未完成）の行は押せない — フックの外で早期 return はしない方針どおり、
  // 呼び出し側（JSX）で disabled にする
  const toggleRowConfirmed = async (page: GraphicsPageRow) => {
    setTogglingId(page.id);
    try {
      await updateGraphicsPage(page.id, { proofState: isConfirmed(page) ? 'unproofed' : 'proofed' });
      await reload();
    } catch {
      notifyError('確認の状態を変更できませんでした');
    } finally {
      setTogglingId(null);
    }
  };

  // 「台本と違います」の取り込み直し（段C）。台本のいまの文言を主フィールドへ上書きする
  // だけで liveText 自体は再取得しない——上書き後は page.fields[key] が liveText と
  // 一致するため、次の再描画で driftPageIds から自然に外れる（画面がちらつかない）
  const handleResync = async (page: GraphicsPageRow) => {
    const entry = liveTextEntries.find((e) => e.pageId === page.id);
    if (!entry || entry.liveText == null) return;
    const key = PRIMARY_FIELD_KEY[page.partKey];
    if (!key) return;
    try {
      await updateGraphicsPage(page.id, { fields: { ...page.fields, [key]: entry.liveText } });
      await reload();
    } catch {
      notifyError('台本の文言を取り込み直せませんでした');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(pages, oldIndex, newIndex);
    // 呼出番号（callNo）はここでは一切触らない。sortOrder だけを 10刻みで振り直す
    // （常に全件を書き直す単純な方式 — 端数の詰まりを気にしなくてよい。内部ツールの
    // 規模〈10〜数十件〉であれば並列PATCHで十分な速さ）
    const updates = reordered
      .map((p, i) => ({ page: p, sortOrder: (i + 1) * 10 }))
      .filter(({ page, sortOrder }) => page.sortOrder !== sortOrder);
    if (updates.length === 0) return;
    try {
      await Promise.all(updates.map(({ page, sortOrder }) => updateGraphicsPage(page.id, { sortOrder })));
      await reload();
    } catch {
      notifyError('並べ替えを保存できませんでした');
    }
  };

  const requestSectionScroll = () => {
    setAddMenuOpen(false);
    if (pendingRequestCount === 0) {
      notifyInfo('いま未対応の依頼はありません');
      return;
    }
    requestSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <><div className="hidden sm:block">
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to={hubPath(owner)}
        className="mb-2 inline-flex min-h-tap items-center gap-1 rounded-control-md px-1.5 text-sub font-bold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {owner.kind === 'project' ? '案件ホーム' : '番組ホーム'}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h1">テロップCG</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sub text-muted-foreground">
            <span className="font-bold text-foreground">{owner.name}</span>
            {owner.glsNumber && <span className="font-number rounded-badge-xs bg-primary-surface px-1.5 py-0.5 text-badge font-bold text-primary">{owner.glsNumber}</span>}
          </p>
        </div>
        <div className="relative flex shrink-0 items-center gap-2">
          <Button variant="outline" asChild>
            <Link to={`/techops/graphics/${encodeURIComponent(ownerKey)}/settings`}>
              <Settings2 className="mr-1 h-4 w-4" aria-hidden="true" />設定
            </Link>
          </Button>
          <TelopAddMenu
            open={addMenuOpen}
            onOpenChange={setAddMenuOpen}
            onPickRoster={() => { setAddMenuOpen(false); setRosterOpen(true); }}
            onPickRequestQueue={requestSectionScroll}
            onPickQsheetImport={() => { setAddMenuOpen(false); setQsheetImportOpen(true); }}
            onPickBlank={() => openNew()}
          />
          <Button asChild>
            <Link to={`/techops/graphics/${encodeURIComponent(ownerKey)}/live`}>
              <Radio className="mr-1 h-4 w-4" aria-hidden="true" />本番モード
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-start gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div ref={requestSectionRef}>
            <RequestQueueSection
              projectId={bundle.project.id}
              ownerKey={ownerKey}
              onConvert={openConvert}
            />
          </div>

          <TelopListSection
            pages={pages}
            visiblePages={visiblePages}
            filter={filter}
            onFilterChange={setFilter}
            confirmedCount={confirmedCount}
            unconfirmedCount={unconfirmedCount}
            reorderable={reorderable}
            theme={resolveTelopTheme(bundle.project.theme)}
            selectedPageId={panel.mode === 'edit' ? panel.pageId : null}
            togglingId={togglingId}
            driftPageIds={driftPageIds}
            onOpen={openEdit}
            onToggleConfirmed={(p) => void toggleRowConfirmed(p)}
            onResync={(p) => void handleResync(p)}
            onDragEnd={(e) => void handleDragEnd(e)} projectId={bundle.project.id} followScriptEnabled={bundle.project.followScript} onFollowScriptSaved={() => void reload()}
          />

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setObsOpen((v) => !v)}
              className="flex min-h-tap w-full items-center gap-2 rounded-card border border-border bg-card px-4 py-3 text-left"
            >
              <Tv className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-sub font-bold">OBS に貼る URL</span>
              <span className="flex-1" />
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${obsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {obsOpen && (
              <div className="mt-2">
                <OutputUrlCard projectId={bundle.project.id} />
              </div>
            )}
          </div>
        </div>

        <div className="w-full shrink-0 lg:w-[420px]">
          {panel.mode === 'closed' ? (
            <div className="rounded-card border border-dashed border-border bg-card p-6 text-center">
              <p className="text-sub text-muted-foreground">テロップを選ぶと、ここで直せます。</p>
            </div>
          ) : (
            <TelopEditorPanel
              projectId={bundle.project.id}
              page={selectedPage}
              initialValues={panel.mode === 'new' ? panel.initialValues : undefined}
              theme={resolveTelopTheme(bundle.project.theme)}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              onClose={() => setPanel({ mode: 'closed' })}
            />
          )}
        </div>
      </div>

      <RosterImportDialog
        projectId={bundle.project.id}
        open={rosterOpen}
        onOpenChange={setRosterOpen}
        onImported={() => { void reload(); }}
      />

      <QsheetImportDialog
        projectId={bundle.project.id}
        owner={owner}
        open={qsheetImportOpen}
        onOpenChange={setQsheetImportOpen}
        onImported={() => {
          void reload();
          // 取り込んだページは qsheetRowId を新しく持つため、次に台本側で文言が変わったときに
          // 「台本と違います」が正しく検出できるよう、いまの文言のキャッシュも読み直しておく
          void queryClient.invalidateQueries({ queryKey: qsheetLiveTextQueryKey(bundle.project.id) });
        }}
      />
    </div>
    </div><div className="block px-4 py-6 sm:hidden">{/* ⑥一覧（スマホ・閲覧＋緊急CLEAR。段D）。中身は `MobileTelopList` 側 */}
      <MobileTelopList projectName={bundle.project.name} projectId={bundle.project.id} pages={pages} cues={bundle.cues} reload={reload} />
    </div>
    </>
  );
}
