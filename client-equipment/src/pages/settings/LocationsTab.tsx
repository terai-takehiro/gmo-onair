/**
 * ⑧ 設定 ／ 保管場所 (v4)
 *
 * 場所名 ＋ 拠点 ＋ 種別 (ラック／オペ卓／AV盤) ＋ 建物・フロア・エリアで持ちます。
 * 種別に「ラック」を選んだ場所だけが Uサイズを持ち、ラック図に1本として並びます。
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Settings } from 'lucide-react';
import api from '@/lib/api';
import { useCrudPage } from '@/hooks/useCrudPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Row, RowHeader, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { RowActions } from './RowActions';
import { MasterDialog } from './MasterDialog';

interface Location {
  id: string;
  name: string;
  building?: string;
  floor?: string;
  area?: string;
  description?: string;
  sort_order?: number;
  rack_units?: number;
  rack_sort_order?: number;
  branch_id?: string;
  rack_type_id?: string;
}

interface LocationForm {
  name: string; building: string; floor: string; area: string; description: string;
  sort_order: string; rack_units: string; rack_sort_order: string;
  branch_id: string; rack_type_id: string;
}

const EMPTY_FORM: LocationForm = {
  name: '', building: '', floor: '', area: '', description: '',
  sort_order: '0', rack_units: '', rack_sort_order: '0', branch_id: '', rack_type_id: '',
};

export function LocationsTab() {
  const [form, setForm] = useState<LocationForm>(EMPTY_FORM);
  const [masterOpen, setMasterOpen] = useState(false);

  const crud = useCrudPage<Location>({
    endpoint: '/equipment/locations',
    queryKey: ['equipment-locations'],
    onSaveSuccess: () => notifySuccess('保管場所を保存しました'),
    onDeleteSuccess: () => notifySuccess('保管場所を消しました'),
    onError: (action, err) => notifyApiError(action === 'save' ? '保存できませんでした' : '消せませんでした', err),
  });

  const { data: branchData } = useQuery({
    queryKey: ['equipment-branches'],
    queryFn: async () => (await api.get('/equipment/branches')).data.data,
  });
  const { data: rackTypeData } = useQuery({
    queryKey: ['equipment-rack-types'],
    queryFn: async () => (await api.get('/equipment/rack-types')).data.data,
  });
  const branches: { id: string; name: string }[] = branchData ?? [];
  const rackTypes: { id: string; name: string }[] = rackTypeData ?? [];

  useEffect(() => {
    const loc = crud.editingItem;
    setForm(loc ? {
      name: loc.name || '',
      building: loc.building || '',
      floor: loc.floor || '',
      area: loc.area || '',
      description: loc.description || '',
      sort_order: loc.sort_order?.toString() || '0',
      rack_units: loc.rack_units?.toString() || '',
      rack_sort_order: loc.rack_sort_order?.toString() || '0',
      branch_id: loc.branch_id || '',
      rack_type_id: loc.rack_type_id || '',
    } : EMPTY_FORM);
  }, [crud.editingItem]);

  const isRackForm = !!form.rack_type_id;
  const canSave = !!form.name && (!isRackForm || !!form.rack_units);

  const handleSave = () => {
    crud.save.mutate({
      name: form.name,
      building: form.building || null,
      floor: form.floor || null,
      area: form.area || null,
      description: form.description || null,
      sort_order: Number(form.sort_order) || 0,
      rack_units: isRackForm ? (Number(form.rack_units) || null) : null,
      rack_sort_order: Number(form.rack_sort_order) || 0,
      branch_id: form.branch_id || null,
      rack_type_id: form.rack_type_id || null,
    });
  };

  const onDelete = async (loc: Location) => {
    const ok = await confirmAction({
      title: `「${loc.name}」を消しますか`,
      description: 'この場所に置いてある機材は場所なしに戻ります。ラックだった場合はラック図から消えます。',
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) crud.remove.mutate(loc.id);
  };

  const branchMap = Object.fromEntries(branches.map((b) => [b.id, b.name]));
  const rackTypeMap = Object.fromEntries(rackTypes.map((t) => [t.id, t.name]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sub text-muted-foreground">
          場所名・拠点・種別 (ラック／オペ卓／AV盤)・建物・フロア・エリアで持ちます
        </p>
        <div className="flex-1" />
        <Button variant="outline" onClick={() => setMasterOpen(true)}>
          <Settings className="mr-1 h-4 w-4" aria-hidden="true" />拠点・種別
        </Button>
        <Button onClick={crud.openAdd}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />保管場所を足す
        </Button>
      </div>

      {crud.isError ? (
        <ErrorPanel title="保管場所を読み込めませんでした" error={crud.error} onRetry={() => crud.refetch()} />
      ) : crud.isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : crud.items.length === 0 ? (
        <EmptyState
          title="保管場所がまだ1件もありません"
          description="機材の置き場所とラック図はここで作った場所に紐づきます。まず1つ足してください。"
        />
      ) : (
        <div className="flex flex-col rounded-card border border-border bg-card">
          <RowHeader className="hidden sm:flex">
            <RowSlot w={56}>拠点</RowSlot>
            <RowMain>場所名 ／ 建物・フロア・エリア</RowMain>
            <RowSlot w={96}>種別</RowSlot>
            <RowSlot w={56} align="right">Uサイズ</RowSlot>
            <RowSlot w={56} align="right">表示順</RowSlot>
            <RowSlot w={96} align="right">{''}</RowSlot>
          </RowHeader>
          {crud.items.map((loc) => (
            <Row key={loc.id} divider interactive stackOnMobile>
              <RowSlot w={56}>
                {loc.branch_id && (
                  <TableBadge
                    label={branchMap[loc.branch_id] ?? '—'}
                    w={null}
                    className="bg-primary-surface-weak text-primary border-transparent"
                  />
                )}
              </RowSlot>
              <RowMain>
                <RowTitle>{loc.name}</RowTitle>
                <RowSub>
                  {[loc.building, loc.floor, loc.area, loc.description].filter(Boolean).join(' ／ ') || '場所の詳細なし'}
                </RowSub>
              </RowMain>
              <RowSlot w={96} hideOnMobile>
                {loc.rack_type_id && (
                  <TableBadge
                    label={rackTypeMap[loc.rack_type_id] ?? '種別'}
                    w={null}
                    className="bg-info-surface text-info border-transparent"
                  />
                )}
              </RowSlot>
              <RowSlot w={56} align="right" hideOnMobile>
                {loc.rack_units ? <span className="font-number text-sub-sm">{loc.rack_units}U</span> : null}
              </RowSlot>
              <RowSlot w={56} align="right" hideOnMobile>
                <span className="font-number text-sub-sm text-muted-foreground">{loc.sort_order ?? 0}</span>
              </RowSlot>
              <RowSlot w={96} align="right" placeholder="">
                <RowActions
                  name={loc.name}
                  onEdit={() => crud.openEdit(loc)}
                  onDelete={() => onDelete(loc)}
                />
              </RowSlot>
            </Row>
          ))}
        </div>
      )}

      <p className="text-note text-muted-foreground">
        種別に<strong className="font-bold">ラック</strong>を選んだ場所だけが Uサイズを持ち、ラック図に1本として並びます。
        棚卸しのチェックリストと機材台帳の設置場所は、この表示順のまま作られます。
      </p>

      <Dialog open={crud.dialogOpen} onOpenChange={crud.setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{crud.isEditing ? '保管場所を直す' : '保管場所を足す'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>場所名 *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="カメラ庫" />
            </div>
            <div className="space-y-1">
              <Label>拠点</Label>
              <Select value={form.branch_id || 'none'} onValueChange={(v) => setForm({ ...form, branch_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="選ぶ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {branches.length === 0 && (
                <p className="text-note text-muted-foreground">「拠点・種別」から先に拠点を足してください</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>種別</Label>
              <Select value={form.rack_type_id || 'none'} onValueChange={(v) => setForm({ ...form, rack_type_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="選ぶ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし (ふつうの保管場所)</SelectItem>
                  {rackTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {rackTypes.length === 0 && (
                <p className="text-note text-muted-foreground">「拠点・種別」から先に種別を足してください</p>
              )}
            </div>
            {isRackForm && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Uサイズ *</Label>
                  <Input
                    type="number" min={1} max={60}
                    value={form.rack_units}
                    onChange={(e) => setForm({ ...form, rack_units: e.target.value })}
                    placeholder="45"
                  />
                </div>
                <div className="space-y-1">
                  <Label>ラック図の並び</Label>
                  <Input type="number" value={form.rack_sort_order} onChange={(e) => setForm({ ...form, rack_sort_order: e.target.value })} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>建物</Label>
                <Input value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} placeholder="A棟" />
              </div>
              <div className="space-y-1">
                <Label>フロア</Label>
                <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="3F" />
              </div>
              <div className="space-y-1">
                <Label>エリア</Label>
                <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="機材エリア" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>説明</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="補足" />
            </div>
            <div className="space-y-1">
              <Label>表示順</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={crud.closeDialog}>やめる</Button>
              <Button onClick={handleSave} disabled={!canSave || crud.save.isPending}>
                {crud.save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
                {crud.isEditing ? '直す' : '足す'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MasterDialog open={masterOpen} onClose={() => setMasterOpen(false)} />
    </div>
  );
}
