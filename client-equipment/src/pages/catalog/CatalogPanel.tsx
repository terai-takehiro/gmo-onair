/**
 * ② 機材台帳 ／ ケーブル・コネクタ (v4)
 *
 * ケーブルとコネクタは**同じ形の台帳**なので1つの部品にしました
 * (`types.ts` の `CatalogConfig` が違いを全部持っています)。
 * 台帳のタブから `config` を差し替えて呼ばれます。
 *
 * ── v4 で出さなくしたもの ──────────────────────────────────
 *
 *  ・**表示列の出し入れ・並べ替え** (利用者ごとに `localStorage` に保存していた)
 *    同じ台帳を2人で開くと列の並びが違い、口頭で「右から3列目」が通じません。
 *    列は7段の幅に固定しました。
 *  ・**表編集 (その場で書き換える)**
 *    数だけをまとめて直す用途でしたが、**Excel の取込**が同じことを
 *    行単位でできて記録も残るので、そちらに寄せました (下の注記に書いてあります)。
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Printer, Upload } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Delayed, EmptyState, ErrorPanel, NoSearchResults, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import ConsumableExcelImportDialog from '@/components/ConsumableExcelImportDialog';
import { SearchField } from '@/components/parts/SearchField';
import { useDebounced } from '@/hooks/useDebounced';
import { CatalogDialog, type DialogMode } from './CatalogDialog';
import { CatalogPrintTable } from './CatalogPrintTable';
import { CatalogRow, CatalogRowHeader } from './CatalogRows';
import {
  CATALOG_KINDS, KIND_LABELS, totalQuantity,
  type CatalogConfig, type CatalogForm, type CatalogItem,
} from './types';

export function CatalogPanel({ config }: { config: CatalogConfig }) {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('equipment', 'editor');
  const canDelete = hasPermission('equipment', 'manager');

  const [kind, setKind] = useState('');
  const [locationId, setLocationId] = useState('');
  const [manufacturerId, setManufacturerId] = useState('');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 400);

  const [dialog, setDialog] = useState<DialogMode | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // 一覧は絞り込みつき。**件数のチップは絞り込み無しで数える** —
  // 押す前に 0 件だと分かるようにするため (docs/design/v4 の決めごと)
  const list = useQuery({
    queryKey: [config.queryKey, kind, locationId, manufacturerId, debounced],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (kind) params.kind = kind;
      if (locationId) params.location_id = locationId;
      if (manufacturerId) params.manufacturer_id = manufacturerId;
      if (debounced) params.search = debounced;
      return (await api.get(config.endpoint, { params })).data.data as CatalogItem[];
    },
  });
  const all = useQuery({
    queryKey: [config.queryKey, 'all'],
    queryFn: async () => (await api.get(config.endpoint)).data.data as CatalogItem[],
  });

  const { data: locationsData } = useQuery({
    queryKey: ['equipment-locations'],
    queryFn: async () => (await api.get('/equipment/locations')).data.data,
  });
  const { data: manufacturersData } = useQuery({
    queryKey: ['equipment-manufacturers'],
    queryFn: async () => (await api.get('/equipment/manufacturers')).data.data,
  });
  const locations: { id: string; name: string }[] = locationsData ?? [];
  const manufacturers: { id: string; name: string }[] = manufacturersData ?? [];

  const items = list.data ?? [];
  const everything = useMemo(() => all.data ?? [], [all.data]);

  const chips = useMemo(() => ([
    { key: '', label: 'すべて', count: everything.length },
    ...CATALOG_KINDS.map((k) => ({
      key: k.code as string,
      label: k.label,
      count: everything.filter((it) => it.kind === k.code).length,
    })),
  ]), [everything]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [config.queryKey] });
    qc.invalidateQueries({ queryKey: ['equipment-stats'] });
  };

  const save = useMutation({
    mutationFn: (form: CatalogForm) => {
      const body: Record<string, unknown> = {
        kind: form.kind,
        location_id: form.location_id || null,
        name: form.name.trim(),
        manufacturer_id: form.manufacturer_id || null,
        model_number: form.model_number || null,
        quantity: form.quantity === '' ? 0 : Number(form.quantity),
        storage_method: form.storage_method || null,
        notes: form.notes || null,
      };
      // 長さと色は**ケーブルにしか無い列**。コネクタに送ると知らない列で弾かれる
      if (config.hasLength) {
        body.length_m = form.length_m === '' ? null : Number(form.length_m);
        body.color = form.color || null;
      }
      const editingId = dialog?.kind === 'edit' ? dialog.item.id : null;
      return editingId
        ? api.put(`${config.endpoint}/${editingId}`, body)
        : api.post(config.endpoint, body);
    },
    onSuccess: () => {
      invalidate();
      setSaveError(null);
      const done = dialog?.kind === 'edit' ? '直しました' : '足しました';
      setDialog(null);
      notifySuccess(`${config.label}を${done}`);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setSaveError(e?.response?.data?.error?.message || e?.message || '保存できませんでした');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${config.endpoint}/${id}`),
    onSuccess: () => { invalidate(); notifySuccess(`${config.label}を消しました`); },
    onError: (e) => notifyApiError('消せませんでした', e),
  });

  const onDelete = async (it: CatalogItem) => {
    const ok = await confirmAction({
      title: `「${it.name}」を台帳から消しますか`,
      description: `在庫 ${it.quantity}${config.unit} の記録もいっしょに消えます。取り消せません。`,
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) remove.mutate(it.id);
  };

  const downloadExcel = async () => {
    try {
      const res = await api.get(`${config.endpoint}/export-xlsx`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${config.exportFileName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notifyApiError('Excel を書き出せませんでした', e);
    }
  };

  const filterLabel = [
    kind ? KIND_LABELS[kind] : '',
    locationId ? locations.find((l) => l.id === locationId)?.name : '',
    manufacturerId ? manufacturers.find((m) => m.id === manufacturerId)?.name : '',
    debounced ? `"${debounced}"` : '',
  ].filter(Boolean).join(' / ');

  const filtering = !!(kind || locationId || manufacturerId || debounced);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sub text-muted-foreground">
          {config.label} <span className="font-number font-bold">{everything.length}</span> 品目 ・
          合計 <span className="font-number font-bold">{totalQuantity(everything).toLocaleString('ja-JP')}</span>{config.unit}
        </p>
        <div className="flex-1" />
        {canEdit && (
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1 h-4 w-4" aria-hidden="true" />Excel 取込
          </Button>
        )}
        <Button variant="outline" onClick={downloadExcel}>
          <Download className="mr-1 h-4 w-4" aria-hidden="true" />Excel 出力
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" aria-hidden="true" />印刷
        </Button>
        {canEdit && (
          <Button onClick={() => { setSaveError(null); setDialog({ kind: 'new' }); }}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />{config.label}を足す
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChips label="用途で絞り込む" items={chips} value={kind} onChange={setKind} />
        <Select value={locationId || 'all'} onValueChange={(v) => setLocationId(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40" aria-label="設置場所で絞り込む">
            <SelectValue placeholder="場所すべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">場所すべて</SelectItem>
            {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={manufacturerId || 'all'} onValueChange={(v) => setManufacturerId(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40" aria-label="メーカーで絞り込む">
            <SelectValue placeholder="メーカーすべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">メーカーすべて</SelectItem>
            {manufacturers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <SearchField value={search} onChange={setSearch} placeholder="商品名・型名・備考で探す" />
      </div>

      {list.isError ? (
        <ErrorPanel
          title={`${config.label}を読み込めませんでした`}
          error={list.error}
          onRetry={() => list.refetch()}
        />
      ) : list.isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : items.length === 0 && filtering ? (
        <NoSearchResults
          keyword={debounced || undefined}
          activeFilters={[
            kind ? `用途: ${KIND_LABELS[kind]}` : '',
            locationId ? `設置場所: ${locations.find((l) => l.id === locationId)?.name ?? ''}` : '',
            manufacturerId ? `メーカー: ${manufacturers.find((m) => m.id === manufacturerId)?.name ?? ''}` : '',
          ].filter(Boolean)}
          onClearFilters={() => { setKind(''); setLocationId(''); setManufacturerId(''); setSearch(''); }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={`${config.label}がまだ1件もありません`}
          description={`「${config.label}を足す」から1件ずつ、まとめて入れるときは Excel 取込から登録します。`}
        />
      ) : (
        <>
          <div className="flex flex-col rounded-card border border-border bg-card">
            <CatalogRowHeader config={config} showActions={canEdit || canDelete} />
            {items.map((it) => (
              <CatalogRow
                key={it.id}
                config={config}
                item={it}
                canEdit={canEdit}
                canDelete={canDelete}
                onEdit={(x) => { setSaveError(null); setDialog({ kind: 'edit', item: x }); }}
                onCopy={(x) => { setSaveError(null); setDialog({ kind: 'copy', item: x }); }}
                onDelete={onDelete}
              />
            ))}
          </div>
          <p className="text-note text-muted-foreground">
            在庫の数をまとめて直すときは <strong className="font-bold">Excel 取込</strong>を使います
            (行ごとに何が変わったかが残ります)。表の上で直接書き換える機能は v4 で外しました。
          </p>
        </>
      )}

      <ConsumableExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        endpoint={config.endpoint}
        resourceLabel={config.label}
        invalidateKey={[config.queryKey]}
        templateFileName={config.templateFileName}
      />

      <CatalogDialog
        config={config}
        mode={dialog}
        locations={locations}
        manufacturers={manufacturers}
        saving={save.isPending}
        error={saveError}
        onClose={() => setDialog(null)}
        onSubmit={(form) => save.mutate(form)}
      />

      <CatalogPrintTable
        config={config}
        items={items}
        title={`${config.label}一覧`}
        filterLabel={filterLabel}
      />
    </div>
  );
}
