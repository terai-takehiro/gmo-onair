/**
 * ⑧ 料金表（設定） (v4)
 *
 * 見積の元になる表。分類 → 品目の2段で、ここで足す・直す・消す・並べ替えができます。
 *
 * ── モックと違えたところ ────────────────────────────────────
 *
 * **「場所ごとの表」は入れていません。** モックは用賀・その他の拠点ごとに
 * 別々の料金表を持ち、案件の場所に応じた表が見積に出る形ですが、
 * いまの `pricing_categories` に**場所の列がありません**。足すと
 * ①テーブルの作り替え ②見積の積算 (`set_project_simulation` / `SimulationDialog`) と
 * MCP の `list_pricing` が「どの場所の表か」を持つ ③既存の 78 品目をどの場所に
 * 割り当てるかの決め — の3つが同時に要ります。**画面の作り直しとは別の仕事**なので、
 * ここでは1つの表として扱い、場所の分割は設計から始めます。
 *
 * ── この版で直した「黙って壊れる」もの ──────────────────────
 *
 * ① **分類・品目の削除に確認がありませんでした。** ゴミ箱を押した瞬間に消え、
 *    分類を消すとぶら下がる品目も見えなくなります。**何がいっしょに消えるか**を
 *    出してから訊くようにしました
 * ② **失敗しても画面に何も出ませんでした** (`onError` が無い)。保存・削除の
 *    すべてに理由を出します
 * ③ **並び順を数字で入力させていました。** 「10 と 20 の間だから 15」を
 *    利用者にやらせるのは内部の都合の押し付けで、同じ数字を2つ入れると
 *    並びが不定になります。**↑↓ で入れ替える**形にしました
 * ④ **権限が無い人にも操作ボタンが出ていました。** 押すと 403 で失敗するだけです。
 *    分類は `owner`、品目は `editor`（消すのは `manager`）で出し分けます
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Info } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { useAuth } from '@/contexts/platform/AuthContext';
import type { PricingCategory, PricingItem } from '@/types';
import { CategoryCard } from './pricing/CategoryCard';
import { CategoryDialog, ItemDialog } from './pricing/PricingDialogs';

const KEY = ['pricing-categories'];

export default function PricingListPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEditCategory = hasPermission('sales', 'owner');
  const canEditItem = hasPermission('sales', 'editor');
  const canDeleteItem = hasPermission('sales', 'manager');

  const [q, setQ] = useState('');
  const [catOpen, setCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<PricingCategory | null>(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [itemCatId, setItemCatId] = useState('');
  const [editingItem, setEditingItem] = useState<PricingItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get('/pricing/categories')).data,
  });
  // `?? []` を素で書くと**毎回別の配列**になり、下の `useMemo` が毎描画で走る
  const categories: PricingCategory[] = useMemo(() => data?.data ?? [], [data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });

  /** 品目名と補足の両方で探す。**補足に部屋名が入っている**ので、そこも当たらないと引けない */
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => categories.map((c) => ({
    category: c,
    items: (c.items ?? []).filter((it) => !needle
      || it.name.toLowerCase().includes(needle)
      || (it.sub_label ?? '').toLowerCase().includes(needle)),
  })), [categories, needle]);
  const hitCount = shown.reduce((n, s) => n + s.items.length, 0);
  const totalCount = categories.reduce((n, c) => n + (c.items?.length ?? 0), 0);

  const del = useMutation({
    mutationFn: (p: { kind: 'category' | 'item'; id: string }) =>
      api.delete(`/pricing/${p.kind === 'category' ? 'categories' : 'items'}/${p.id}`),
    onSuccess: () => { invalidate(); notifySuccess('消しました'); },
    onError: (e) => notifyApiError('消せませんでした', e),
  });

  /**
   * 並べ替え。**2つの `sort_order` を入れ替える**だけ。
   * 全件に連番を振り直すと、同時に別の人が触っていたとき、
   * 見ていない分類まで動きます。
   */
  const move = useMutation({
    mutationFn: async (p: { a: PricingCategory; b: PricingCategory }) => {
      await api.put(`/pricing/categories/${p.a.id}`, { name: p.a.name, sort_order: p.b.sort_order });
      await api.put(`/pricing/categories/${p.b.id}`, { name: p.b.name, sort_order: p.a.sort_order });
    },
    onSuccess: invalidate,
    onError: (e) => notifyApiError('並べ替えられませんでした', e),
  });

  const askDeleteCategory = async (c: PricingCategory) => {
    const n = c.items?.length ?? 0;
    const ok = await confirmAction({
      title: `分類「${c.name}」を消しますか`,
      description: n > 0
        ? `この分類に入っている ${n} 品目も、料金表から見えなくなります。すでに作った見積の金額は変わりません。`
        : 'すでに作った見積の金額は変わりません。',
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) del.mutate({ kind: 'category', id: c.id });
  };

  const askDeleteItem = async (item: PricingItem) => {
    const ok = await confirmAction({
      title: `品目「${item.name}」を消しますか`,
      description: '以後この品目は見積で選べなくなります。すでに作った見積の金額は変わりません。',
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) del.mutate({ kind: 'item', id: item.id });
  };

  return (
    <div className="flex flex-col gap-3.5 p-4 lg:p-6">
      <PageHeader
        title="料金表"
        sub={`見積の元になる表です ・ 分類 ${categories.length} ／ 品目 ${totalCount}`}
        primaryAction={canEditCategory ? (
          <Button onClick={() => { setEditingCat(null); setCatOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />分類を足す
          </Button>
        ) : undefined}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="品目名・補足で探す"
            aria-label="品目を探す"
            className="w-full pl-9 sm:w-56"
          />
        </div>
      </PageHeader>

      {/*
        決めごと。**画面に書いておかないと必ず訊かれる**もの。
        モックの4項目のうち「場所ごと」に関する2つは、いまの作りに無いので載せていません
        （書いてあるのに無い、がいちばん困る）。
      */}
      <div className="flex items-start gap-2.5 rounded-note border border-primary-border bg-primary-surface-weak px-3.5 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-note text-secondary-foreground">
          <strong className="font-bold">ここを直しても、すでに作った見積の金額は変わりません。</strong>
          グループ内価格が「設定なし」の品目は、グループ内の案件では選べません（逆も同じ）。
          直せるのは権限のある人だけで、ほかの人は見るだけになります。
        </p>
      </div>

      {q && (
        <p className="text-sub text-muted-foreground">
          「{q}」に当たる品目 <span className="font-number font-bold">{hitCount}</span> 件
        </p>
      )}

      {isError ? (
        <ErrorPanel title="料金表を読み込めませんでした" error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : categories.length === 0 ? (
        <EmptyState
          title="料金表がまだありません"
          description="分類（スタジオ利用料・技術スタッフ など）をつくってから、品目を入れていきます。"
          action={canEditCategory
            ? <Button onClick={() => { setEditingCat(null); setCatOpen(true); }}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />分類を足す
              </Button>
            : undefined}
        />
      ) : (
        shown.map(({ category, items }, i) => (
          <CategoryCard
            key={category.id}
            category={category}
            items={items}
            canEditCategory={canEditCategory}
            canEditItem={canEditItem}
            canDeleteItem={canDeleteItem}
            first={i === 0}
            last={i === shown.length - 1}
            onMove={(dir) => {
              const other = shown[i + dir]?.category;
              if (other) move.mutate({ a: category, b: other });
            }}
            onRename={() => { setEditingCat(category); setCatOpen(true); }}
            onDelete={() => askDeleteCategory(category)}
            onAddItem={() => { setItemCatId(category.id); setEditingItem(null); setItemOpen(true); }}
            onEditItem={(item) => { setItemCatId(category.id); setEditingItem(item); setItemOpen(true); }}
            onDeleteItem={askDeleteItem}
          />
        ))
      )}

      <CategoryDialog
        open={catOpen}
        onOpenChange={setCatOpen}
        editing={editingCat}
        // 末尾に置く。**先頭に割り込ませない** (既存の並びを勝手に変えない)
        nextSortOrder={Math.max(0, ...categories.map((c) => c.sort_order ?? 0)) + 10}
      />
      <ItemDialog
        open={itemOpen}
        onOpenChange={setItemOpen}
        categoryId={itemCatId}
        editing={editingItem}
        nextSortOrder={
          Math.max(0, ...(categories.find((c) => c.id === itemCatId)?.items ?? []).map((it) => it.sort_order ?? 0)) + 10
        }
      />
    </div>
  );
}
