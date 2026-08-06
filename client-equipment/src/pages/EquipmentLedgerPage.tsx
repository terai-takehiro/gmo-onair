/**
 * ② 機材台帳 (v4) — **機材・貸出機材・ケーブル・コネクタを1つの台帳にした**
 *
 * 旧実装は左メニューに4項目が別々に並んでいました
 * (機材一覧 / 貸出機材一覧 / ケーブル管理 / コネクタ管理)。
 * どれも「うちにある物の台帳」で、探しているものがどれに入っているかを
 * 先に思い出す必要がありました。モックのとおり**種別のタブ**にまとめています。
 *
 * ── モックとの違い (意図したもの) ──────────────────────────
 *
 * モックの3つ目のタブは「ケーブル・コネクタ」が**1つの一覧**ですが、
 * ケーブルとコネクタは**別のテーブル**で、ケーブルにしか無い列 (長さ・色) が
 * あります。1つの一覧に混ぜるとコネクタの行に空の列が2つ並ぶので、
 * タブの中でさらに切り替える形にしました (列の意味と保存する値は今までと同じ)。
 *
 * ── タブは URL に出す ──────────────────────────────────────
 *
 * `/equipment/items?view=lend` のように出します。出さないと、
 * 「機材台帳を開いて右から2番目」と口で伝えることになります。
 * 旧 URL (`/equipment/model-groups` `/equipment/cables` `/equipment/connectors`) は
 * `App.tsx` でここへ転送しています。
 */
import { useSearchParams } from 'react-router-dom';
import { Cable, Layers, Package, Plug } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { SubTabs } from '@/components/parts/SubTabs';
import { ItemsPanel } from './equipmentList/ItemsPanel';
import { RentalPanel } from './equipmentList/RentalPanel';
import { CatalogPanel } from './catalog/CatalogPanel';
import { CABLE_CONFIG, CONNECTOR_CONFIG } from './catalog/types';

const VIEWS = [
  { key: 'items', label: '機材', icon: <Package className="h-4 w-4" aria-hidden="true" /> },
  { key: 'lend', label: '貸出機材', icon: <Layers className="h-4 w-4" aria-hidden="true" /> },
  { key: 'cable', label: 'ケーブル', icon: <Cable className="h-4 w-4" aria-hidden="true" /> },
  { key: 'connector', label: 'コネクタ', icon: <Plug className="h-4 w-4" aria-hidden="true" /> },
];

const LEAD: Record<string, string> = {
  items: '機材は常設が基本です。持ち出せるのは「貸出可」にした機材だけです',
  lend: '「貸出可」にした機材だけが並びます。型番ごとにまとめ、開くと1台ずつ出ます',
  cable: 'ケーブルの在庫です。数をまとめて直すときは Excel の取込を使います',
  connector: 'コネクタの在庫です。数をまとめて直すときは Excel の取込を使います',
};

export default function EquipmentLedgerPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('view') ?? 'items';
  const view = VIEWS.some((v) => v.key === raw) ? raw : 'items';

  const setView = (key: string) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set('view', key);
      // 台帳が変わると絞り込みの意味も変わるので、機材の絞り込みは持ち越さない
      for (const k of ['tab', 'sect', 'locs', 'q', 'sort', 'dir', 'children']) n.delete(k);
      return n;
    }, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader title="機材台帳" sub={LEAD[view]} />
      <SubTabs label="台帳の種類" items={VIEWS} value={view} onChange={setView} />
      {view === 'items' && <ItemsPanel />}
      {view === 'lend' && <RentalPanel />}
      {view === 'cable' && <CatalogPanel config={CABLE_CONFIG} />}
      {view === 'connector' && <CatalogPanel config={CONNECTOR_CONFIG} />}
    </div>
  );
}
