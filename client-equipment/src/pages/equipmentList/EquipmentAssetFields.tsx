/**
 * 機材の登録・編集ダイアログの後半 (資産・保証 ／ 色 ／ ラック実装 ／ 親機材)
 *
 * 前半 (拠点・種別・商品名) と分けてあるのは**1ファイル 400 行の上限**のためで、
 * 入力欄の中身と送る値は旧実装から1つも変えていません。
 *
 * ── 「資産・保証」「親機材」を折りたたむようにした回（2026-08）─────
 *
 * 台帳・詳細画面は「資産管理は日常では畳む」（既定は非表示）方針だが、
 * 登録・編集ダイアログには反映されておらず、375px幅でも毎回フル項目・密グリッドが
 * 出ていた（スマホ最適化の洗い出し 2026-08-20・要対応5）。「機材を追加」は
 * `ItemsToolbar` でスマホでも残る唯一の追加導線（`isMobile` 分岐なし）なので、
 * ここが実質いちばんよく使われるモバイルの入力経路になる。
 *
 * **新規登録は畳んで開始・既存の編集は開いたまま**にした（`editingId` の有無で判定）。
 * 新規はまず必須3項目＋商品名だけで済ませられるようにし、既に値が入っている
 * 編集では黙って隠さない（隠すと「直したはずなのに消えた」に見える）。
 * 「保管場所」がこの折りたたみの中にあるため、ラック実装（場所がラックのときだけ出る
 * 条件付き表示）も自然にこの中へ入る。
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BranchCodeInput from '@/components/ui/BranchCodeInput';
import { ASSET_CLASS_OPTIONS, RACK_SLOT_OPTIONS } from '@/lib/constants';
import type { ColorRecord, EquipmentForm, EquipmentRecord, LocationRecord, NamedRecord } from './types';

export function EquipmentAssetFields({
  form, setForm, locations, colors, items, editingId,
}: {
  form: EquipmentForm;
  setForm: (next: EquipmentForm) => void;
  locations: LocationRecord[];
  colors: ColorRecord[];
  items: EquipmentRecord[];
  editingId: string | null;
}) {
  const selLoc = locations.find((l) => l.id === form.location_id);
  const overflow = !!form.rack_position && !!selLoc?.rack_units
    && Number(form.rack_position) + Number(form.rack_height) - 1 > selLoc.rack_units;
  // 新規登録は畳んで開始・既存の編集は開いたまま（既に入っている値を黙って隠さない）
  const [expanded, setExpanded] = useState(editingId !== null);

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="min-h-tap flex w-full items-center gap-1.5 border-t border-border pt-4 text-left text-cardtitle text-muted-foreground hover:text-foreground"
      >
        {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
        資産・保証・親機材（詳しい項目）
      </button>

      {expanded && (
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>所有会社</Label>
              <BranchCodeInput value={form.branch_code} onChange={(v) => setForm({ ...form, branch_code: v })} />
            </div>
            <div className="space-y-1">
              <Label>資産の区分</Label>
              <Select value={form.asset_class} onValueChange={(v) => setForm({ ...form, asset_class: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_CLASS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>資産コード</Label>
              <Input
                value={form.fixed_asset_code}
                onChange={(e) => setForm({ ...form, fixed_asset_code: e.target.value })}
                placeholder="消耗品は空欄"
              />
            </div>
            <div className="space-y-1">
              <Label>償却年数</Label>
              <Input
                type="number" min="0"
                value={form.depreciation_years}
                onChange={(e) => setForm({ ...form, depreciation_years: e.target.value })}
                placeholder="消耗品は0"
              />
            </div>
            <div className="space-y-1">
              <Label>購入年月</Label>
              <Input type="date" value={form.purchased_at} onChange={(e) => setForm({ ...form, purchased_at: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>保証期間 (年)</Label>
              <Input
                type="number" min="0"
                value={form.warranty_years}
                onChange={(e) => setForm({ ...form, warranty_years: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label>保管場所</Label>
              <Select
                value={form.location_id || 'none'}
                onValueChange={(v) => setForm({ ...form, location_id: v === 'none' ? '' : v })}
              >
                <SelectTrigger><SelectValue placeholder="選ぶ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし</SelectItem>
                  {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-3 text-cardtitle">機材の色</p>
            <div className="space-y-1">
              <Label>色</Label>
              <Select value={form.color_id || 'none'} onValueChange={(v) => setForm({ ...form, color_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="なし (種別の色)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし (種別の色)</SelectItem>
                  {colors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-chip border border-border"
                          style={{ background: c.color_hex }}
                          aria-hidden="true"
                        />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ラックの場所を選んだときだけ出す (ふつうの保管場所には U 位置が無い) */}
          {selLoc?.is_rack && (
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-cardtitle">ラック実装</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label>U位置 (下端)</Label>
                  <Input
                    type="number" min={1} max={selLoc.rack_units || 99}
                    value={form.rack_position}
                    onChange={(e) => setForm({ ...form, rack_position: e.target.value })}
                    placeholder="1〜"
                  />
                </div>
                <div className="space-y-1">
                  <Label>高さ (U)</Label>
                  <Input
                    type="number" min={1}
                    value={form.rack_height}
                    onChange={(e) => setForm({ ...form, rack_height: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>横位置</Label>
                  <Select value={form.rack_slot} onValueChange={(v) => setForm({ ...form, rack_slot: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RACK_SLOT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>面</Label>
                  <Select value={form.rack_side} onValueChange={(v) => setForm({ ...form, rack_side: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="front">前面</SelectItem>
                      <SelectItem value="back">背面</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {overflow && (
                <p className="mt-2 text-sub text-destructive">
                  U位置 + 高さがラックの総U数 ({selLoc.rack_units}U) を超えています
                </p>
              )}
            </div>
          )}

          <div className="border-t border-border pt-4">
            <div className="space-y-1">
              <Label>親機材 (付属先)</Label>
              <Select value={form.parent_id || 'none'} onValueChange={(v) => setForm({ ...form, parent_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="なし (単体)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし (単体)</SelectItem>
                  {items.filter((it) => it.id !== editingId).map((it) => (
                    <SelectItem key={it.id} value={it.id}>
                      {it.eq_code} — {it.name}
                      {it.model_number ? ` (${it.model_number})` : ''}
                      {it.unit_number ? ` No.${it.unit_number}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export type { NamedRecord };
