/**
 * 制作技術支援（旧「制作資料」）の左メニュー／スマホ下タブ — **2026-08-22（ご指示）で
 * 固定4項目から「いまの案件/番組の文脈」に応じて動的に組み立てる形へ作り直した**。
 *
 * ── 変えた理由 ─────────────────────────────────────────────────────
 *
 * それまでは `QSHEET_NAV` / `QSHEET_MOBILE_TABS` という固定配列を、案件文脈を無視して
 * どのページでもそのまま出していた。しかし:
 *
 * 1. 「ドキュメント一覧」「スケジュール表」（絞り込み無しの全案件横断一覧）への導線は、
 *    このアプリの正規のジャーニー（番組・案件を選ぶ → ハブ画面 [`JourneyPage.tsx`] →
 *    ミニアプリタイル）と役割が重複しており、ユーザー判断で撤去した
 * 2. 「収録・配信設定」（`/qsheet/device-settings`・`DeviceSettingsHome.tsx`）は
 *    簡易入口ごと廃止した（`App.tsx` にルートが無い。CLAUDE.md の「廃止」の定義通り、
 *    ファイルは残すがコードからの導線はすべて外した）
 * 3. 代わりに、いま案件（project）または番組（program・`qsheet_programs` のマニュアル）を
 *    **開いている**ときは、その案件/番組の子アプリ（進行台本／スケジュール表／収録設定／
 *    配信設定／レンタル機材検索）へのリンクを動的に出す。文脈が分からないとき
 *    （`/qsheet/top`・`/qsheet/home`・ログイン画面など）は「トップ」だけを出す
 *
 * ── 判定は pathname 優先・`useParams()` は使わない ───────────────────
 *
 * `AppShell.tsx` は共通シェルのレイアウト側（`<Outlet />` の親）で、React Router の
 * `useParams()` は**子ルートの `:id` / `:ownerKey` を拾えないことがある**
 * （レイアウトルートと子ルートで別の `useParams()` 呼び出しになるため）。
 * そのため `pathname` を文字列として自前でパースする（`resolveContext` 以下）。
 *
 * ── 「いま見ている案件/番組」が URL だけで分からないページ ─────────────
 *
 * `/qsheet/recording/:ownerKey` 等は owner キー（案件idまたは番組idそのもの）は URL に
 * 出るが、project か program かは URL だけでは分からない。`/qsheet/editor/:id` 等は
 * URL に出るのが doc id であって project/program の id ではない。これらのページでは
 * `lib/productionNavContext.ts` のストア（`useProductionNavContext`）を補助的に見る
 * （`buildQsheetNav` の判定ロジック本体のコメント参照）。
 *
 * ── `to` が `/qsheet/...` で始まる理由 ──────────────────────────────
 *
 * このアプリはルーターの `basename` を持たず、Vite の `base: '/qsheet/'` だけで
 * 動いている（`client-equipment/src/components/layout/nav.ts` と同じ事情）。
 * 共通シェルは接頭辞を知らないので、ここに閉じ込める。
 *
 * ── ラベル・URL の組み立て方の正 ────────────────────────────────────
 *
 * ミニアプリのラベルは `shared/src/production/miniapps.ts` の `MINI_APP_BY_KEY` を使う
 * （文言のハードコード重複を避ける）。絞り込みつき URL（`?project=`/`?program=`）と
 * `panelPathOf` の使い方は `components/journey/MiniAppTiles.tsx` と揃えてある。
 *
 * ── スマホ下タブは3本ルールのまま（文脈なしのときだけ1本） ──────────────
 *
 * `docs/design/v4/_rules.md`「3. スマホ」の3本ルールに対し、文脈が無い状態
 * （`/qsheet/top` 等）は「トップ」1本にした（ご判断）。`shell/MobileTabs.tsx` は
 * `tabs.length === 0` のときだけ `null` を返し、各タブは `flex-1` で幅を分け合う
 * 実装（3本前提の決め打ちレイアウトは無い）ので、1本・3本のどちらでも崩れない
 * ことを確認した上でこの形にしている。
 */
