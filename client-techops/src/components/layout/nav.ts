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
 * 2. 「収録・配信設定」（`/techops/device-settings`・`DeviceSettingsHome.tsx`）は
 *    簡易入口ごと廃止した（`App.tsx` にルートが無い。CLAUDE.md の「廃止」の定義通り、
 *    ファイルは残すがコードからの導線はすべて外した）
 * 3. 代わりに、いま案件（project）または番組（program・`qsheet_programs` のマニュアル）を
 *    **開いている**ときは、その案件/番組の子アプリ（進行台本／スケジュール表／収録設定／
 *    配信設定／レンタル機材検索）へのリンクを動的に出す。文脈が分からないとき
 *    （`/techops/top`・`/techops/home`・ログイン画面など）は「トップ」だけを出す
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
 * `/techops/recording/:ownerKey` 等は owner キー（案件idまたは番組idそのもの）は URL に
 * 出るが、project か program かは URL だけでは分からない。`/techops/editor/:id` 等は
 * URL に出るのが doc id であって project/program の id ではない。これらのページでは
 * `lib/productionNavContext.ts` のストア（`useProductionNavContext`）を補助的に見る
 * （`buildQsheetNav` の判定ロジック本体のコメント参照）。
 *
 * ── `to` が `/techops/...` で始まる理由 ──────────────────────────────
 *
 * このアプリはルーターの `basename` を持たず、Vite の `base: '/techops/'` だけで
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
 * （`/techops/top` 等）は「トップ」1本にした（ご判断）。`shell/MobileTabs.tsx` は
 * `tabs.length === 0` のときだけ `null` を返し、各タブは `flex-1` で幅を分け合う
 * 実装（3本前提の決め打ちレイアウトは無い）ので、1本・3本のどちらでも崩れない
 * ことを確認した上でこの形にしている。
 */
import { LayoutDashboard, LayoutGrid, CalendarDays, Settings2, Package, Timer, Type, Radio, BookOpenCheck, BookOpenText, MapPin, Cable, Users } from 'lucide-react';
import type { ShellMobileTab, ShellNavSection } from '@gmo-onair/shared/src/client/shell';
import { MINI_APP_BY_KEY, panelPathOf } from '@gmo-onair/shared/src/production/miniapps';
import type { ProductionNavContext } from '@/lib/productionNavContext';

