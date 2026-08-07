/**
 * ② 機材台帳 ／ ケーブル・コネクタ (v4)
 *
 * **モックどおり1枚の表**です。ケーブルとコネクタはテーブルが別ですが、
 * 探す人にとっては「配線まわりの在庫」という1つのまとまりで、
 * どちらに入っているかを先に思い出させるのは筋が悪いためです。
 * 行の先頭に種別（ケーブル／コネクタ）を出し、コネクタの m と 色 は `—` にします。
 *
 * **保存先は行ごとに違います。** `SupplyItem.source` が宛先
 * (`/equipment/cables` / `/equipment/connectors`) を決めます。
 * ここを間違えると、コネクタをケーブルの表に書き込むことになります。
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
  CABLE_CONFIG, CATALOG_KINDS, CONFIG_BY_SOURCE, CONNECTOR_CONFIG, KIND_LABELS,
  type CatalogForm, type CatalogItem, type CatalogSource, type SupplyItem,
} from './types';

const SUPPLY_QUERY_KEY = 'equipment-supplies';

/** 種別の絞り込み。空 = 両方 */
const SOURCE_FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'すべて' },
  { key: 'cable', label: 'ケーブル' },
  { key: 'connector', label: 'コネクタ' },
];

export function CatalogPanel() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('equipment', 'editor');
  const canDelete = hasPermission('equipment', 'manager');

  const [source, setSource] = useState('');
  const [kind, setKind] = useState('');
  const [locationId, setLocationId] = useState('');
  const [manufacturerId, setManufacturerId] = useState('');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 400);

  const [dialog, setDialog] = useState<DialogMode | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importTarget, setImportTarget] = useState<CatalogSource>('cable');

  // **どちらの台帳も常に引く。** 片方だけにすると、種別の絞り込みチップに出る
  // 件数が古いまま残る（案件一覧の `stage_counts` と同じ考え方）
  const cables = useQuery({
    queryKey: [SUPPLY_QUERY_KEY, 'cable'],
    queryFn: async () => (await api.get(CABLE_CONFIG.endpoint)).data.data as CatalogItem[],
  });
  const connectors = useQuery({
    queryKey: [SUPPLY_QUERY_KEY, 'connector'],
    queryFn: async () => (await api.get(CONNECTOR_CONFIG.endpoint)).data.data as CatalogItem[],
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

  /**
   * 混ぜたうえで**種別 → 用途 → 商品名**の順に並べる。
   * サーバー側で並べ替えられないので画面で並べる（2つの取得結果を混ぜるため）。
   */
  const everything = useMemo<SupplyItem[]>(() => {
    const rows: SupplyItem[] = [
      ...(cables.data ?? []).map((it) => ({ ...it, source: 'cable' as const })),
      ...(connectors.data ?? []).map((it) => ({ ...it, source: 'connector' as const })),
    ];
    return rows.sort((a, b) =>
      a.source.localeCompare(b.source)
      || a.kind.localeCompare(b.kind)
      || a.name.localeCompare(b.name, 'ja'));
  }, [cables.data, connectors.data]);

  /** 絞り込みは画面で掛ける（サーバーを2回叩き分けるより速く、件数もその場で数えられる） */
  const items = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    return everything.filter((it) => {
      if (source && it.source !== source) return false;
      if (kind && it.kind !== kind) return false;
      if (locationId && it.location_id !== locationId) return false;
      if (manufacturerId && it.manufacturer_id !== manufacturerId) return false;
      if (q) {
        const hay = [it.name, it.model_number, it.manufacturer_name, it.notes]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [everything, source, kind, locationId, manufacturerId, debounced]);

  const sourceChips = useMemo(() => SOURCE_FILTERS.map((f) => ({
    key: f.key,
    label: f.label,
    count: f.key ? everything.filter((it) => it.source === f.key).length : everything.length,
  })), [everything]);

  const kindChips = useMemo(() => ([
    { key: '', label: '用途すべて', count: everything.length },
    ...CATALOG_KINDS.map((k) => ({
      key: k.code as string,
      label: k.label,
      count: everything.filter((it) => it.kind === k.code).length,
    })),
  ]), [everything]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [SUPPLY_QUERY_KEY] });
    qc.invalidateQueries({ queryKey: ['equipment-stats'] });
  };

  const save = useMutation({
    mutationFn: (form: CatalogForm) => {
      const target: CatalogSource = dialog?.kind === 'new' ? dialog.source : dialog?.item.source ?? 'cable';
      const config = CONFIG_BY_SOURCE[target];
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
      notifySuccess(`品目を${done}`);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setSaveError(e?.response?.data?.error?.message || e?.message || '保存できませんでした');
    },
  });

  const remove = useMutation({
    mutationFn: (it: SupplyItem) => api.delete(`${CONFIG_BY_SOURCE[it.source].endpoint}/${it.id}`),
    onSuccess: () => { invalidate(); notifySuccess('品目を消しました'); },
    onError: (e) => notifyApiError('消せませんでした', e),
  });

  const onDelete = async (it: SupplyItem) => {
    const config = CONFIG_BY_SOURCE[it.source];
    const ok = await confirmAction({
      title: `「${it.name}」を台帳から消しますか`,
      description: `在庫 ${it.quantity}${config.unit} の記録もいっしょに消えます。取り消せません。`,
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) remove.mutate(it);
  };

  /** Excel は**テーブルごと**にしか出せない（列が違う）。いま絞っている種別で出す */
  const excelTarget: CatalogSource = source === 'connector' ? 'connector' : 'cable';
  const excelConfig = CONFIG_BY_SOURCE[excelTarget];

  const downloadExcel = async () => {
    try {
      const res = await api.get(`${excelConfig.endpoint}/export-xlsx`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${excelConfig.exportFileName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notifyApiError('Excel を書き出せませんでした', e);
    }
  };

  const filterLabel = [
    source ? CONFIG_BY_SOURCE[source as CatalogSource].label : '',
    kind ? KIND_LABELS[kind] : '',
    locationId ? locations.find((l) => l.id === locationId)?.name : '',
    manufacturerId ? manufacturers.find((m) => m.id === manufacturerId)?.name : '',
    debounced ? `"${debounced}"` : '',
  ].filter(Boolean).join(' / ');

  const filtering = !!(source || kind || locationId || manufacturerId || debounced);
  const loading = cables.isLoading || connectors.isLoading;
  const failed = cables.isError || connectors.isError;

  const totalQty = useMemo(() => everything.reduce((n, it) => n + (Number(it.quantity) || 0), 0), [everything]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sub text-muted-foreground">
          <span className="font-number font-bold">{everything.length}</span> 品目 ・
          合計 <span className="font-number font-bold">{totalQty.toLocaleString('ja-JP')}</span> 本・個
        </p>
        <div className="flex-1" />
        {canEdit && (
          <Button
            variant="outline"
            onClick={() => { setImportTarget(excelTarget); setImportOpen(true); }}
          >
            <Upload className="mr-1 h-4 w-4" aria-hidden="true" />{excelConfig.label}を Excel 取込
          </Button>
        )}
        <Button variant="outline" onClick={downloadExcel}>
          <Download className="mr-1 h-4 w-4" aria-hidden="true" />{excelConfig.label}を Excel 出力
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" aria-hidden="true" />印刷
        </Button>
        {canEdit && (
          <Button
            onClick={() => {
              setSaveError(null);
              setDialog({ kind: 'new', source: source === 'connector' ? 'connector' : 'cable' });
            }}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />品目を登録
          </Button>
        )}
      </div>

      {/* Excel はケーブルとコネクタで列が違うので、**いま絞っている種別のぶんだけ**
          出し入れできる。「すべて」のときはケーブル側になることを書いておく */}
      <p className="text-note text-muted-foreground">
        Excel の取込・出力は<strong className="font-bold">{excelConfig.label}</strong>が対象です
        （列が違うので1つのファイルにまとめられません）。種別のチップで切り替えてください。
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChips label="種別で絞り込む" items={sourceChips} value={source} onChange={setSource} />
        <FilterChips label="用途で絞り込む" items={kindChips} value={kind} onChange={setKind} />
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

      {failed ? (
        <ErrorPanel
          title="ケーブル・コネクタを読み込めませんでした"
          error={cables.error ?? connectors.error}
          onRetry={() => { cables.refetch(); connectors.refetch(); }}
        />
      ) : loading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : items.length === 0 && filtering ? (
        <NoSearchResults
          keyword={debounced || undefined}
          activeFilters={[
            source ? `種別: ${CONFIG_BY_SOURCE[source as CatalogSource].label}` : '',
            kind ? `用途: ${KIND_LABELS[kind]}` : '',
            locationId ? `設置場所: ${locations.find((l) => l.id === locationId)?.name ?? ''}` : '',
            manufacturerId ? `メーカー: ${manufacturers.find((m) => m.id === manufacturerId)?.name ?? ''}` : '',
          ].filter(Boolean)}
          onClearFilters={() => {
            setSource(''); setKind(''); setLocationId(''); setManufacturerId(''); setSearch('');
          }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="ケーブル・コネクタがまだ1件もありません"
          description="「品目を登録」から1件ずつ、まとめて入れるときは Excel 取込から登録します。"
        />
      ) : (
        <>
          <div className="flex flex-col rounded-card border border-border bg-card">
            <CatalogRowHeader showActions={canEdit || canDelete} />
            {items.map((it) => (
              <CatalogRow
                key={`${it.source}:${it.id}`}
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
        endpoint={CONFIG_BY_SOURCE[importTarget].endpoint}
        resourceLabel={CONFIG_BY_SOURCE[importTarget].label}
        invalidateKey={[SUPPLY_QUERY_KEY]}
        templateFileName={CONFIG_BY_SOURCE[importTarget].templateFileName}
      />

      <CatalogDialog
        mode={dialog}
        locations={locations}
        manufacturers={manufacturers}
        saving={save.isPending}
        error={saveError}
        onClose={() => setDialog(null)}
        onSubmit={(form) => save.mutate(form)}
        onChangeSource={(s) => setDialog({ kind: 'new', source: s })}
      />

      <CatalogPrintTable
        items={items}
        title="ケーブル・コネクタ一覧"
        filterLabel={filterLabel}
      />
    </div>
  );
}
