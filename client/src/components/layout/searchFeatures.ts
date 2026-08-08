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
 * 探せる機能の一覧。**3つの既にある定義から作る**（新しい表を作らない）。
 * 同じ行き先は1つにまとめる（左メニューと近道は重なる）。
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
    const appLabel = APPS.find((a) => a.key === appKey)?.label ?? '';
    for (const sec of sections) {
      for (const item of sec.items) {
        if (item.external) continue;
        push({
          label: item.label,
          sub: [appLabel, sec.title].filter(Boolean).join(' ／ '),
          to: item.to,
          icon: item.icon,
          module: item.module,
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
      external: !!a.external || !['sales', 'budget', 'studio', 'admin', 'gpm'].includes(a.key),
    });
  }
  return out;
}

export const FEATURES = buildFeatures();
