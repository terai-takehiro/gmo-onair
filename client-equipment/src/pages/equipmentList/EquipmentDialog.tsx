/**
 * 機材の 登録 / 編集 / 写して追加 ダイアログ (v4)
 *
 * `EquipmentListPage.tsx` から切り出したもので、**入力欄と送る値は変えていません**。
 * 変えたのは、保存できなかった理由を**スクロールの外・見出しの直下**に固定したこと
 * (旧実装は本文の末尾にあり、実行ボタンが上辺にあるので画面外で気づかれませんでした)。
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@gmo-onair/shared/src/client/ui/switch';
import { CONDITION_OPTIONS, LOC_CODES, SECTIONS, STATUS_OPTIONS, TYPE_CODES } from '@/lib/constants';
import type { CustomColumn } from '@/components/CustomColumnDialog';
import { EquipmentAssetFields, EquipmentPlaceFields } from './EquipmentAssetFields';
import { EquipmentCustomFields } from './EquipmentCustomFields';
import {
  CARRY_OVER_KEYS, defaultForm, toEquipmentForm,
  type ColorRecord, type EquipmentForm, type EquipmentRecord, type LocationRecord, type NamedRecord,
} from './types';

export type EquipmentDialogMode =
  | { kind: 'new' }
  | { kind: 'edit'; item: EquipmentRecord }
  | { kind: 'copy'; item: EquipmentRecord };

export function EquipmentDialog({
  mode, locations, manufacturers, colors, items,
  saving, error, savedOnce, onClose, onSubmit, onContinuousChange,
  customColumns, customValues, onCustomChange,
}: {
  mode: EquipmentDialogMode | null;
  locations: LocationRecord[];
  manufacturers: NamedRecord[];
  colors: ColorRecord[];
  items: EquipmentRecord[];
  saving: boolean;
  error: string | null;
  /** 連続登録で1台入ったときに出す合図 */
  savedOnce: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
  onContinuousChange: (on: boolean) => void;
  /** カスタム列 (自分で作る列)。編集のときだけ渡ってくる想定 (無ければ出さない) */
  customColumns?: CustomColumn[];
  customValues?: Record<string, Record<string, string>>;
  onCustomChange?: (equipmentId: string, columnId: string, value: string) => void;
}) {
  const [form, setForm] = useState<EquipmentForm>({ ...defaultForm });
  const [continuous, setContinuous] = useState(false);
  const [suggest, setSuggest] = useState<EquipmentRecord[]>([]);
  const [suggestTimer, setSuggestTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const editingId = mode?.kind === 'edit' ? mode.item.id : null;

  useEffect(() => {
    if (!mode) return;
    setSuggest([]);
    setForm(mode.kind === 'new' ? { ...defaultForm } : toEquipmentForm(mode.item, mode.kind));
  }, [mode]);

  // 連続登録で1台入ったら、共通の項目だけ残して個体の項目を空にする
  useEffect(() => {
    if (!savedOnce) return;
    setForm((prev) => ({
      ...defaultForm,
      ...Object.fromEntries(CARRY_OVER_KEYS.map((k) => [k, prev[k]])),
    }) as EquipmentForm);
    setSuggest([]);
  }, [savedOnce]);

  if (!mode) return null;

  /*
   * 商品名を打つと、同じ名前の機材から型名・メーカーを引き、No. を次の番号にする。
   * **同じ名前で型名が複数あるときだけ**選ばせる (1種類なら黙って入れる)。
   */
  const onNameChange = (val: string) => {
    setForm((f) => ({ ...f, name: val }));
    if (suggestTimer) clearTimeout(suggestTimer);
    if (!val.trim()) { setSuggest([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/equipment/items', { params: { search: val, include_children: '1' } });
        const found: EquipmentRecord[] = res.data.data ?? [];
        const exact = found.filter((i) => i.name.toLowerCase() === val.toLowerCase());
        if (exact.length === 0) { setSuggest([]); return; }
        const maxUnit = Math.max(0, ...exact.map((i) => Number(i.unit_number) || 0));
        const models = [...new Set(exact.map((i) => i.model_number ?? ''))];
        if (models.length === 1) {
          setForm((f) => ({
            ...f,
            name: val,
            model_number: exact[0].model_number || f.model_number,
            manufacturer_id: exact[0].manufacturer_id || f.manufacturer_id,
            unit_number: String(maxUnit + 1),
          }));
          setSuggest([]);
        } else {
          setSuggest(exact);
        }
      } catch { setSuggest([]); }
    }, 400);
    setSuggestTimer(t);
  };

  const submit = () => {
    if (!form.name) return;
    const selLoc = locations.find((l) => l.id === form.location_id);
    onSubmit({
      ...form,
      unit_number: form.unit_number ? Number(form.unit_number) : null,
      depreciation_years: form.depreciation_years ? Number(form.depreciation_years) : 0,
      warranty_years: form.warranty_years ? Number(form.warranty_years) : 0,
      manufacturer_id: form.manufacturer_id || null,
      location_id: form.location_id || null,
      parent_id: form.parent_id || null,
      color_id: form.color_id || null,
      rack_position: selLoc?.is_rack && form.rack_position ? Number(form.rack_position) : null,
      rack_height: selLoc?.is_rack ? (Number(form.rack_height) || 1) : 1,
      rack_slot: selLoc?.is_rack ? (form.rack_slot || 'full') : 'full',
      rack_side: selLoc?.is_rack ? (form.rack_side || 'front') : 'front',
    });
  };

  const title = mode.kind === 'edit' ? '機材を編集' : mode.kind === 'copy' ? '機材を複製して追加' : '機材を追加';

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={title}
      // **もとの `sm:max-w-2xl`（672px）＋ `grid-cols-3` の複合フォームなので `wide` を渡す。**
      // 既定の640pxのままだと、3列に並べていた拠点・種別・設備／貸出や、
      // 商品名・メーカー・型名などの2列グリッドが窮屈に潰れる
      wide
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={submit} disabled={saving || !form.name}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {mode.kind === 'edit' ? '編集' : '追加'}
          </Button>
        </FormDialogFooter>
      }
    >
      {/* 続けて登録のスイッチ。旧実装は見出しの右端にあったが、`FormDialog` の
          `title` は文字列だけを受け付けるため本文の先頭へ移した */}
      {mode.kind !== 'edit' && (
        <div className="mb-3 flex items-center justify-end gap-2 text-sub text-muted-foreground">
          <Switch
            checked={continuous}
            onCheckedChange={(v) => { setContinuous(!!v); onContinuousChange(!!v); }}
            aria-label="続けて登録する"
          />
          <span>続けて登録</span>
        </div>
      )}

      {/* 結果は**スクロールの外**に置く。本文の末尾だと画面外で気づかれない */}
      {error && (
        <p className="mb-3 rounded-control border border-destructive-border bg-destructive-surface px-3 py-2 text-sub text-destructive">
          {error}
        </p>
      )}
      {savedOnce && !error && (
        <p className="mb-3 rounded-control border border-success-border bg-success-surface px-3 py-2 text-sub text-success">
          登録しました。続けて次の機材を入れてください。
        </p>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            {/* 設定＞保管場所の「拠点」(場所の分類マスタ) とは別物。
                こちらは機材IDの先頭に入るコード (`LOC_CODES`) なので、
                同じ「拠点」でも何を選んでいるのかが分かるよう書き分ける */}
            <Label>拠点 * (機材IDの先頭)</Label>
            <Select value={form.location_code} onValueChange={(v) => setForm({ ...form, location_code: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOC_CODES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>種別 *</Label>
            <Select value={form.equipment_type_code} onValueChange={(v) => setForm({ ...form, equipment_type_code: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_CODES.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} - {t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>設備／貸出 *</Label>
            <Select value={form.equipment_section} onValueChange={(v) => setForm({ ...form, equipment_section: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>商品名 *</Label>
            <div className="relative">
              <Input
                value={form.name}
                onChange={(e) => onNameChange(e.target.value)}
                onBlur={() => setTimeout(() => setSuggest([]), 200)}
                placeholder="ユニバーサルフレーム"
                autoComplete="off"
              />
              {suggest.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-0.5 rounded-control border border-border bg-card shadow-lg">
                  <p className="border-b border-border px-3 py-1.5 text-sub text-muted-foreground">
                    同じ名前で型名が複数あります。選んでください
                  </p>
                  {Array.from(new Map(suggest.map((i) => [i.model_number ?? '', i])).values()).map((item) => {
                    const maxUnit = Math.max(0, ...suggest
                      .filter((i) => (i.model_number ?? '') === (item.model_number ?? ''))
                      .map((i) => Number(i.unit_number) || 0));
                    return (
                      <button
                        key={item.model_number ?? 'none'}
                        type="button"
                        className="min-h-tap flex w-full items-center gap-2 px-3 py-2 text-left text-sub hover:bg-muted lg:min-h-[36px]"
                        onMouseDown={() => {
                          setForm((f) => ({
                            ...f,
                            model_number: item.model_number || f.model_number,
                            manufacturer_id: item.manufacturer_id || f.manufacturer_id,
                            unit_number: String(maxUnit + 1),
                          }));
                          setSuggest([]);
                        }}
                      >
                        <span className="text-list">{item.model_number || '(型名なし)'}</span>
                        <span className="ml-auto text-sub-sm text-primary">→ No.{maxUnit + 1}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label>メーカー</Label>
            <Select
              value={form.manufacturer_id || 'none'}
              onValueChange={(v) => setForm({ ...form, manufacturer_id: v === 'none' ? '' : v })}
            >
              <SelectTrigger><SelectValue placeholder="選ぶ" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">なし</SelectItem>
                {manufacturers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>型名</Label>
            <Input value={form.model_number} onChange={(e) => setForm({ ...form, model_number: e.target.value })} placeholder="Vbus-70V2" />
          </div>
          <div className="space-y-1">
            <Label>No. (個体番号)</Label>
            <Input type="number" min="1" value={form.unit_number} onChange={(e) => setForm({ ...form, unit_number: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>製造番号</Label>
            <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
          </div>
        </div>

        {/* 保管場所（とラック実装）は折りたたみの中から出してある。
            畳んだまま登録されると場所の無い機材が増え、棚卸しで「(場所なし)」に落ちる */}
        <EquipmentPlaceFields form={form} setForm={setForm} locations={locations} />

        {/* **いまの状態**。詳細ページの編集フォームには前からあり、送る値
            (`status` / `condition`) も既に載っていたのに、台帳のこのダイアログにだけ
            入力欄が無く既定のまま固定されていた。選択肢・ラベルは詳細ページと同じ */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>ステータス</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>コンディション</Label>
            <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDITION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 備考は任意なので、必須・日常の項目を埋めきったここに置く。
            折りたたみ（月に一度も触らない資産・保証）より**上** —
            畳んだままだと、見出しの下に1欄だけ残って宙に浮いて見えていた */}
        <div className="space-y-1">
          <Label>備考</Label>
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <EquipmentAssetFields
          form={form}
          setForm={setForm}
          colors={colors}
          items={items}
          editingId={editingId}
        />

        {/* 新規登録では出さない — カスタム値は既存の equipment_id に紐づく */}
        {mode.kind === 'edit' && customColumns && customColumns.length > 0 && onCustomChange && (
          <EquipmentCustomFields
            itemId={mode.item.id}
            columns={customColumns}
            values={customValues?.[mode.item.id] ?? {}}
            onChange={onCustomChange}
          />
        )}
      </div>
    </FormDialog>
  );
}