import { LayoutDashboard, LayoutGrid, CalendarDays, Settings2, Package, Timer } from 'lucide-react';
import type { ShellMobileTab, ShellNavSection } from '@gmo-onair/shared/src/client/shell';
import { MINI_APP_BY_KEY, panelPathOf } from '@gmo-onair/shared/src/production/miniapps';
import type { ProductionNavContext } from '@/lib/productionNavContext';

const PROJECT_HUB_RE = /^\/qsheet\/projects\/([^/?#]+)\/?$/;
const PROGRAM_HUB_RE = /^\/qsheet\/programs\/([^/?#]+)\/?$/;
const RECORDING_RE = /^\/qsheet\/recording\/([^/?#]+)\/?$/;
const STREAMING_RE = /^\/qsheet\/streaming\/([^/?#]+)\/?$/;
const RENTAL_RE = /^\/qsheet\/rental\/([^/?#]+)(?:\/(?:list|mail\/[^/?#]+))?\/?$/;
const EDITOR_RE = /^\/qsheet\/editor\/[^/?#]+\/?$/;
const SCHEDULE_DETAIL_RE = /^\/qsheet\/schedules\/[^/?#]+\/?$/;
const DOCS_RE = /^\/qsheet\/docs\/[^/?#]+\/?$/;

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** owner キーが URL に出る3つのパネル画面（収録設定・配信設定・レンタル機材検索）から ownerKey を取り出す */
function matchOwnerKeyPanel(pathname: string): string | null {
  const m = pathname.match(RECORDING_RE) ?? pathname.match(STREAMING_RE) ?? pathname.match(RENTAL_RE);
  return m ? safeDecode(m[1]) : null;
}

/**
 * pathname と searchParams（必要ならストアの値）から「いま見ている案件/番組」を判定する。
 * 判定ロジック本体（優先順位はコード上の順序どおり）:
 *
 * 1. `/qsheet/projects/<id>` → `{scope:'project', id}`
 * 2. `/qsheet/programs/<id>` → `{scope:'program', id}`
 * 3. `/qsheet/sheets` または `/qsheet/schedules`（絞り込み一覧）で `?project=`/`?program=`
 *    があれば、その scope/id
 * 4. `/qsheet/recording|streaming|rental/<ownerKey>`（配下の `/list`・`/mail/:company` 含む）:
 *    ストアの値があり、かつ `id` が一致すればそれを使う。一致しなければ「未解決」
 * 5. `/qsheet/editor/<id>`・`/qsheet/schedules/<id>`（個別）・`/qsheet/docs/<id>`:
 *    ストアの値があればそのまま使う（doc id は project/program の id では**ない**ため、
 *    id の突き合わせはしない）
 * 6. それ以外 → 文脈なし（`null`）
 */
function resolveContext(
  pathname: string,
  searchParams: URLSearchParams,
  storeCtx: ProductionNavContext | null,
): ProductionNavContext | null {
  const projectHub = pathname.match(PROJECT_HUB_RE);
  if (projectHub) {
    const id = safeDecode(projectHub[1]);
    return { scope: 'project', id, label: storeCtx?.id === id ? storeCtx.label : null };
  }

  const programHub = pathname.match(PROGRAM_HUB_RE);
  if (programHub) {
    const id = safeDecode(programHub[1]);
    return { scope: 'program', id, label: storeCtx?.id === id ? storeCtx.label : null };
  }

  if (pathname === '/qsheet/sheets' || pathname === '/qsheet/schedules') {
    const projectId = searchParams.get('project');
    if (projectId) return { scope: 'project', id: projectId, label: storeCtx?.id === projectId ? storeCtx.label : null };
    const programId = searchParams.get('program');
    if (programId) return { scope: 'program', id: programId, label: storeCtx?.id === programId ? storeCtx.label : null };
    return null;
  }

  const panelOwnerKey = matchOwnerKeyPanel(pathname);
  if (panelOwnerKey !== null) {
    return storeCtx && storeCtx.id === panelOwnerKey ? storeCtx : null;
  }

  if (EDITOR_RE.test(pathname) || SCHEDULE_DETAIL_RE.test(pathname) || DOCS_RE.test(pathname)) {
    return storeCtx ?? null;
  }

  return null;
}

function hubPathOf(ctx: ProductionNavContext): string {
  const id = encodeURIComponent(ctx.id);
  return ctx.scope === 'project' ? `/qsheet/projects/${id}` : `/qsheet/programs/${id}`;
}

function listPathOf(app: 'sheet' | 'schedule', ctx: ProductionNavContext): string {
  const listPath = app === 'sheet' ? '/qsheet/sheets' : '/qsheet/schedules';
  return `${listPath}?${ctx.scope}=${encodeURIComponent(ctx.id)}`;
}

function hubLabelOf(ctx: ProductionNavContext): string {
  return ctx.label || (ctx.scope === 'project' ? '案件ホーム' : '番組ホーム');
}

function buildResolvedSections(ctx: ProductionNavContext): ShellNavSection[] {
  const hubLabel = hubLabelOf(ctx);
  const items = [
    { label: 'トップ', to: '/qsheet/top', icon: LayoutGrid },
    { label: hubLabel, to: hubPathOf(ctx), icon: LayoutDashboard, end: true },
    { label: MINI_APP_BY_KEY.sheet.label, to: listPathOf('sheet', ctx), icon: LayoutDashboard },
    { label: MINI_APP_BY_KEY.schedule.label, to: listPathOf('schedule', ctx), icon: CalendarDays },
    { label: MINI_APP_BY_KEY.recording.label, to: panelPathOf('recording', ctx.id), icon: Settings2 },
    { label: MINI_APP_BY_KEY.streaming.label, to: panelPathOf('streaming', ctx.id), icon: Settings2 },
    { label: MINI_APP_BY_KEY.rental.label, to: panelPathOf('rental', ctx.id), icon: Package },
  ];
  // 計時・視聴者（liveops）は scope === 'project' のときだけ（liveops_programs.project_id
  // は projects テーブルのみを指すため。MiniAppTiles.tsx/MiniAppSwitcher.tsx と同じ制約）
  if (ctx.scope === 'project') {
    items.push({ label: MINI_APP_BY_KEY.liveops.label, to: panelPathOf('liveops', ctx.id), icon: Timer });
  }
  return [{ items }];
}

function buildDefaultSections(): ShellNavSection[] {
  return [{ items: [{ label: 'トップ', to: '/qsheet/top', icon: LayoutGrid }] }];
}

function buildResolvedMobileTabs(ctx: ProductionNavContext): ShellMobileTab[] {
  return [
    { label: hubLabelOf(ctx), to: hubPathOf(ctx), icon: LayoutGrid, end: true },
    { label: MINI_APP_BY_KEY.sheet.label, to: listPathOf('sheet', ctx), icon: LayoutDashboard },
    { label: MINI_APP_BY_KEY.schedule.label, to: listPathOf('schedule', ctx), icon: CalendarDays },
  ];
}

function buildDefaultMobileTabs(): ShellMobileTab[] {
  return [{ label: 'トップ', to: '/qsheet/top', icon: LayoutGrid }];
}

/**
 * サイドバー（PC）とスマホ下タブの中身を、いまの URL（と必要ならストアの値）から組み立てる。
 * `AppShell.tsx` から `buildQsheetNav(location.pathname, searchParams, useProductionNavContext())`
 * の形で呼ばれる契約（後続の作業がこの名前・シグネチャで読み込む）。
 */
export function buildQsheetNav(
  pathname: string,
  searchParams: URLSearchParams,
  storeCtx: ProductionNavContext | null,
): { sections: ShellNavSection[]; mobileTabs: ShellMobileTab[] } {
  const ctx = resolveContext(pathname, searchParams, storeCtx);
  if (ctx) {
    return { sections: buildResolvedSections(ctx), mobileTabs: buildResolvedMobileTabs(ctx) };
  }
  return { sections: buildDefaultSections(), mobileTabs: buildDefaultMobileTabs() };
}