const PROJECT_HUB_RE = /^\/techops\/projects\/([^/?#]+)\/?$/;
const PROGRAM_HUB_RE = /^\/techops\/programs\/([^/?#]+)\/?$/;
const RECORDING_RE = /^\/techops\/recording\/([^/?#]+)\/?$/;
const STREAMING_RE = /^\/techops\/streaming\/([^/?#]+)\/?$/;
const RENTAL_RE = /^\/techops\/rental\/([^/?#]+)(?:\/(?:list|mail\/[^/?#]+))?\/?$/;
// 計時・視聴者（liveops）。`/timers`・`/timers/:timerId/layout`・`/settings` の配下も含む
const LIVE_RE = /^\/techops\/live\/([^/?#]+)(?:\/(?:timers(?:\/[^/?#]+\/layout)?|settings))?\/?$/;
// テロップCG。①ハブ（`/graphics/:ownerKey`）・本番モード送出コンソール（`/live`）・
// ④設定（`/settings`・段Aで新設。旧・部品ライブラリ／演出SE管理／外部連携設定の
// 3独立画面を統合）・テンプレート管理（`/templates`・段6-2）・発注フォーム
// （`/request`・段5）。出力画面（`/techops/graphics/output/:projectId`）は
// シェル無しの独立ルートなのでここには来ない（`App.tsx` の
// 「Full-screen pages without AppShell」側）。旧 `/parts`・`/sounds`・
// `/interactive-link` は `App.tsx` の `Redirect*` へ転送するだけの URL になり
// 画面ではなくなったので、この正規表現の対象からも外した
const GRAPHICS_RE = /^\/techops\/graphics\/([^/?#]+)(?:\/(?:live|settings|templates|request))?\/?$/;
const EDITOR_RE = /^\/techops\/editor\/[^/?#]+\/?$/;
const SCHEDULE_DETAIL_RE = /^\/techops\/schedules\/[^/?#]+\/?$/;
const MANUAL_DETAIL_RE = /^\/techops\/manuals\/[^/?#]+\/?$/;
const DOCS_RE = /^\/techops\/docs\/[^/?#]+\/?$/;
// 会場図面1件（②編集・スマホは閲覧）。仕上がり（`/preview`）はここに含めない
// （運営マニュアルの仕上がりも案件文脈の解決対象に入れていない前例と同じ）
const VENUE_DETAIL_RE = /^\/techops\/venue-layouts\/[^/?#]+\/?$/;
// 技術資料1件（②映像パッチ・③技術スタッフ。同じ資料のタブ切替なので1本で受ける）。
// 書き出し（`/print`）はここに含めない（会場図面の仕上がりと同じ扱い・tech-docs.md §12 #5）
const TECH_DOC_DETAIL_RE = /^\/techops\/tech-docs\/[^/?#]+(?:\/staff)?\/?$/;

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** owner キーが URL に出る3つのパネル画面（収録設定・配信設定・レンタル機材検索）から ownerKey を取り出す */
function matchOwnerKeyPanel(pathname: string): string | null {
  const m = pathname.match(RECORDING_RE) ?? pathname.match(STREAMING_RE) ?? pathname.match(RENTAL_RE)
    ?? pathname.match(LIVE_RE) ?? pathname.match(GRAPHICS_RE);
  return m ? safeDecode(m[1]) : null;
}

/**
 * pathname と searchParams（必要ならストアの値）から「いま見ている案件/番組」を判定する。
 * 判定ロジック本体（優先順位はコード上の順序どおり）:
 *
 * 1. `/techops/projects/<id>` → `{scope:'project', id}`
 * 2. `/techops/programs/<id>` → `{scope:'program', id}`
 * 3. `/techops/sheets`・`/techops/schedules`・`/techops/manuals`（絞り込み一覧）で
 *    `?project=`/`?program=` があれば、その scope/id
 * 4. `/techops/recording|streaming|rental|live/<ownerKey>`（配下の `/list`・`/mail/:company`・
 *    `/timers`・`/settings` 含む）:
 *    ストアの値があり、かつ `id` が一致すればそれを使う。一致しなければ「未解決」
 * 5. `/techops/editor/<id>`・`/techops/schedules/<id>`（個別）・`/techops/manuals/<id>`（個別）・
 *    `/techops/docs/<id>`:
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

  if (pathname === '/techops/sheets' || pathname === '/techops/schedules' || pathname === '/techops/manuals' || pathname === '/techops/venue-layouts' || pathname === '/techops/tech-docs') {
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

  if (EDITOR_RE.test(pathname) || SCHEDULE_DETAIL_RE.test(pathname) || MANUAL_DETAIL_RE.test(pathname) || DOCS_RE.test(pathname) || VENUE_DETAIL_RE.test(pathname) || TECH_DOC_DETAIL_RE.test(pathname)) {
    return storeCtx ?? null;
  }

  return null;
}

function hubPathOf(ctx: ProductionNavContext): string {
  const id = encodeURIComponent(ctx.id);
  return ctx.scope === 'project' ? `/techops/projects/${id}` : `/techops/programs/${id}`;
}

function listPathOf(app: 'sheet' | 'schedule' | 'manual' | 'venue' | 'tech', ctx: ProductionNavContext): string {
  const listPath = app === 'sheet' ? '/techops/sheets'
    : app === 'schedule' ? '/techops/schedules'
    : app === 'manual' ? '/techops/manuals'
    : app === 'venue' ? '/techops/venue-layouts'
    : '/techops/tech-docs';
  return `${listPath}?${ctx.scope}=${encodeURIComponent(ctx.id)}`;
}

function hubLabelOf(ctx: ProductionNavContext): string {
  return ctx.label || (ctx.scope === 'project' ? '案件ホーム' : '番組ホーム');
}

/**
 * 管理系メニュー（AIナレッジの承認・スケジュール表の工程テンプレート）— 権限で
 * 出し分ける2項目を **1つの「管理」節にまとめる**（2026-09-06・階層化）。
 *
 * それまでは各項目が見出し無しの節として個別に積まれ、上のミニアプリ群と
 * 見分けがつかないフラットな1本の並びになっていた（「どこからが管理メニューか」
 * が読めない、というご指摘）。
 *
 * - **AIナレッジの承認**（`/techops/ai-knowledge`）は qsheet **manager 以上にだけ**出す。
 *   共通シェルの `ShellNavItem.module` は「そのモジュール権限を持つか」しか見ない
 *   （レベル manager の判定ができない。`AppSideMenu.tsx` の `visibleSections`）ので、
 *   呼び出し側（`AppShell.tsx`）が `hasPermission('qsheet', 'manager')` を判定して
 *   ここへ渡す形にした。reader も直URLでは読める（読み専）が、承認業務の入口である
 *   このメニューは承認できる人にだけ見せる
 * - **スケジュール表の工程テンプレート**（`/techops/settings/schedule-templates`）は
 *   **system_admin にだけ**出す（14-schedule-v2-plan.md §3 A7）。編集系 REST が
 *   `role === 'system_admin'` を直接見ている（`schedule-templates.routes.ts` の
 *   `requireSystemAdmin`）ので、ここも `qsheet` の権限レベルではなく role で判定する。
 *   これまで導線がまったく無く、URL を直打ちしないと開けなかった
 *   （監査 2026-09-06・14-schedule-v2-plan.md §8 の穴 #10）
 *
 * どちらも案件/番組の文脈に依存しない全体設定なので、文脈あり・なしのどちらの並びにも
 * 最後に足す（スマホ下タブには足さない — 3本ルールの枠を日常業務でない管理メニューで
 * 潰さないため。スマホでは左メニューから開ける）。
 */
function adminSection(opts?: { canManageAiKnowledge?: boolean; canManageTechMasters?: boolean; isSystemAdmin?: boolean }): ShellNavSection | null {
  const items = [];
  if (opts?.canManageAiKnowledge) items.push({ label: 'AIナレッジの承認', to: '/techops/ai-knowledge', icon: BookOpenCheck });
  // 技術資料の台帳2つ（パッチ盤・技術人員）。どちらも案件に紐づかない組織共通のもので、
  // 編集できるのは manager だけ（tech-docs.md §5-4）。reader も直URLでは読めるが、
  // 転記・台帳の手入れが仕事であるこのメニューは manager にだけ見せる
  if (opts?.canManageTechMasters) {
    items.push({ label: 'パッチ盤', to: '/techops/tech-panels', icon: Cable });
    items.push({ label: '技術人員', to: '/techops/tech-persons', icon: Users });
  }
  if (opts?.isSystemAdmin) {
    items.push({ label: 'スケジュール表の工程テンプレート', to: '/techops/settings/schedule-templates', icon: CalendarDays });
  }
  return items.length > 0 ? { title: '管理', items } : null;
}

/**
 * テロップCG のメニュー項目。**普段は「テロップCG」1本**（`ShellNavItem` に
 * インデント付きの子項目という概念が無いため、他のミニアプリと同じ「1項目→ハブへ」の
 * 形に揃えている）。**いまテロップCGの中を見ているとき（`inGraphics`）だけ**、
 * 同じ木の深さのまま①一覧・本番モード・④設定の3本に展開する
 * （再設計 §11 段A「左メニューのサブ項目」・アイコンは `GraphicsHubPage.tsx` の
 * ヘッダーボタンと揃えた）。
 */
function graphicsNavItems(ctx: ProductionNavContext, inGraphics: boolean) {
  const hub = panelPathOf('graphics', ctx.id);
  if (!inGraphics) {
    return [{ label: MINI_APP_BY_KEY.graphics.label, to: hub, icon: Type }];
  }
  return [
    { label: 'テロップ一覧', to: hub, icon: Type, end: true },
    { label: '本番モード', to: `${hub}/live`, icon: Radio },
    { label: 'テロップCG設定', to: `${hub}/settings`, icon: Settings2 },
  ];
}

/**
 * 「いまの案件/番組」の並びを **2つの節に分ける**（2026-09-06・階層化。ご指摘対応）。
 *
 * それまでは「トップ」「案件ホーム」とミニアプリ6〜7項目が見出し無しの1本の
 * リストで、しかも `hubLabel`（案件名・番組名。長いと省略記号で切れる）が
 * トップ直下に紛れて「どこからがこの案件の中身か」が読み取りにくかった。
 *
 * - 見出し無しの節: 「トップ」＋「（案件/番組の）ホーム」——アプリ全体の起点
 * - 「ミニアプリ」節: 進行台本〜計時・視聴者——いまの案件/番組に属する子アプリ群
 *
 * `hubLabel` は案件名・番組名そのものなので**省略しない**（`wrap: true`。
 * `AppSideMenu.tsx` の `ShellNavItem.wrap` 参照）。
 *
 * テロップCG の項目だけは `graphicsNavItems(ctx, inGraphics)` に展開を任せる——
 * いまテロップCGの中を見ているときだけ①一覧・本番モード・④設定の3本になる
 * （上の `graphicsNavItems` のコメント参照）。
 */
function buildResolvedSections(ctx: ProductionNavContext, inGraphics: boolean): ShellNavSection[] {
  const hubLabel = hubLabelOf(ctx);
  const topItems = [
    { label: 'トップ', to: '/techops/top', icon: LayoutGrid },
    { label: hubLabel, to: hubPathOf(ctx), icon: LayoutDashboard, end: true, wrap: true },
  ];
  const miniAppItems = [
    { label: MINI_APP_BY_KEY.sheet.label, to: listPathOf('sheet', ctx), icon: LayoutDashboard },
    { label: MINI_APP_BY_KEY.schedule.label, to: listPathOf('schedule', ctx), icon: CalendarDays },
    { label: MINI_APP_BY_KEY.manual.label, to: listPathOf('manual', ctx), icon: BookOpenText },
    { label: MINI_APP_BY_KEY.venue.label, to: listPathOf('venue', ctx), icon: MapPin },
    { label: MINI_APP_BY_KEY.tech.label, to: listPathOf('tech', ctx), icon: Cable },
    { label: MINI_APP_BY_KEY.recording.label, to: panelPathOf('recording', ctx.id), icon: Settings2 },
    { label: MINI_APP_BY_KEY.streaming.label, to: panelPathOf('streaming', ctx.id), icon: Settings2 },
    { label: MINI_APP_BY_KEY.rental.label, to: panelPathOf('rental', ctx.id), icon: Package },
    // テロップCG は project / program のどちらの scope でも開ける
    // （resolve が両方の owner を受ける — 収録設定・配信設定と同じ形）
    ...graphicsNavItems(ctx, inGraphics),
  ];
  // 計時・視聴者（liveops）は scope === 'project' のときだけ（liveops_programs.project_id
  // は projects テーブルのみを指すため。MiniAppTiles.tsx/MiniAppSwitcher.tsx と同じ制約）
  if (ctx.scope === 'project') {
    miniAppItems.push({ label: MINI_APP_BY_KEY.liveops.label, to: panelPathOf('liveops', ctx.id), icon: Timer });
  }
  return [{ items: topItems }, { title: 'ミニアプリ', items: miniAppItems }];
}

function buildDefaultSections(): ShellNavSection[] {
  return [{ items: [{ label: 'トップ', to: '/techops/top', icon: LayoutGrid }] }];
}

function buildResolvedMobileTabs(ctx: ProductionNavContext): ShellMobileTab[] {
  return [
    { label: hubLabelOf(ctx), to: hubPathOf(ctx), icon: LayoutGrid, end: true },
    { label: MINI_APP_BY_KEY.sheet.label, to: listPathOf('sheet', ctx), icon: LayoutDashboard },
    { label: MINI_APP_BY_KEY.schedule.label, to: listPathOf('schedule', ctx), icon: CalendarDays },
  ];
}

function buildDefaultMobileTabs(): ShellMobileTab[] {
  return [{ label: 'トップ', to: '/techops/top', icon: LayoutGrid }];
}

/**
 * サイドバー（PC）とスマホ下タブの中身を、いまの URL（と必要ならストアの値）から組み立てる。
 * `AppShell.tsx` から `buildQsheetNav(location.pathname, searchParams, useProductionNavContext())`
 * の形で呼ばれる契約（後続の作業がこの名前・シグネチャで読み込む。第4引数は
 * 後から足した省略可能な追加オプションで、既存の呼び方はそのまま動く）。
 */
export function buildQsheetNav(
  pathname: string,
  searchParams: URLSearchParams,
  storeCtx: ProductionNavContext | null,
  opts?: { canManageAiKnowledge?: boolean; canManageTechMasters?: boolean; isSystemAdmin?: boolean },
): { sections: ShellNavSection[]; mobileTabs: ShellMobileTab[] } {
  const ctx = resolveContext(pathname, searchParams, storeCtx);
  const inGraphics = !!ctx && GRAPHICS_RE.test(pathname);
  const sections = ctx ? buildResolvedSections(ctx, inGraphics) : buildDefaultSections();
  // 権限で出し分ける2項目を「管理」節にまとめて足す（adminSection のコメント参照）
  const admin = adminSection(opts);
  if (admin) sections.push(admin);
  const mobileTabs = ctx ? buildResolvedMobileTabs(ctx) : buildDefaultMobileTabs();
  return { sections, mobileTabs };
}
