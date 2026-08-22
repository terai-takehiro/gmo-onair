/**
 * 探せる「機能」の一覧（上辺バーの ⌘K の窓が使う）
 *
 * **3つの既にある定義から作ります**（新しい表を作らない）:
 *   ・`search/shortcuts.ts` … ⑪ 探すの「やること」「場所」（何が起きるかの1行つき）
 *   ・`layout/nav.ts`       … 4つの入口の左メニュー（＝画面の一覧）
 *   ・`shared/…/apps.ts`    … アプリ登録
 *
 * 表をここで手書きすると、画面を足した人が**片方だけ**足します。
 * 同じ行き先は1つにまとめ、**見る権限が無いものは窓に出しません**
 * （押してから 403 で気づかせない）。
 */
import type { LucideIcon } from 'lucide-react';
import { APPS } from '@gmo-onair/shared/src/client/apps';
import { DO_ITEMS, PLACES } from '@/contexts/platform/pages/search/shortcuts';
import { CLIENT_NAV } from './nav';

/** 探せる「機能」1件。行き先と、見るのに要る権限 */
export interface Feature {
  label: string;
  sub: string;
  to: string;
  icon?: LucideIcon;
  module?: string;
  modules?: string[];
  minLevel?: 'reader' | 'editor';
  adminOnly?: boolean;
  external?: boolean;
}

/**
 * **入口をわざと開けてあるアプリ**（＝そのアプリの左メニューで `module` を
 * 書いていない項目は、本当に誰でも開ける）。
 *
 * 設定だけがこれに当たります（`nav.ts` の `admin` に理由が書いてある）:
 * 案内板（`/settings`）とシステムの情報は、料金表だけ・取引先だけを直す人も
 * 来る場所で、パスワード変更は全員が使うので**権限を掛けていません**。
 *
 * ⚠️ **ここに足すのは「開いていることを確かめてから」。** 既定は
 * 「入口の権限が要る」側（`APPS[key].permissionModule`）で、
 * **知らないアプリは出さない側に倒れます**。
 */
const OPEN_ENTRANCES = new Set(['admin']);

/**
 * 探せる機能の一覧。**3つの既にある定義から作る**（新しい表を作らない）。
 * 同じ行き先は1つにまとめる（左メニューと近道は重なる）。
 *
 * ── 左メニューの項目は「入口の権限」を引き継ぐ（実測で見つけた漏れ）──
 *
 * `nav.ts` の項目の多くは `module` を書いていません。**左メニューは
 * その入口に入れた人にしか見えない**ので書く必要が無く、権限は
 * `App.tsx` の `<PermissionRoute module="sales">` が持っています。
 * そのまま窓に並べると、**`sales` が無い人にも「案件一覧」「料金表」
 * 「標準工程テンプレート」が出ました**（実 DB の経理だけ・権限なしの
 * ユーザーで確認）。画面名が見えるのは v3.2.2 で塞いだ検索の漏れと同じ形なので、
 * **項目が何も書いていないときは入口の権限を要求します**。
 */
function buildFeatures(): Feature[] {
  const out: Feature[] = [];
  const seen = new Set<string>();
  const push = (f: Feature) => {
    if (seen.has(f.to)) return;
    seen.add(f.to);
    out.push(f);
  };

  for (const s of [...DO_ITEMS, ...PLACES]) {
    push({ label: s.label, sub: s.sub, to: s.to, icon: s.icon, module: s.module, minLevel: s.minLevel, external: s.external });
  }
  for (const [appKey, sections] of Object.entries(CLIENT_NAV)) {
    const app = APPS.find((a) => a.key === appKey);
    // 項目が何も書いていないときに要求する権限（＝入口の権限）
    const entrance = OPEN_ENTRANCES.has(appKey) ? undefined : app?.permissionModule;
    for (const sec of sections) {
      for (const item of sec.items) {
        if (item.external) continue;
        const declared = item.module || item.modules || item.adminOnly;
        push({
          label: item.label,
          sub: [app?.label, sec.title].filter(Boolean).join(' ／ '),
          to: item.to,
          icon: item.icon,
          module: item.module ?? (declared ? undefined : entrance),
          modules: item.modules,
          adminOnly: item.adminOnly,
        });
      }
    }
  }
  for (const a of APPS) {
    if (a.comingSoon || a.hidden || a.key === 'home') continue;
    push({
      label: a.label,
      sub: a.description,
      to: a.external ?? a.path,
      icon: a.icon,
      module: a.external ? undefined : a.permissionModule,
      // 別バンドル・外部サイトはルーターで飛べない
      external: !!a.external || !['sales', 'budget', 'calendar', 'admin', 'gpm'].includes(a.key),
    });
  }
  return out;
}

export const FEATURES = buildFeatures();
