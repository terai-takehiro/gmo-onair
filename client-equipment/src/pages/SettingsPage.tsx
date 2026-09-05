/**
 * ⑧ 設定 (v4) — **機材管理のマスターを1画面4タブにまとめた**
 *
 * 旧実装は左メニューに6項目が散っていました:
 *
 *   保管場所管理 / メーカー管理 / 機材色 / 貸出機材設定 /
 *   貸出カテゴリ管理 (**メニューに出ていなかった**) / 貸出機材一覧の中のカテゴリ管理ダイアログ
 *
 * どれも月に1回触るかどうかの画面で、毎日使う画面と同じ高さに並んでいました。
 * さらに**貸出カテゴリの管理が2か所にあり**、片方はメニューから辿り着けませんでした。
 *
 * ── どのタブがどこに来たか ──────────────────────────────
 *
 *   保管場所      ← `LocationPage`  (拠点・種別のマスタもここから開く)
 *   メーカー・色  ← `ManufacturerPage` ＋ `ColorPage` (右のカード)
 *   貸出カテゴリ  ← `RentalCategoryPage` ＋ `ModelGroupPage` のダイアログ
 *   貸出のルール ← `RentalSettingsPage` (＋ モックの6つは保存先が無いので出さない)
 *
 * タブは URL に出します (`/equipment/settings?tab=maker`)。出さないと、
 * 特定のタブを人に教えられず「設定を開いて右から2番目」と口で言うことになります。
 */
import { useSearchParams } from 'react-router-dom';
import { Factory, MapPin, SlidersHorizontal, Tag } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { SubTabs } from '@/components/parts/SubTabs';
import { LocationsTab } from './settings/LocationsTab';
import { ManufacturersTab } from './settings/ManufacturersTab';
import { RentalCategoriesTab } from './settings/RentalCategoriesTab';
import { RentalRulesTab } from './settings/RentalRulesTab';

const TABS = [
  { key: 'loc', label: '保管場所', icon: <MapPin className="h-4 w-4" aria-hidden="true" /> },
  { key: 'maker', label: 'メーカー・色', icon: <Factory className="h-4 w-4" aria-hidden="true" /> },
  { key: 'cat', label: '貸出カテゴリ', icon: <Tag className="h-4 w-4" aria-hidden="true" /> },
  { key: 'rule', label: '貸出のルール', icon: <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> },
];

const LEAD: Record<string, string> = {
  loc: '機材の保管場所とラック図はここで作った場所に紐づきます',
  maker: 'メーカー名の表記ゆれを1つにまとめます。色はラック図のセルに出ます',
  cat: '貸出機材の一覧をまとめる見出しです',
  rule: 'どの機材を貸出の対象にするかを決めます',
};

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') ?? 'loc';
  const tab = TABS.some((t) => t.key === raw) ? raw : 'loc';

  const setTab = (key: string) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set('tab', key);
      return n;
    }, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader title="設定" sub={LEAD[tab]} />
      <SubTabs label="設定の種類" items={TABS} value={tab} onChange={setTab} />
      {tab === 'loc' && <LocationsTab />}
      {tab === 'maker' && <ManufacturersTab />}
      {tab === 'cat' && <RentalCategoriesTab />}
      {tab === 'rule' && <RentalRulesTab />}
    </div>
  );
}
