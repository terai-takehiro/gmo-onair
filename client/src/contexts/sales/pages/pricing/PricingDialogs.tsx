/**
 * 料金表の「分類を足す・直す」「品目を足す・直す」(v4 ⑧)
 *
 * ── 並び順の数字を出すのをやめました ────────────────────────
 *
 * 旧フォームは `sort_order` を**数字の入力欄**で出していました。
 * 「10 と 20 の間に入れたいから 15 にする」を利用者にやらせるのは
 * 内部の都合の押し付けで、しかも同じ数字を2つ入れると並びが不定になります。
 * → **並べ替えは一覧の ↑↓ ボタン**で行い、ここでは触れません。
 *
 * ── 「設定なし」と「0円」は別物 ──────────────────────────────
 *
 * `unit_price` / `group_price` が **NULL = その相手には出さない品目**、
 * **0 = 0円で出す**。混ぜると「グループ内には出さない」つもりの品目が
 * 見積で 0 円として選べてしまいます。スイッチで明示的に切り替えます。
 */
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CurrencyInput } from '@/components/ui/currency-input';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { CalcTypeLabels, type CalcType, type PricingCategory, type PricingItem } from '@/types';

const KEY = ['pricing-categories'];

export function CategoryDialog({
  open, onOpenChange, editing, nextSortOrder, locationId, locationName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: PricingCategory | null;
  /** 新しく足すときの並び順。**末尾に置く** (先頭に割り込ませない) */
  nextSortOrder: number;
  /** どの場所の表に足すか (v4 大③)。**いま開いているタブの場所** */
  locationId: string;
  locationName: string;
}) {
  const qc = useQueryClient();
  const form = useForm<{ name: string }>({ values: { name: editing?.name ?? '' } });

  const save = useMutation({
    mutationFn: async (v: { name: string }) => (editing
      ? api.put(`/pricing/categories/${editing.id}`, { name: v.name, sort_order: editing.sort_order })
      // **場所は開いているタブから決める。** ここで選ばせると、
      // 用賀のタブを見ながら渋谷に足す、が起きる
      : api.post('/pricing/categories', { name: v.name, sort_order: nextSortOrder, location_id: locationId })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      notifySuccess(editing ? '分類の名前を変えました' : '分類を足しました');
      onOpenChange(false);
    },
    onError: (e) => notifyApiError('分類を保存できませんでした', e),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? '分類の名前を変える' : '分類を足す'}
      onSubmit={form.handleSubmit((v) => save.mutate(v))}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>やめる</Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}保存する
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sub text-muted-foreground">
          見積の明細をまとめる単位です（スタジオ／技術・人員／制作 など）。
          {!editing && <> <strong className="font-bold">{locationName}</strong> の料金表に足します。</>}
          {editing && <> 分類を別の場所へ移すことはできません（過去の見積の根拠が変わってしまうため）。</>}
        </p>
        <div>
          <Label>分類名 <span className="text-destructive">必須</span></Label>
          <Input {...form.register('name', { required: true })} placeholder="例）スタジオ利用料" />
        </div>
      </div>
    </FormDialog>
  );
}

interface ItemForm {
  name: string;
  sub_label: string;
  unit_price: number;
  unit_price_unset: boolean;
  group_price: number;
  group_price_unset: boolean;
  calc_type: CalcType;
}

export function ItemDialog({
  open, onOpenChange, categoryId, editing, nextSortOrder,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoryId: string;
  editing: PricingItem | null;
  nextSortOrder: number;
}) {
  const qc = useQueryClient();
  const form = useForm<ItemForm>({
    values: editing
      ? {
        name: editing.name,
        sub_label: editing.sub_label || '',
        unit_price: editing.unit_price ?? 0,
        unit_price_unset: editing.unit_price == null,
        group_price: editing.group_price ?? 0,
        group_price_unset: editing.group_price == null,
        calc_type: editing.calc_type,
      }
      : {
        name: '', sub_label: '',
        unit_price: 0, unit_price_unset: false,
        group_price: 0, group_price_unset: false,
        calc_type: 'fixed' as CalcType,
      },
  });

  const save = useMutation({
    mutationFn: async (v: ItemForm) => {
      const payload = {
        category_id: categoryId,
        name: v.name,
        sub_label: v.sub_label,
        unit_price: v.unit_price_unset ? null : v.unit_price,
        group_price: v.group_price_unset ? null : v.group_price,
        calc_type: v.calc_type,
        sort_order: editing ? editing.sort_order : nextSortOrder,
      };
      return editing ? api.put(`/pricing/items/${editing.id}`, payload) : api.post('/pricing/items', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      notifySuccess(editing ? '品目を直しました' : '品目を足しました');
      onOpenChange(false);
    },
    onError: (e) => notifyApiError('品目を保存できませんでした', e),
  });

  const unitUnset = form.watch('unit_price_unset');
  const groupUnset = form.watch('group_price_unset');
  const bothUnset = unitUnset && groupUnset;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? '品目を直す' : '品目を足す'}
      sub="ここを直してもすでに作った見積の金額は変わりません。"
      onSubmit={form.handleSubmit((v) => save.mutate(v))}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>やめる</Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}保存する
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <Label>品目名 <span className="text-destructive">必須</span></Label>
          <Input {...form.register('name', { required: true })} placeholder="例）【平日】9〜20時 11時間基本パッケージ" />
        </div>
        <div>
          <Label>補足（部屋の組合せ・条件）</Label>
          <Input {...form.register('sub_label')} placeholder="例）WORLD + SKY + LOUNGE" />
        </div>
        <div>
          <Label>数え方 <span className="text-destructive">必須</span></Label>
          <Select value={form.watch('calc_type')} onValueChange={(v) => form.setValue('calc_type', v as CalcType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(CalcTypeLabels) as [CalcType, string][]).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          {([
            ['unit_price', 'unit_price_unset', '定価（グループ外）', unitUnset, 'グループ外には出しません'],
            ['group_price', 'group_price_unset', 'グループ内価格', groupUnset, 'グループ内には出しません'],
          ] as const).map(([priceKey, unsetKey, label, unset, offText]) => (
            <div key={priceKey}>
              <Label>{label}</Label>
              <CurrencyInput
                value={form.watch(priceKey)}
                onChange={(v) => form.setValue(priceKey, v, { shouldValidate: true })}
                disabled={unset}
              />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-note text-muted-foreground">{unset ? offText : '設定なしにする'}</span>
                <Switch checked={unset} onCheckedChange={(v) => form.setValue(unsetKey, !!v)} />
              </div>
            </div>
          ))}
        </div>

        {/* **両方「設定なし」は誰も選べない品目**になる。保存は止めないが必ず言う */}
        {bothUnset && (
          <p className="rounded-note text-sub bg-warning-surface px-3 py-2 text-warning">
            どちらも「設定なし」だと、この品目は<strong className="font-bold">見積のどこにも出てきません</strong>。
          </p>
        )}
      </div>
    </FormDialog>
  );
}
