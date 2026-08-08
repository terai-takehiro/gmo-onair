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
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRightLeft, Cable, ChevronRight, Package, QrCode, Search, Wrench,
} from 'lucide-react';
import api from '@/lib/api';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowMain, RowTitle, RowSub } from '@gmo-onair/shared/src/client/ui/row';
import { Delayed, EmptyState, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { useDebounced } from '@/hooks/useDebounced';
import { Input } from '@/components/ui/input';
import type { EquipmentRecord } from './equipmentList/types';
import type { CatalogItem } from './catalog/types';

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
      (await api.get('/equipment/items', { params: { search: debounced } })).data.data as EquipmentRecord[],
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

  const onType = (v: string) => {
    setQuery(v);
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      if (v.trim()) n.set('q', v.trim()); else n.delete('q');
      return n;
    }, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader title="探す" sub="機材・ケーブル・コネクタをまとめて探します" />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => onType(e.target.value)}
          placeholder="名前・機材ID・型名・置き場所"
          aria-label="探す言葉"
          className="min-h-tap h-11 pl-10 lg:h-10"
        />
      </div>

      {/* **目の前に物があるなら打つより読むほうが速い。** 常に出しておく */}
      <button
        type="button"
        onClick={() => navigate('/equipment/scan')}
        className="rounded-card min-h-tap flex w-full items-center gap-3 border border-primary-border bg-primary-surface-weak px-4 py-3 text-left"
      >
        <QrCode className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="text-list block text-primary">QR コードを読む</span>
          <span className="text-note block text-muted-foreground">機材のシールを写すとその1点が開きます</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      </button>

      {!searching ? (
        <Standby stats={stats.data} onGo={navigate} />
      ) : loading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : total === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" aria-hidden="true" />}
          title={`「${debounced}」に当たるものはありません`}
          description="機材IDの一部（0001 など）や、型名の一部でも探せます。全角半角・ハイフンは区別していません。"
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          <p className="text-sub text-muted-foreground">
            <span className="font-number font-bold">{total}</span> 件
          </p>

          {found.length > 0 && (
            <Group icon={Package} label="機材" n={found.length}>
              {found.map((it) => (
                <ClickRow key={it.id} onOpen={() => navigate(`/equipment/items/${it.id}`)}>
                  <RowMain>
                    <RowTitle>{it.name}</RowTitle>
                    <RowSub>
                      {[it.eq_code, it.model_number, it.unit_number != null ? `No.${it.unit_number}` : '']
                        .filter(Boolean).join(' ／ ')}
                    </RowSub>
                    <RowSub>
                      {[it.manufacturer_name, it.location_name || it.location_detail]
                        .filter(Boolean).join(' ・ ') || '置き場所は登録されていません'}
                    </RowSub>
                  </RowMain>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </ClickRow>
              ))}
            </Group>
          )}

          {supplies.length > 0 && (
            /* **開くのは台帳のタブ。** ケーブル・コネクタには1点ごとの画面が無い
               （数で持つ在庫なので、1本ずつの記録を作っていない） */
            <Group icon={Cable} label="ケーブル・コネクタ" n={supplies.length}>
              {supplies.map((it) => (
                <ClickRow key={`${it.kind}-${it.id}`} onOpen={() => navigate('/equipment/items?view=supply')}>
                  <RowMain>
                    <RowTitle>{it.name}</RowTitle>
                    <RowSub>
                      {[it.model_number, it.length_m != null ? `${it.length_m}m` : '', it.color,
                        it.location_name, `${it.quantity} 本`].filter(Boolean).join(' ・ ')}
                    </RowSub>
                  </RowMain>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </ClickRow>
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 打ち込む前に出すもの。**メニューの写しにしない** —
 * 出すのは「いまどうなっているか」だけで、0 のものは出しません。
 */
function Standby({ stats, onGo }: { stats?: Record<string, number>; onGo: (to: string) => void }) {
  const rows: Array<{ key: string; icon: typeof Search; title: string; sub: string; to: string }> = [];
  if (stats?.lent_out) {
    rows.push({
      key: 'lent', icon: ArrowRightLeft,
      title: `貸出中 ${stats.lent_out} 点`,
      sub: stats.overdue ? `うち ${stats.overdue} 点が返却予定日を過ぎています` : '返却予定日を過ぎたものはありません',
      to: '/equipment/lendings',
    });
  }
  if (stats?.open_maintenance) {
    rows.push({
      key: 'maint', icon: Wrench,
      title: `直していないもの ${stats.open_maintenance} 件`,
      sub: '故障・点検の記録が開いたままです',
      to: '/equipment/maintenance',
    });
  }
  if (stats?.pending_inventory) {
    rows.push({
      key: 'inv', icon: AlertTriangle,
      title: `棚卸しの途中 ${stats.pending_inventory} 件`,
      sub: 'まだ確認できていない場所があります',
      to: '/equipment/inventory',
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      {rows.length > 0 && (
        <Group icon={Search} label="いまの様子" n={rows.length}>
          {rows.map((r) => (
            <ClickRow key={r.key} onOpen={() => onGo(r.to)}>
              <r.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <RowMain>
                <RowTitle>{r.title}</RowTitle>
                <RowSub>{r.sub}</RowSub>
              </RowMain>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </ClickRow>
          ))}
        </Group>
      )}

      <p className="text-note text-muted-foreground">
        機材は<strong className="font-bold">名前・機材ID・型名・製造番号・メーカー・置き場所</strong>、
        ケーブル・コネクタは<strong className="font-bold">名前・型名・長さ・色・置き場所</strong>から探します。
        全角半角・ハイフンは区別しません（<code className="font-number">EQ-0001</code> と
        <code className="font-number">eq0001</code> は同じ）。
        <strong className="font-bold">付属品も一緒に出ます。</strong>
      </p>
    </div>
  );
}

/** 押せる行。**キーボードでも押せるようにする**（`onClick` だけの `<div>` は Tab で止まらない） */
function ClickRow({ onOpen, children }: { onOpen: () => void; children: React.ReactNode }) {
  return (
    <Row
      divider
      interactive
      align="start"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Row>
  );
}

function Group({ icon: Icon, label, n, children }: {
  icon: typeof Search; label: string; n: number; children: React.ReactNode;
}) {
  return (
    <section className="rounded-card overflow-hidden border border-border bg-card">
      <h2 className="text-cardtitle flex items-center gap-2 border-b border-border-faint bg-surface-subtle px-4 py-2.5">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {label}
        <span className="text-sub font-number font-bold text-muted-foreground">{n}</span>
      </h2>
      {children}
    </section>
  );
}
