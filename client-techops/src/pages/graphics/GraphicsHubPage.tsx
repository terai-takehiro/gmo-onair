// テロップCG — ハブ画面（`/techops/graphics/:ownerKey`・モック①「ページと送出リスト」）。
//
// 段1（docs/design/v4/graphics.md §9）の範囲:
//   ・owner（案件 or 番組）→ CGプロジェクトの取得または作成（useGraphicsProject）
//   ・ページ一覧（番号／スロット／ページ名／校正の状態）と最小の作成・編集・削除
//   ・送出コンソールへの導線と「出力URLの配り方」カード
// テンプレート編集は後の段（モックには居るが未実装）。
// 名簿からの一括生成は「名簿から一括生成」ボタン（`RosterImportDialog`）で実装済み。
// 発注（テロ原・段5）は `RequestQueueSection`（未作画の列。「ページにする」で
// `PageFormDialog` を事前入力して開く）と、スマホ発注フォーム（`RequestFormPage.tsx`・
// PC専用リストの対象外）で実装済み。
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Blocks, ChevronLeft, ClipboardList, Loader2, Pencil, Plus, Radio, Trash2, Type, AlertCircle, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  deleteGraphicsPage, updateGraphicsRequest,
  type GraphicsBundle, type GraphicsPageRow, type GraphicsRequestRow,
} from '@/lib/graphicsApi';
import type { OwnerContext } from '@/lib/deviceSettingsApi';
import { useGraphicsProject } from './useGraphicsProject';
import { SlotBadge, ProofBadge } from './badges';
import PageFormDialog, { type PageFormInitialValues } from './PageFormDialog';
import RequestQueueSection, { graphicsRequestsQueryKey } from './RequestQueueSection';
import RosterImportDialog from './RosterImportDialog';
import OutputUrlCard from './OutputUrlCard';
import ThemePicker from './ThemePicker';
import SlotExitRulesEditor from './SlotExitRulesEditor';
import { resolveTelopTheme } from './telopTheme';

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
          description="GLS番号・案件ID・番組IDを確認してください。"
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

