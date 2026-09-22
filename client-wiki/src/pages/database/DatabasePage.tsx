/**
 * ⑩ データベース `/wiki/p/:id`（`kind='database'` のページ・設計 §6-⑩）
 *
 * ページ②と**同じ形**です。中央は本文（説明）の下にビューのタブ（表／ボード／
 * カレンダー）・絞り込み・「行を追加」、右パネルは「項目」（列の定義）。
 *
 * ⚠️ **ナビの列は増やしません。** ツリーは共通の左メニューの中に差し込みます
 *    （2026-09-22 のご指摘「サイドタブが増えすぎて窮屈」）。
 *
 * ⚠️ **スマホで隠すのは並べ替え・項目の定義・ビューの追加だけ**（設計 §6-⑩）。
 *    行の追加と値の編集はスマホでもできるので、`WIKI_PC_ONLY` には入れません。
 *
 * ⚠️ `useIsMobile()` で早い段階に `return` しない（幅が変わるとフックの数が変わって落ちる）。
 *    表とカードの出し分けは、フックを全部呼んだあとの最後だけで行います。
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { Delayed, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { useSideMenuTopSlot } from '@gmo-onair/shared/src/client/shell/sideMenuSlot';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { PcOnlyNote } from '@gmo-onair/shared/src/client-v4/pcOnly';
import type { WikiItem, WikiPage, WikiView } from '@gmo-onair/shared/src/wiki/types';
import { useRecordView, useWikiTree } from '@/lib/wikiApi';
import { bodyForDisplay } from '@/lib/wikiBody';
import { usePermissions } from '@/hooks/usePermissions';
import WikiMarkdown from '@/components/wiki/WikiMarkdown';
import WikiSpaceTreePanel from '@/components/layout/WikiSpaceTreePanel';
import { useOnairUsers } from '@/components/page/pageOpsApi';
import DatabaseHeaderBar from '@/components/database/DatabaseHeaderBar';
import DatabaseItemSheet from '@/components/database/DatabaseItemSheet';
import DatabaseItemsPanel from '@/components/database/DatabaseItemsPanel';
import DatabaseRulesSheet from '@/components/database/DatabaseRulesSheet';
import DatabaseToolbar from '@/components/database/DatabaseToolbar';
import DatabaseViewArea from '@/components/database/DatabaseViewArea';
import DatabaseViewSheet from '@/components/database/DatabaseViewSheet';
import { downloadRowsCsv, useWikiDatabase, useWikiDbRefresh, useWikiRows } from '@/components/database/databaseApi';
import { ensureViews, viewItems } from '@/components/database/dbView';
import { useDatabaseEdit, useRowCreate, useRowValueSave } from '@/components/database/useDatabaseEdit';

/** 右の「項目」パネルを開いているか。端末の中だけに覚える（ページ②の情報パネルと同じ） */
const ITEMS_OPEN_KEY = 'gmo_onair_wiki_items_open';

function readItemsOpen(): boolean {
  try {
    return localStorage.getItem(ITEMS_OPEN_KEY) === '1';
  } catch {
    // 個人用ウィンドウ・保存を止めている端末では読めない。既定（閉じ）で描く
    return false;
  }
}

