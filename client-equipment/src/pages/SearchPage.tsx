/**
 * 機材管理の「探す」（v4・スマホの下タブ 3つ目・M9）
 *
 * ── なぜ作るのか ────────────────────────────────────────────
 *
 * v4 の決めごとは**下タブ3つ = ホーム / やること / 検索**。ところがこのアプリは
 * 検索の画面が無く、**3つ目を「メニューを開く」で代用**していました。
 * メニューは上辺バーの ☰ からも開けるので、**3枠のうち1枠が二重の入口**でした。
 *
 * ── 機材台帳の写しではありません ────────────────────────────
 *
 * 台帳（`/equipment/items`）は**棚を眺める画面**で、タブ3つ・絞り込み4軸・
 * 道具帯を先に通ります。ここは**現場で1点を当てる画面**なので、
 * 出すのは「打つ欄」と「当たったもの」だけです。
 *
 * ケーブル・コネクタも一緒に探します（台帳では別のタブ）。現場で
 * 「HDMI 5m はどこ」と訊かれたとき、**どちらの台帳に入っているかを
 * 先に思い出さずに済む**ようにするためです。
 *
 * ── QR を上に置く ───────────────────────────────────────────
 *
 * 目の前に物があるなら、**打つより読むほうが速くて間違えません**。
 * 打ち込む前の画面ではいちばん上に置きます。
 *
 * ── 探し方 ──────────────────────────────────────────────────
 *
 * 機材は**サーバーに投げます**（`GET /equipment/items?search=`。台帳と同じ口で、
 * 写すと当たり方が2つになる）。ケーブル・コネクタは表が小さいので画面側で当てます。
 *
 * ── PC / スマホで構成そのものを変えた（v4 ネイティブUI監査 2026-08-20） ──
 *
 * 監査で見つかった不足点は2つ:
 * ①結果一覧が汎用 Row/RowMain の流用でカード積み等の専用表現になっていない
 * ②PC・スマホで画面構成に差が無い（同じ1カラムを両方に出している）
 *
 * → **薄い親で問い合わせ・絞り込みを1回だけ持ち**、見た目は
 * `SearchPageDesktop` / `SearchPageMobile` に丸ごと入れ替える
 * （`useIsMobile()` は薄い親で1回だけ呼ぶ — 同じ部品の中で早期 return しない）。
 * `scan/ScanPage.tsx`（同じ監査で先に直した QRスキャン）と同じやり方に揃えた。
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import api from '@/lib/api';
import { useDebounced } from '@/hooks/useDebounced';
import type { EquipmentRecord } from './equipmentList/types';
import type { CatalogItem } from './catalog/types';
import { buildStandbyRows } from './search/standby';
import { SearchPageDesktop } from './search/SearchPageDesktop';
import { SearchPageMobile } from './search/SearchPageMobile';

/** 打ち込みの揺れを吸う（全角→半角・大文字小文字・区切り記号）。`EQ-0001` と `eq0001` を同じに */
function norm(s: unknown): string {
  return String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s\-_/.]/g, '');
}

function matchesSupply(it: CatalogItem, terms: string[]): boolean {
  const hay = norm([
    it.name, it.model_number, it.manufacturer_name, it.location_name,
    it.color, it.length_m != null ? `${it.length_m}m` : '', it.notes,
  ].filter(Boolean).join(' '));
  return terms.every((t) => hay.includes(t));
}

export default function SearchPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [query, setQuery] = useState(sp.get('q') ?? '');
  // 打っている間は投げない（1文字ごとに通信が積み上がる）
  const debounced = useDebounced(query.trim(), 350);
  const searching = debounced.length > 0;
  const terms = useMemo(
    () => debounced.split(/\s+/).map(norm).filter(Boolean),
    [debounced],
  );

  const items = useQuery({
    // **台帳（`['equipment-items', …]`）とは別の鍵にする。** 同じ鍵にすると
    // 中身を共有できて得だが、片方の問い合わせ方を変えた日から
    // **どちらが先に走ったかで結果が変わる**（気づけない壊れ方）
    queryKey: ['equipment-search', debounced],
    queryFn: async () =>
      /*
       * ⚠️ **`include_children=1` を渡す**（レビューでの指摘 #70）。
       * 台帳は木で見せるので既定では親だけを返しますが、**ここは
       * 「その1点を当てる」画面**です。渡さないと**カメラセットの中の
       * レンズが1つも出ません** — 画面の下には「付属品も一緒に出ます」と
       * 書いてあるので、書いてあるのに出ない状態でした。
       */
      (await api.get('/equipment/items', {
        params: { search: debounced, include_children: '1' },
      })).data.data as EquipmentRecord[],
    enabled: searching,
  });
  // ケーブル・コネクタは表が小さいので丸ごと引いて画面側で当てる
  const cables = useQuery({
    queryKey: ['equipment-cables'],
    queryFn: async () => (await api.get('/equipment/cables')).data.data as CatalogItem[],
    enabled: searching,
  });
  const connectors = useQuery({
    queryKey: ['equipment-connectors'],
    queryFn: async () => (await api.get('/equipment/connectors')).data.data as CatalogItem[],
    enabled: searching,
  });
  const stats = useQuery({
    queryKey: ['equipment-stats'],
    queryFn: async () => (await api.get('/equipment/stats')).data.data as Record<string, number>,
    staleTime: 60_000,
  });

  const supplies = useMemo(
    () => [...(cables.data ?? []), ...(connectors.data ?? [])].filter((it) => matchesSupply(it, terms)),
    [cables.data, connectors.data, terms],
  );
  const found = items.data ?? [];
  const total = found.length + supplies.length;
  const loading = searching && (items.isLoading || cables.isLoading || connectors.isLoading);
  const standbyRows = useMemo(() => buildStandbyRows(stats.data), [stats.data]);

  const onType = (v: string) => {
    setQuery(v);
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      if (v.trim()) n.set('q', v.trim()); else n.delete('q');
      return n;
    }, { replace: true });
  };

  const viewProps = {
    query,
    onType,
    searching,
    loading,
    total,
    debounced,
    found,
    supplies,
    standbyRows,
    onGo: navigate,
    onOpenEquipment: (id: string) => navigate(`/equipment/items/${id}`),
    // **開くのは台帳のタブ。** ケーブル・コネクタには1点ごとの画面が無い
    // （数で持つ在庫なので、1本ずつの記録を作っていない）
    onOpenSupply: () => navigate('/equipment/items?view=supply'),
    onScan: () => navigate('/equipment/scan'),
  };

  return isMobile ? <SearchPageMobile {...viewProps} /> : <SearchPageDesktop {...viewProps} />;
}