function HubContent({ ownerKey, owner, bundle, reload }: {
  ownerKey: string;
  owner: OwnerContext;
  bundle: GraphicsBundle;
  reload: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GraphicsPageRow | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  // 発注（テロ原）からの「ページにする」で開いたときだけ非null。保存できたら
  // その発注を converted にして紐づける（RequestQueueSection のコメント参照）
  const [converting, setConverting] = useState<GraphicsRequestRow | null>(null);

  const pages = [...bundle.pages].sort((a, b) => (a.sortOrder - b.sortOrder) || (a.callNo - b.callNo));
  const liveCount = bundle.cues.filter((c) => c.pageId !== null).length;

  const openCreate = () => { setEditing(null); setConverting(null); setFormOpen(true); };
  const openEdit = (page: GraphicsPageRow) => { setEditing(page); setConverting(null); setFormOpen(true); };
  const openConvert = (request: GraphicsRequestRow) => { setEditing(null); setConverting(request); setFormOpen(true); };

  const convertInitialValues: PageFormInitialValues | undefined = converting ? {
    name: converting.title,
    slot: converting.desiredSlot ?? undefined,
    partKey: converting.desiredPartKey ?? undefined,
    firstFieldValue: converting.detail || converting.desiredTiming || undefined,
  } : undefined;

  const handleSaved = async (savedPage: GraphicsPageRow) => {
    if (converting) {
      try {
        await updateGraphicsRequest(converting.id, { status: 'converted', convertedPageId: savedPage.id });
      } catch {
        notifyError('発注を「ページ化済み」にできませんでした（ページ自体は作成されています）');
      }
      setConverting(null);
      void queryClient.invalidateQueries({ queryKey: graphicsRequestsQueryKey(bundle.project.id) });
    }
    void reload();
  };

  const removePage = async (page: GraphicsPageRow) => {
    if (!(await confirmAction({
      title: `ページ「${page.name}」を削除しますか？`,
      description: `番号 ${page.callNo} のページが消えます。送出リストからも外れます。`,
      confirmLabel: '削除する',
      tone: 'danger',
    }))) return;
    try {
      await deleteGraphicsPage(page.id);
      notifySuccess('ページを削除しました');
      await reload();
    } catch {
      notifyError('ページを削除できませんでした');
    }
  };

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to={hubPath(owner)}
        className="mb-2 inline-flex min-h-tap items-center gap-1 rounded-control-md px-1.5 text-sub font-bold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {owner.kind === 'project' ? '案件ホーム' : '番組ホーム'}
      </Link>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <h1 className="text-h1">テロップCG ／ {owner.name}</h1>
          <p className="mt-1 text-sub text-muted-foreground">
            ページに<strong>呼出番号</strong>が付きます。本番前にここで組み、当日は送出コンソールで並びどおり出すだけにします。
          </p>
        </div>
        <div className="flex-1" />
        <ThemePicker
          projectId={bundle.project.id}
          theme={bundle.project.theme}
          onSaved={reload}
        />
        <Button variant="outline" asChild>
          <Link to={`/techops/graphics/${encodeURIComponent(ownerKey)}/parts`}>
            <Blocks className="mr-1 h-4 w-4" aria-hidden="true" />部品ライブラリ
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to={`/techops/graphics/${encodeURIComponent(ownerKey)}/live`}>
            <Radio className="mr-1 h-4 w-4" aria-hidden="true" />送出コンソールへ
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to={`/techops/graphics/${encodeURIComponent(ownerKey)}/request`}>
            <ClipboardList className="mr-1 h-4 w-4" aria-hidden="true" />発注フォーム
          </Link>
        </Button>
        <Button variant="outline" onClick={() => setRosterOpen(true)}>
          <Users className="mr-1 h-4 w-4" aria-hidden="true" />名簿から一括生成
        </Button>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />ページを作る
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-4 rounded-card border border-border bg-card px-4 py-2.5">
        <Stat label="ページ" value={`${pages.length}件`} />
        <span className="h-5 w-px bg-border-faint" aria-hidden="true" />
        <Stat label="校正済み" value={`${pages.filter((p) => p.proofState === 'proofed').length}件`} />
        <span className="h-5 w-px bg-border-faint" aria-hidden="true" />
        <Stat label="オンエア中のスロット" value={`${liveCount}件`} />
      </div>

      <SlotExitRulesEditor projectId={bundle.project.id} rules={bundle.project.slotExitRules} onSaved={reload} />

      <RequestQueueSection projectId={bundle.project.id} ownerKey={ownerKey} onConvert={openConvert} />

      <section className="mt-4 overflow-hidden rounded-card border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border-faint bg-surface-subtle px-4 py-2 text-th text-muted-foreground">
          <span className="font-number w-11 shrink-0 text-right">番号</span>
          <span className="w-24 shrink-0 text-center">スロット</span>
          <span className="min-w-0 flex-1">ページ</span>
          <span className="hidden w-[72px] shrink-0 text-center sm:block">校正</span>
          <span className="w-[96px] shrink-0 text-center">操作</span>
        </div>
        {pages.length === 0 ? (
          <EmptyState
            title="ページがまだありません"
            description="「ページを作る」から最初のページ（ネーム・題字など）を作るとここに並びます。"
          />
        ) : pages.map((p) => (
          <div key={p.id} className="flex items-center gap-3 border-b border-border-faint px-4 py-2 last:border-b-0 hover:bg-surface-subtle">
            <span className="font-number w-11 shrink-0 text-right text-list font-bold">{p.callNo}</span>
            <span className="flex w-24 shrink-0 justify-center"><SlotBadge slot={p.slot} w={null} /></span>
            <span className="min-w-0 flex-1 truncate text-list">{p.name}</span>
            <span className="hidden w-[72px] shrink-0 justify-center sm:flex"><ProofBadge state={p.proofState} w={null} /></span>
            <span className="flex w-[96px] shrink-0 justify-end gap-1">
              <Button type="button" variant="ghost" size="icon" aria-label={`ページ「${p.name}」を編集`} onClick={() => openEdit(p)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={`ページ「${p.name}」を削除`} onClick={() => removePage(p)}>
                <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
              </Button>
            </span>
          </div>
        ))}
      </section>

      <div className="mt-4">
        <OutputUrlCard projectId={bundle.project.id} />
      </div>

      <PageFormDialog
        projectId={bundle.project.id}
        page={editing}
        initialValues={convertInitialValues}
        theme={resolveTelopTheme(bundle.project.theme)}
        open={formOpen}
        onOpenChange={(next) => { setFormOpen(next); if (!next) setConverting(null); }}
        onSaved={handleSaved}
      />

      <RosterImportDialog
        projectId={bundle.project.id}
        open={rosterOpen}
        onOpenChange={setRosterOpen}
        onImported={() => { void reload(); }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-note text-muted-foreground">{label}</span>
      <span className="font-number text-list font-bold">{value}</span>
    </span>
  );
}