export default function DatabasePage({ page }: { page: WikiPage }) {
  const sideMenuTopSlot = useSideMenuTopSlot();
  const mobile = useIsMobile();
  const { canEdit } = usePermissions();

  const [itemsOpen, setItemsOpen] = useState(readItemsOpen);
  const [viewId, setViewId] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [viewSheet, setViewSheet] = useState<{ open: boolean; view: WikiView | null }>({ open: false, view: null });
  const [itemSheet, setItemSheet] = useState<{ open: boolean; item: WikiItem | null }>({ open: false, item: null });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(ITEMS_OPEN_KEY, itemsOpen ? '1' : '0');
    } catch {
      // 保存できなくても画面は動く
    }
  }, [itemsOpen]);

  const treeQ = useWikiTree(page.space_key);
  const defQ = useWikiDatabase(page.id);
  const views = ensureViews(defQ.data?.views);
  const view = views.find((v) => v.id === viewId) ?? views[0];
  // **ビューを変えたら取り直す**（絞り込みと並べ替えはサーバーが当てる）
  const rowsQ = useWikiRows(page.id, view.id);
  const refresh = useWikiDbRefresh(page.id, page.space_key);
  const edit = useDatabaseEdit(page.id, defQ.data, refresh);
  const rowSave = useRowValueSave(refresh);
  const addRow = useRowCreate(page.id, refresh);
  const usersQ = useOnairUsers(canEdit);
  useRecordView(page.id);

  const items = defQ.data?.items ?? [];
  const columns = viewItems(items, view);
  const rows = rowsQ.data?.rows ?? [];
  const body = bodyForDisplay(page.body_md, page.title);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadRowsCsv(page.id, page.title, rowsQ.data?.view_id ?? null);
    } catch (err) {
      notifyApiError('CSV を書き出せませんでした', err, 'もう一度お試しください。');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* ツリーは共通の左メニューの上に差し込む（画面の中に2本目のナビを作らない） */}
      {sideMenuTopSlot
        && page.space_key
        && createPortal(
          <WikiSpaceTreePanel
            spaceKey={page.space_key}
            spaceName={page.space_name ?? ''}
            nodes={treeQ.data}
            loading={treeQ.isLoading}
            currentId={page.id}
          />,
          sideMenuTopSlot,
        )}

      <main className="flex min-w-0 flex-1 flex-col bg-card">
        <DatabaseHeaderBar page={page} itemsOpen={itemsOpen} onToggleItems={() => setItemsOpen((v) => !v)} />

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-10">
          {/* 説明（本文）は読むものなので、表の幅に引きずられないよう 860px で止める */}
          <div className="mx-auto w-full max-w-[860px]">
            <h1 className="text-h1 text-foreground">{page.title}</h1>
            <p className="mb-4 mt-1.5 text-sub text-muted-foreground">
              {page.owner_name ? `担当: ${page.owner_name}` : '担当なし'}
              {' ・ '}
              {rowsQ.data ? `${rows.length} 行` : '読み込み中…'}
            </p>
            {body.trim() && <WikiMarkdown body={body} />}
          </div>

          {/* ビューと表は画面の幅いっぱいに使う（列が多いと 860px には入らない） */}
          <div className="mt-6 flex flex-col gap-3">
            {defQ.isError ? (
              <ErrorPanel
                title="データベースの設定を読み込めませんでした"
                error={defQ.error}
                onRetry={() => void defQ.refetch()}
              />
            ) : !defQ.data ? (
              <Delayed><SkeletonRows rows={4} rowHeight={36} /></Delayed>
            ) : (
              <>
                <DatabaseToolbar
                  views={views}
                  view={view}
                  canEdit={canEdit}
                  onSelectView={setViewId}
                  onOpenRules={() => setRulesOpen(true)}
                  onOpenViewSheet={(v) => setViewSheet({ open: true, view: v })}
                  onExportCsv={() => void exportCsv()}
                  onAddRow={(title) => addRow.mutate(title)}
                  adding={addRow.isPending}
                  exporting={exporting}
                />

                {/* 隠した操作は「どこへ行けばできるか」まで出す（設計 §6-⑩） */}
                <div className="lg:hidden">
                  <PcOnlyNote
                    what="並べ替え・項目の定義・ビューの追加"
                    why="この幅では列の一覧と値を同時に出せないためです。値の編集と行の追加は、この画面でできます。"
                  />
                </div>

                {rowsQ.data?.truncated && (
                  <p className="text-sub text-warning">
                    行が多いため、一部だけを出しています。絞り込みを足すか、データベースを分けてください。
                  </p>
                )}

                <DatabaseViewArea
                  view={view}
                  columns={columns}
                  items={items}
                  rows={rows}
                  loading={rowsQ.isLoading}
                  error={rowsQ.isError ? rowsQ.error : null}
                  onRetry={() => void rowsQ.refetch()}
                  canEdit={canEdit}
                  mobile={mobile}
                  people={usersQ.data}
                  savingRowId={rowSave.savingRowId}
                  onCommit={rowSave.commit}
                  onMoveGroup={(row, value) => {
                    const groupItem = items.find((it) => it.id === view.groupBy);
                    if (groupItem) rowSave.commit(row, groupItem, value);
                  }}
                />

                {/* スマホでも項目が何かは読めるようにする（定義を変えるのは PC） */}
                <div className="mt-2 xl:hidden">
                  <DatabaseItemsPanel
                    items={items}
                    canEdit={false}
                    saving={edit.saving}
                    onAdd={() => setItemSheet({ open: true, item: null })}
                    onEdit={(item) => setItemSheet({ open: true, item })}
                    onReorder={edit.saveItems}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* 右＝項目（列の定義）。PC で、開いているときだけ */}
      {itemsOpen && (
        <aside className="hidden w-[320px] shrink-0 flex-col border-l border-border bg-card xl:flex">
          <DatabaseItemsPanel
            items={items}
            canEdit={canEdit}
            saving={edit.saving}
            onAdd={() => setItemSheet({ open: true, item: null })}
            onEdit={(item) => setItemSheet({ open: true, item })}
            onReorder={edit.saveItems}
          />
        </aside>
      )}

      <DatabaseRulesSheet
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        view={view}
        views={views}
        items={items}
        saving={edit.saving}
        onSave={edit.saveViews}
      />
      <DatabaseViewSheet
        open={viewSheet.open}
        onOpenChange={(v) => setViewSheet((s) => ({ ...s, open: v }))}
        view={viewSheet.view}
        views={views}
        items={items}
        saving={edit.saving}
        onSave={edit.saveViews}
      />
      <DatabaseItemSheet
        open={itemSheet.open}
        onOpenChange={(v) => setItemSheet((s) => ({ ...s, open: v }))}
        item={itemSheet.item}
        items={items}
        views={views}
        saving={edit.saving}
        onSave={(nextItems, nextViews) => edit.saveAll(nextItems, nextViews)}
      />
    </div>
  );
}
