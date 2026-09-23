/**
 * Wiki の左メニューとスマホ下タブ（docs/design/v4/wiki.md §6-①）
 *
 * 設計書の並びは
 *   ホーム ／ 検索 ／ AI に聞く ／ 見直し
 *   ＋「スペース」の見出しの下にスペース（API から来る）
 *   ＋「管理」の見出しの下にテンプレート・スペース管理
 * の3かたまり。**その全部をここに書いてある**が、画面がまだ無い項目には
 * `ready: false` を立てて外している（いま外れているのは 見直し＝段F と
 * スペース管理＝段F）。
 *
 * ⚠️ **押せるのに何も出ない項目を出さない。** ルートの無い行き先を左メニューに
 *    並べると、押した人には「壊れている」としか見えない（§6-①）。
 *    その画面を作ったら `ready: true` に変えるだけでよい
 *    （段D で検索、段E で「AI に聞く」をこうして出した）。
 *
 * スペースは件数も名前も DB にあるので、ここには固定の項目だけを置き、
 * スペースの区画は `buildWikiSections()` が受け取って組む（呼ぶのは AppShell）。
 */
import { ArrowDownUp, LayoutDashboard, LayoutTemplate, ListChecks, Search, Settings2, Sparkles } from 'lucide-react';
import type { ShellMobileTab, ShellNavItem, ShellNavSection } from '@gmo-onair/shared/src/client/shell';
import type { WikiSpace } from '@gmo-onair/shared/src/wiki/types';

interface PlannedNavItem extends ShellNavItem {
  /** その画面が既にあるか。段E まででできているのは ホーム／検索／AI に聞く／テンプレート */
  ready: boolean;
}

/** 上のかたまり（§6-① の4項目） */
const TOP: PlannedNavItem[] = [
  { label: 'ホーム',    to: '/',       icon: LayoutDashboard, end: true, ready: true },
  { label: '検索',      to: '/search', icon: Search,                     ready: true  }, // 段D で作った
  { label: 'AI に聞く', to: '/ask',    icon: Sparkles,                   ready: true  }, // 段E で作った
  { label: '見直し',    to: '/review', icon: ListChecks,                 ready: false }, // 段F
];

/** 下のかたまり（管理） */
const ADMIN: PlannedNavItem[] = [
  { label: 'テンプレート',  to: '/templates', icon: LayoutTemplate, ready: true },  // 段B で作った
  { label: '書き出しと取り込み', to: '/transfer', icon: ArrowDownUp, wrap: true, ready: true }, // 段D で作った
  { label: 'スペース管理',  to: '/spaces',    icon: Settings2,      ready: false }, // 段F
];

const shipped = (items: PlannedNavItem[]): ShellNavItem[] =>
  items.filter((i) => i.ready).map(({ ready: _ready, ...item }) => item);

/**
 * 左メニューを組む。スペースは DB から来るので引数で受ける。
 * スペースが0件のとき「スペース」の見出しだけが残らないように、区画ごと落とす。
 */
export function buildWikiSections(spaces: WikiSpace[] | undefined): ShellNavSection[] {
  const sections: ShellNavSection[] = [{ items: shipped(TOP) }];

  const spaceItems: ShellNavItem[] = (spaces ?? []).map((s) => ({
    label: s.name,
    to: `/s/${s.key}`,
    // 件数は右端の小さい表示に出す。0件のときは出さない（「0」を並べても読めない）
    tag: s.page_count ? String(s.page_count) : undefined,
    wrap: true,
  }));
  if (spaceItems.length > 0) sections.push({ title: 'スペース', items: spaceItems });

  const adminItems = shipped(ADMIN);
  if (adminItems.length > 0) sections.push({ title: '管理', items: adminItems });

  return sections;
}

/**
 * スマホ下タブ（共通の決まりで **3つ**: ホーム／やること／検索）。
 * 「やること」は Wiki では見直し（§6-⑦）でまだ無く、「検索」は §6-④ を段D で作った。
 * **2つに満たないときはタブそのものを出さない**（1つだけのタブは行き先が1つしか
 * ない棒になって場所を取るだけ）。
 */
const TABS: Array<ShellMobileTab & { ready: boolean }> = [
  { label: 'ホーム',   to: '/',       icon: LayoutDashboard, end: true, ready: true },
  { label: 'やること', to: '/review', icon: ListChecks,                 ready: false }, // 段F
  { label: '検索',     to: '/search', icon: Search,                     ready: true  }, // 段D で作った
];

export const WIKI_MOBILE_TABS: ShellMobileTab[] = TABS
  .filter((t) => t.ready)
  .map(({ ready: _ready, ...tab }) => tab);
