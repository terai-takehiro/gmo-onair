/**
 * 計時LIVE の左メニュー (v4)
 *
 * 旧 `Sidebar.tsx` が持っていた項目をそのまま `ShellNavSection[]` の形に書き直した
 * だけです（並び・ラベル・アイコンは変えていない）。情報設計そのものの見直しは
 * 別作業（`shared/CLAUDE.md` の「メニューの中身はシェルが決めない」）。
 *
 * ── 番組の下は動的に足す ─────────────────────────────────────
 *
 * 「ダッシュボード／タイマー管理／番組設定」は `/program/:programId` 配下でしか
 * 意味を持たない（`programId` が無いと行き先が作れない）。旧 `Sidebar.tsx` は
 * `programId` の有無で表示を丸ごと出し分けていたが、共通シェルの `sections` は
 * 静的な配列なので、**`buildLiveNav(programId)` が呼び出しごとに組み立てる**。
 * `AppShell.tsx` が `useParams()` の `programId` を渡す。
 */
import {
  LayoutDashboard,
  Settings,
  Timer,
} from 'lucide-react';
import type { ShellNavSection } from '@gmo-onair/shared/src/client/shell';

/** 番組を選んでいないとき（セッション一覧・組織の設定）の並び */
const LIVE_BASE_NAV: ShellNavSection[] = [
  {
    items: [
      { label: 'セッション一覧', to: '/', icon: Timer, end: true },
      { label: '設定', to: '/settings', icon: Settings },
    ],
  },
];

/**
 * いま開いている番組の並びを足す。`programId` が無ければ基本の並びだけを返す
 * （セッション一覧・組織の設定の画面にいるとき）。
 */
export function buildLiveNav(programId?: string): ShellNavSection[] {
  if (!programId) return LIVE_BASE_NAV;
  return [
    ...LIVE_BASE_NAV,
    {
      title: 'この番組',
      items: [
        { label: 'ダッシュボード', to: `/program/${programId}`, icon: LayoutDashboard, end: true },
        { label: 'タイマー管理', to: `/program/${programId}/timers`, icon: Timer },
        { label: '番組設定', to: `/program/${programId}/settings`, icon: Settings },
      ],
    },
  ];
}
