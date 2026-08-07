/**
 * ② 機材台帳 ／ 機材 (v4)
 *
 * `EquipmentListPage.tsx` (2,017行) を分けた本体です。分けた先:
 *
 *   types.ts / badges.tsx / useEquipmentListState.ts / useColumnPrefs.ts /
 *   useCustomValues.ts / EquipmentFilters.tsx / EquipmentTable.tsx /
 *   EquipmentCells.tsx / EquipmentCards.tsx / EquipmentDialog.tsx /
 *   EquipmentAssetFields.tsx / BulkEditDialog.tsx / ColumnPicker.tsx /
 *   PrintDialog.tsx / PrintTable.tsx
 *
 * **表の中身と送る値は変えていません。** 変えたのは枠 (見出し・絞り込み・
 * 空のとき・読み込み中・確認と知らせ) だけです。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Download, Edit3, Plus, Printer, Upload, X } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Delayed, EmptyState, ErrorPanel, NoSearchResults, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import ExcelImportDialog from '@/components/ExcelImportDialog';
import CustomColumnDialog, { type CustomColumn } from '@/components/CustomColumnDialog';
import { TYPE_LABELS } from '@/lib/constants';
import { BulkEditDialog } from './BulkEditDialog';
import { ColumnPicker } from './ColumnPicker';
import { EquipmentCards } from './EquipmentCards';
import { EquipmentDialog, type EquipmentDialogMode } from './EquipmentDialog';
import { EquipmentFilters } from './EquipmentFilters';
import { EquipmentTable } from './EquipmentTable';
import { PrintDialog, type PrintSettings } from './PrintDialog';
import { PrintTable } from './PrintTable';
import { useColumnPrefs } from './useColumnPrefs';
import { useCustomValues } from './useCustomValues';
import { useEquipmentListState } from './useEquipmentListState';
import { downloadItemsExcel, useItemMutations } from './useItemMutations';
import { useItemSelection } from './useItemSelection';
import type { BulkField, ColorRecord, EquipmentRecord, LocationRecord, NamedRecord } from './types';

const DEFAULT_PRINT: PrintSettings = {
  title: '機材一覧',
  cols: new Set(['eq_code', 'equipment_type', 'name', 'manufacturer_name', 'model_number', 'unit_number', 'location', 'notes']),
  checkbox: true,
};

export function ItemsPanel() {
  const navigate = useNavigate();
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
  const [print, setPrint] = useState<PrintSettings>(DEFAULT_PRINT);
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
  const custom = useCustomValues(s.items.map((i) => i.id), customColumns);

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

  const doPrint = () => {
    setPrintOpen(false);
    // 描き終わってから印刷を呼ぶ (すぐ呼ぶと出す列の変更が反映されない)
    setTimeout(() => window.print(), 150);
  };

  const openDetail = (id: string) => {
    sessionStorage.setItem('eq-list-scroll', String(window.scrollY));
    navigate(`/equipment/items/${id}`);
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
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sub text-muted-foreground">
          機材 <span className="font-number font-bold">{s.items.length.toLocaleString('ja-JP')}</span> 点
          {filtering && `（絞り込み: ${filterLabel}）`}
        </p>
        <div className="flex-1" />
        {canEdit && (
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1 h-4 w-4" aria-hidden="true" />Excel 取込
          </Button>
        )}
        <Button variant="outline" onClick={downloadItemsExcel}>
          <Download className="mr-1 h-4 w-4" aria-hidden="true" />Excel 出力
        </Button>
        <Button variant="outline" onClick={() => setPrintOpen(true)}>
          <Printer className="mr-1 h-4 w-4" aria-hidden="true" />印刷
        </Button>
        <ColumnPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          prefs={prefs}
          customColumns={orderedCustom}
          onManageCustom={() => setCustomColOpen(true)}
        />
        {canEdit && (
          <Button
            variant={editMode ? 'default' : 'outline'}
            onClick={() => { setEditMode((v) => !v); setEdits({}); }}
          >
            <Edit3 className="mr-1 h-4 w-4" aria-hidden="true" />{editMode ? '直し終わり' : '表で直す'}
          </Button>
        )}
        {canEdit && (
          <Button onClick={() => { setSaveError(null); setSavedOnce(false); setDialog({ kind: 'new' }); }}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />機材を足す
          </Button>
        )}
      </div>

      <EquipmentFilters
        state={s.filters}
        base={{ forType: s.baseForType, forSection: s.baseForSection }}
        locations={locations}
        locOpen={locOpen}
        onLocOpenChange={setLocOpen}
        onChange={(patch) => {
          if (patch.type !== undefined) s.setType(patch.type);
          if (patch.section !== undefined) s.setSection(patch.section);
          if (patch.locs !== undefined) s.setLocs(patch.locs);
          if (patch.search !== undefined) s.setSearch(patch.search);
          if (patch.includeChildren !== undefined) s.setIncludeChildren(patch.includeChildren);
        }}
        onToggleLoc={s.toggleLoc}
        onClear={s.clearFilters}
      />

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
        <>
          <EquipmentCards items={s.items} onOpen={openDetail} />
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
        </>
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

      <PrintDialog
        open={printOpen}
        count={s.items.length}
        value={print}
        onChange={setPrint}
        onClose={() => setPrintOpen(false)}
        onPrint={doPrint}
      />

      <div id="eq-print-area-wrapper">
        <PrintTable
          items={s.items}
          printCols={print.cols}
          printCheckbox={print.checkbox}
          printTitle={print.title}
          filterLabel={filterLabel}
        />
      </div>
    </div>
  );
}
