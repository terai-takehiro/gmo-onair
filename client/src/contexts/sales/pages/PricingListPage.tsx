/**
 * ⑧ 料金表（設定） (v4)
 *
 * 見積の元になる表。分類 → 品目の2段で、ここで足す・直す・消す・並べ替えができます。
 *
 * ── 場所ごとの表 (v4 大③・migration 172) ────────────────────
 *
 * モックどおり**上辺に場所のタブ**を出し、用賀・渋谷・青山で別々の表を持ちます。
 * 既存の 78 品目はすべて用賀の料金なので用賀に割り当てました。
 *
 * 1つの表を全部の案件で使っていると、**渋谷の案件に用賀の値段がそのまま出ます**。
 * しかも出た金額はそれらしいので、気づかずに見積を送ることになります。
 * 空の場所は空と見せます（「まだ入れていない」は直せる）。
 *
 * 空の場所からは ①ほかの場所の表を丸ごと写す ②空から作る の2つで始められます。
 * **写せるのは空の場所だけ** — 2回押すと同じ品目が2つ並び、どちらを選んだかで
 * 金額が変わります。
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
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Info } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { useAuth } from '@/contexts/platform/AuthContext';
import type { PricingCategory, PricingItem } from '@/types';
import { CategoryCard } from './pricing/CategoryCard';
import { CategoryDialog, ItemDialog } from './pricing/PricingDialogs';
import { usePricingLocations, LOCATION_KEY } from './pricing/locations';
import { LocationTabs, EmptyTable } from './pricing/LocationTabs';

const KEY = ['pricing-categories'];

export default function PricingListPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEditCategory = hasPermission('sales', 'owner');
  const canEditItem = hasPermission('sales', 'editor');
  const canDeleteItem = hasPermission('sales', 'manager');

  const [q, setQ] = useState('');
  // **開いている場所を URL に持つ。** 設定の「拠点・部屋」から
  // 「用賀の料金表」へ直接来られるようにするため（画面の中の状態だけだと、
  // 送られた側は毎回タブを押し直すことになる）
  const [sp, setSp] = useSearchParams();
  const locationId = sp.get('location') ?? '';
  const [catOpen, setCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<PricingCategory | null>(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [itemCatId, setItemCatId] = useState('');
  const [editingItem, setEditingItem] = useState<PricingItem | null>(null);

  const locations = usePricingLocations();
  // 既定は**料金が入っている最初の場所**。空の場所を開いて「壊れている」と
  // 読まれるより、中身のある表を先に見せる
  const activeLocation = locationId
    || locations.data?.find((l) => l.item_count > 0)?.id
    || locations.data?.[0]?.id
    || '';
  const activeName = locations.data?.find((l) => l.id === activeLocation)?.name ?? '';

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...KEY, activeLocation],
    queryFn: async () => (await api.get('/pricing/categories', { params: { location_id: activeLocation } })).data,
    enabled: !!activeLocation,
  });
  // `?? []` を素で書くと**毎回別の配列**になり、下の `useMemo` が毎描画で走る
  const categories: PricingCategory[] = useMemo(() => data?.data ?? [], [data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: KEY });
    // 場所のタブに出る品目数も一緒に落とす（片方だけだとタブの数字が古いまま）
    qc.invalidateQueries({ queryKey: LOCATION_KEY });
  };

  /** ほかの場所の表を丸ごと写す。**空の場所にしか写せない**（サーバーも弾く） */
  const copy = useMutation({
    mutationFn: (fromId: string) =>
      api.post(`/pricing/locations/${activeLocation}/copy-from`, { from_location_id: fromId }),
    onSuccess: (r) => {
      invalidate();
      const d = r.data.data as { categories: number; items: number };
      notifySuccess(`写しました（分類 ${d.categories} ／ 品目 ${d.items}）`, {
        description: '金額はこの場所のぶんだけ直せます。元の場所の料金は変わりません。',
      });
    },
    onError: (e) => notifyApiError('写せませんでした', e),
  });

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
    onError: (e) => notifyApiError('削除できませんでした', e),
  });

  /**
   * 並べ替え。**隣と入れ替えるだけ**。全件に連番を振り直すと、
   * 同時に別の人が触っていたとき、見ていない分類まで動きます。
   *
   * ⚠️ **入れ替えはサーバーの取引に任せます**（レビューでの指摘 #52）。
   * 前の版はここから `PUT` を**2本続けて**投げていたので、
   * **1本目が通って2本目が落ちると2つが同じ `sort_order`** になりました
   * （通信が切れた・権限が無かった・タブを閉じた）。並びは
   * `sort_order, created_at` の順なので**入れ替わったようで入れ替わらない**か
   * **関係ない順**になり、画面には「並べ替えられませんでした」と出るのに
   * **半分だけ動いています**。取引の中でやれば、落ちた回は**1ドットも動きません**。
   */
  const move = useMutation({
    mutationFn: (p: { id: string; dir: 'up' | 'down' }) =>
      api.put(`/pricing/categories/${p.id}/move`, { dir: p.dir }),
    onSuccess: invalidate,
    onError: (e) => notifyApiError('並べ替えられませんでした', e),
  });

  const askDeleteCategory = async (c: PricingCategory) => {
    const n = c.items?.length ?? 0;
    const ok = await confirmAction({
      title: `分類「${c.name}」を削除しますか`,
      description: n > 0
        ? `この分類に入っている ${n} 品目も、料金表から見えなくなります。すでに作った見積の金額は変わりません。`
        : 'すでに作った見積の金額は変わりません。',
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (ok) del.mutate({ kind: 'category', id: c.id });
  };

  const askDeleteItem = async (item: PricingItem) => {
    const ok = await confirmAction({
      title: `品目「${item.name}」を削除しますか`,
      description: '以後この品目は見積で選べなくなります。すでに作った見積の金額は変わりません。',
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (ok) del.mutate({ kind: 'item', id: item.id });
  };

  return (
    <div className="flex flex-col gap-3.5 p-4 lg:p-6">
      <PageHeader
        title="料金表"
        sub={`${activeName} の料金表 ・ 分類 ${categories.length} ／ 品目 ${totalCount}`}
        primaryAction={canEditCategory ? (
          <Button onClick={() => { setEditingCat(null); setCatOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />分類を追加
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

      <LocationTabs
        locations={locations.data ?? []}
        value={activeLocation}
        onChange={(id) => {
          setSp((prev) => { const n = new URLSearchParams(prev); n.set('location', id); return n; }, { replace: true });
          setQ('');
        }}
      />

      {/* 決めごと。**画面に書いておかないと必ず訊かれる**もの */}
      <div className="flex items-start gap-2.5 rounded-note border border-primary-border bg-primary-surface-weak px-3.5 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-note text-secondary-foreground">
          <strong className="font-bold">ここを直しても、すでに作った見積の金額は変わりません。</strong>
          <strong className="font-bold">料金表は場所ごとに別</strong>です（この表は {activeName} のぶん）。
          グループ会社価格が「設定なし」の品目は、グループ会社の案件では選べません（逆も同じ）。
          料金表を直すには 案件管理の「書ける」が必要です。
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
        <EmptyTable
          locationName={activeName}
          sources={(locations.data ?? []).filter((l) => l.id !== activeLocation && l.item_count > 0)}
          canEdit={canEditCategory}
          copying={copy.isPending}
          onCopy={(fromId) => copy.mutate(fromId)}
          onStartEmpty={() => { setEditingCat(null); setCatOpen(true); }}
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
            // **どちらへ動かすかだけ渡す。** 隣を探すのはサーバー（取引の中）
            onMove={(dir) => move.mutate({ id: category.id, dir: dir < 0 ? 'up' : 'down' })}
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
        locationId={activeLocation}
        locationName={activeName}
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
