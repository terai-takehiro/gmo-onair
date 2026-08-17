/**
 * ② 機材台帳 ／ 機材 (v4)
 *
 * `EquipmentListPage.tsx` (2,017行) を分けた本体です。分けた先は
 * この `equipmentList/` の中（状態・絞り込み・道具帯・表・カード・
 * ダイアログ・印刷）。ここは**それらをつなぐ係**だけを持ちます。
 *
 * **表の中身と送る値は変えていません。** 変えたのは枠 (見出し・絞り込み・
 * 空のとき・読み込み中・確認と知らせ) だけです。
 *
 * ── 同じ機材を3回描くのをやめた（速さ）────────────────────────
 *
 * 1 点の機材につき、この画面は**3か所**に行を作っていました: PC の表
 * (`EquipmentTable`)・スマホのカード (`EquipmentCards`)・印刷用の表
 * (`PrintTable`)。**後ろ2つは CSS で隠れているだけ**（`md:hidden` と
 * `#eq-print-area-wrapper { display: none }`）で、DOM は作られ、React も
 * 毎回描き直していました。実測（機材 5,000 点・幅 1440px）: DOM の要素
 * **260,177 個**のうち、スマホのカードが 3,800 枚・印刷用の `<td>` が
 * **34,200 個**。どちらも**画面には1ピクセルも出ていません**。
 *
 * ⚠️ **`hidden` を消すのではなく、描くほうを止めます** — CSS の分かれ目
 * (`md:` = 768px) と同じ幅で出し分け、印刷用は**刷るときだけ**組み立てます
 * (`PrintArea`)。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Edit3, X } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Delayed, EmptyState, ErrorPanel, NoSearchResults, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { MD_UP, useMediaQuery } from '@/hooks/useMediaQuery';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import ExcelImportDialog from '@/components/ExcelImportDialog';
import CustomColumnDialog, { type CustomColumn } from '@/components/CustomColumnDialog';
import { TYPE_LABELS } from '@/lib/constants';
import { BulkEditDialog } from './BulkEditDialog';
import { ColumnPicker } from './ColumnPicker';
import { EquipmentCards } from './EquipmentCards';
import { EquipmentDialog, type EquipmentDialogMode } from './EquipmentDialog';
import { EquipmentFilters, type FilterState } from './EquipmentFilters';
import { EquipmentTable } from './EquipmentTable';
import { ItemsToolbar } from './ItemsToolbar';
import { MobileFilters } from './MobileFilters';
import { PrintArea } from './PrintArea';
import { useColumnPrefs } from './useColumnPrefs';
import { useCustomValues } from './useCustomValues';
import { useEquipmentListState } from './useEquipmentListState';
import { downloadItemsExcel, useItemMutations } from './useItemMutations';
import { useItemSelection } from './useItemSelection';
import type { BulkField, ColorRecord, EquipmentRecord, LocationRecord, NamedRecord } from './types';

export function ItemsPanel() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  /**
   * 表を出す幅か（CSS の `md:` と同じ 768px）。
   * **`isMobile` (1023px) で判断しないこと** — タブレットの幅で表とカードが
   * 入れ替わってしまう（`hooks/useMediaQuery.ts` に理由を書いてある）。
   */
  const showTable = useMediaQuery(MD_UP);
  const { currentUser, hasPermission } = useAuth();
  const canEdit = hasPermission('equipment', 'editor');
  const canDelete = hasPermission('equipment', 'manager');
  // 「貸出可」の書き込みは `PUT /equipment/rental-settings/:id`（`owner` 指定）。
  // ただしサーバーの段位表は **owner と manager が同じ 3** なので、
  // 画面側は `manager` で判定する（`owner` で判定すると manager の人に
  // 押せない印が出るのに、押せば通ってしまい食い違う）
  const canSetRental = hasPermission('equipment', 'manager');
  const qc = useQueryClient();
  const canBulkEdit = currentUser?.role === 'system_admin'
    || currentUser?.permissions?.equipment === 'manager'
    || currentUser?.permissions?.equipment === 'owner';

  const s = useEquipmentListState();
  const sel = useItemSelection(s.items);

  const [dialog, setDialog] = useState<EquipmentDialogMode | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [customColOpen, setCustomColOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [editingCell, setEditingCell] = useState<{ equipmentId: string; columnId: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkField, setBulkField] = useState<BulkField>('branch_code');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);

  const { data: locationsData } = useQuery({
    queryKey: ['equipment-locations'],
    queryFn: async () => (await api.get('/equipment/locations')).data.data,
  });
  const { data: manufacturersData } = useQuery({
    queryKey: ['equipment-manufacturers'],
    queryFn: async () => (await api.get('/equipment/manufacturers')).data.data,
  });
  const { data: colorsData } = useQuery({
    queryKey: ['equipment-colors'],
    queryFn: async () => (await api.get('/equipment/colors')).data.data,
  });
  const { data: customColumnsData } = useQuery<CustomColumn[]>({
    queryKey: ['equipment-custom-columns'],
    queryFn: async () => (await api.get('/equipment/custom-columns')).data.data,
  });

  const locations: LocationRecord[] = locationsData ?? [];
  const manufacturers: NamedRecord[] = manufacturersData ?? [];
  const colors: ColorRecord[] = colorsData ?? [];
  const customColumns: CustomColumn[] = customColumnsData ?? [];

  const prefs = useColumnPrefs(customColumns.map((c) => c.id));
  // 保存した並びに従い、後から作られた列は末尾に置く
  const orderedCustom = [
    ...prefs.customColOrder.map((id) => customColumns.find((c) => c.id === id)).filter((c): c is CustomColumn => !!c),
    ...customColumns.filter((c) => !prefs.customColOrder.includes(c.id)),
  ];
  const custom = useCustomValues(customColumns);

  const m = useItemMutations({
    editingId: dialog?.kind === 'edit' ? dialog.item.id : null,
    onSaved: (wasEdit) => {
      setSaveError(null);
      if (!wasEdit && continuous) {
        setSavedOnce(true);
        setTimeout(() => setSavedOnce(false), 2500);
        return;
      }
      setDialog(null);
      notifySuccess(wasEdit ? '機材を直しました' : '機材を足しました');
    },
    onSaveError: setSaveError,
    onBulkError: setBulkError,
    onBulkDone: (count) => {
      setBulkOpen(false);
      setBulkError(null);
      sel.clear();
      setBulkValue('');
      notifySuccess(`${count} 件を直しました`);
    },
  });

  /**
   * 「貸出可」の切り替え。**台帳の列から直接押せる**（モックどおり）。
   *
   * 貸出の一覧・設定タブ・ダッシュボードの数はどれも同じフラグを見ているので、
   * まとめて読み直す（片方だけ古いままだと「押したのに増えない」になる）。
   */
  const [rentalBusyId, setRentalBusyId] = useState<string | null>(null);
  const toggleRental = useMutation({
    mutationFn: (item: EquipmentRecord) =>
      api.put(`/equipment/rental-settings/${item.id}`, { is_rental_listed: !item.is_rental_listed }),
    onMutate: (item) => { setRentalBusyId(item.id); },
    onSettled: () => setRentalBusyId(null),
    onSuccess: (_res, item) => {
      qc.invalidateQueries({ queryKey: ['equipment-items'] });
      qc.invalidateQueries({ queryKey: ['equipment-rental-settings'] });
      qc.invalidateQueries({ queryKey: ['equipment-stats'] });
      notifySuccess(`${item.name} を${item.is_rental_listed ? '常設に戻しました' : '貸出可にしました'}`);
    },
    onError: (e) => notifyApiError('貸出可を切り替えられませんでした', e),
  });

  const onDelete = async (item: EquipmentRecord, parentId?: string) => {
    const ok = await confirmAction({
      title: `「${item.name}」を台帳から消しますか`,
      description: (item.children_count ?? 0) > 0
        ? `付属品 ${item.children_count} 点の親子の結びつきも外れます。取り消せません。`
        : '貸出とメンテナンスの記録もいっしょに見えなくなります。取り消せません。',
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (!ok) return;
    m.remove.mutate(item.id, {
      onSuccess: () => {
        if (parentId) sel.dropChild(parentId, item.id);
      },
    });
  };

  const submitBulk = () => {
    const ids = Array.from(sel.selectedIds);
    if (ids.length === 0) return;
    let v: unknown = bulkValue;
    if (['warranty_years', 'depreciation_years', 'unit_number', 'rack_position', 'rack_height'].includes(bulkField)) {
      v = bulkValue === '' ? null : Number(bulkValue);
    }
    if (['location_id', 'manufacturer_id', 'color_id'].includes(bulkField) && bulkValue === 'none') v = null;
    m.bulkUpdate.mutate({ ids, fields: { [bulkField]: v } });
  };

  const openDetail = (id: string) => {
    sessionStorage.setItem('eq-list-scroll', String(window.scrollY));
    navigate(`/equipment/items/${id}`);
  };

  const applyFilterPatch = (patch: Partial<FilterState>) => {
    if (patch.type !== undefined) s.setType(patch.type);
    if (patch.section !== undefined) s.setSection(patch.section);
    if (patch.locs !== undefined) s.setLocs(patch.locs);
    if (patch.search !== undefined) s.setSearch(patch.search);
    if (patch.includeChildren !== undefined) s.setIncludeChildren(patch.includeChildren);
  };

  const filterLabel = [
    s.filters.type ? TYPE_LABELS[s.filters.type] : '',
    s.filters.section === 'equipment' ? '設備' : s.filters.section === 'rental' ? '貸出' : '',
    s.filters.locs.size > 0 ? `場所 ${s.filters.locs.size} か所` : '',
    s.urlSearch ? `"${s.urlSearch}"` : '',
  ].filter(Boolean).join(' / ');

  const filtering = !!filterLabel;

  return (
    <div className="flex flex-col gap-3">
      <ItemsToolbar
        count={s.items.length}
        filterLabel={filterLabel}
        isMobile={isMobile}
        canEdit={canEdit}
        editMode={editMode}
        columnPicker={
          <ColumnPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            prefs={prefs}
            customColumns={orderedCustom}
            onManageCustom={() => setCustomColOpen(true)}
          />
        }
        onImport={() => setImportOpen(true)}
        onExport={downloadItemsExcel}
        onPrint={() => setPrintOpen(true)}
        onToggleEdit={() => { setEditMode((v) => !v); setEdits({}); }}
        onNew={() => { setSaveError(null); setSavedOnce(false); setDialog({ kind: 'new' }); }}
      />

      {/*
        **絞り込みは中身を変えずに、置き方だけ幅で入れ替えます**（M8）。
        `onChange` の割り振りは1か所（写すと片方だけ軸が増える）。
      */}
      {isMobile ? (
        <MobileFilters
          state={s.filters}
          base={{ forType: s.baseForType, forSection: s.baseForSection }}
          locations={locations}
          onChange={applyFilterPatch}
          onToggleLoc={s.toggleLoc}
          onClear={s.clearFilters}
        />
      ) : (
        <EquipmentFilters
          state={s.filters}
          base={{ forType: s.baseForType, forSection: s.baseForSection }}
          locations={locations}
          locOpen={locOpen}
          onLocOpenChange={setLocOpen}
          onChange={applyFilterPatch}
          onToggleLoc={s.toggleLoc}
          onClear={s.clearFilters}
        />
      )}

      {canBulkEdit && sel.selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 flex items-center justify-between rounded-card bg-primary px-4 py-2 text-primary-foreground">
          <span className="text-sub font-bold">{sel.selectedIds.size} 件を選んでいます</span>
          <span className="flex gap-2">
            <Button variant="secondary" onClick={() => { setBulkError(null); setBulkOpen(true); }}>
              <Edit3 className="mr-1 h-4 w-4" aria-hidden="true" />まとめて直す
            </Button>
            <Button variant="ghost" className="text-primary-foreground hover:bg-primary-800" onClick={sel.clear}>
              <X className="mr-1 h-4 w-4" aria-hidden="true" />選ぶのをやめる
            </Button>
          </span>
        </div>
      )}

      {s.query.isError ? (
        <ErrorPanel title="機材を読み込めませんでした" error={s.query.error} onRetry={() => s.query.refetch()} />
      ) : s.query.isLoading ? (
        <Delayed><SkeletonRows rows={8} /></Delayed>
      ) : s.items.length === 0 && filtering ? (
        <NoSearchResults
          keyword={s.urlSearch || undefined}
          activeFilters={filterLabel ? [filterLabel] : []}
          onClearFilters={s.clearFilters}
        />
      ) : s.items.length === 0 ? (
        <EmptyState
          title="機材がまだ1件もありません"
          description="「機材を足す」から1台ずつ、まとめて入れるときは Excel 取込から登録します。"
        />
      ) : (
        /*
          **どちらか片方だけを組み立てる。** 出し分けの幅は CSS の `md:` と同じで、
          `EquipmentCards` の `md:hidden` / `EquipmentTable` の `hidden md:block` は
          そのまま残してある（CSS と JS の二重の掛け金。片方だけ直しても崩れない）
        */
        showTable ? (
          <EquipmentTable
            items={s.items}
            colOrder={prefs.colOrder}
            visibleCols={prefs.visibleCols}
            sortKey={s.sortKey}
            sortDir={s.sortDir}
            onSort={s.onSort}
            canBulkEdit={!!canBulkEdit}
            canEdit={canEdit}
            canDelete={canDelete}
            selectedIds={sel.selectedIds}
            onSelectAll={sel.toggleAll}
            onSelectOne={sel.click}
            expandedIds={sel.expandedIds}
            childrenCache={sel.childrenCache}
            loadingChildren={sel.loadingChildren}
            onToggleExpand={sel.toggleExpand}
            cellCtx={{
              editMode,
              edits,
              onEditChange: (id, field, value) =>
                setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [field]: value } })),
              onEditCommit: (id) => {
                const data = edits[id];
                if (!data || Object.keys(data).length === 0) return;
                m.inlineEdit.mutate({ id, data });
                setEdits((prev) => { const n = { ...prev }; delete n[id]; return n; });
              },
              canSetRental,
              rentalBusyId,
              onToggleRental: (item) => toggleRental.mutate(item),
            }}
            customCtx={{
              columns: orderedCustom,
              visible: prefs.visibleCustomCols,
              values: custom.values,
              editing: editingCell,
              setEditing: setEditingCell,
              write: custom.write,
            }}
            onOpen={openDetail}
            onCopy={(item) => { setSaveError(null); setSavedOnce(false); setDialog({ kind: 'copy', item }); }}
            onEdit={(item) => { setSaveError(null); setSavedOnce(false); setDialog({ kind: 'edit', item }); }}
            onDelete={onDelete}
          />
        ) : (
          <EquipmentCards items={s.items} onOpen={openDetail} />
        )
      )}

      <ExcelImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <CustomColumnDialog open={customColOpen} onOpenChange={setCustomColOpen} />

      <EquipmentDialog
        mode={dialog}
        locations={locations}
        manufacturers={manufacturers}
        colors={colors}
        items={s.items}
        saving={m.save.isPending}
        error={saveError}
        savedOnce={savedOnce}
        onClose={() => setDialog(null)}
        onSubmit={(payload) => m.save.mutate(payload)}
        onContinuousChange={setContinuous}
      />

      <BulkEditDialog
        open={bulkOpen}
        count={sel.selectedIds.size}
        field={bulkField}
        value={bulkValue}
        saving={m.bulkUpdate.isPending}
        error={bulkError}
        manufacturers={manufacturers}
        locations={locations}
        colors={colors}
        onFieldChange={setBulkField}
        onValueChange={setBulkValue}
        onClose={() => setBulkOpen(false)}
        onSubmit={submitBulk}
      />

      <PrintArea
        items={s.items}
        filterLabel={filterLabel}
        open={printOpen}
        onClose={() => setPrintOpen(false)}
      />
    </div>
  );
}
