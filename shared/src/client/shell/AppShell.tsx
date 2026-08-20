/**
 * 共通シェル (S2) — 上辺バー 64px ＋ 左メニュー 248px ＋ スマホ下タブ
 *
 * ── 前回の刷新が捨てられた理由と、今回の決めごと ──────────────
 *
 * 前回は「**枠の作り替え**」と「**情報設計の変更**」を同じ作業でやりました。
 * 情報設計 (左に7項目の共通レール) が「前のUIのほうが分かりやすい」と却下された
 * とき、**一緒に枠まで捨てられた**のがロールバックの正体です。
 *
 * → **今回は枠だけ入れ替えます。** メニューの項目・並び・ラベルは各アプリが
 *   いま使っているものをそのまま渡します。情報設計の変更は Phase 2 以降に
 *   アプリごとに相談します。
 *
 * ── 高さの持ち方 (base.css との約束) ────────────────────────
 *
 * `html`/`body`/`#root` は `shared/src/client/base.css` が `height:100%` ＋
 * `overflow:hidden` にしています。**シェルの根は `h-full`** (`h-screen` = 100vh に
 * すると iOS で URL バーぶん高くなり、下端が切れる)。スクロールするのは
 * `<main>` の中だけです。
 *
 * ── お知らせ帯と確認ダイアログ ──────────────────────────────
 *
 * `<NoticeBar />` と `<ConfirmHost />` はここが持ちます。**アプリ側で置かない**
 * (置き忘れると `confirmAction` が false を返して削除ボタンが黙って何もしない)。
 * `scripts/check-shared-wiring.mjs` が数を数えています。
 *
 * ── スマホの主アクション ────────────────────────────────────
 *
 * 下タブのすぐ上に**差し込み口を1つ**持ちます (`primaryAction.ts`)。
 * `<PageHeader primaryAction={…}>` がここへ描くので、**画面側は
 * `fixed bottom-0` を書きません**。中身が無い画面では消えます。
 *
 * ── 画面が切り替わるときの動き ──────────────────────────────
 *
 * モックは画面ぜんぶに `screenIn`（10px 下から・0.995 倍から 0.34 秒）を
 * 掛けています。**ここで1回だけ掛けます** — 画面ごとに書くと、
 * 掛け忘れた画面だけカクッと出ることになります。
 * URL を鍵にしているので、**同じ画面の中で状態が変わっただけでは再生しません**
 * （タブを押すたびに全体が動くと、目が追いつかず酔います）。
 * 動きを減らす設定の人には `tokens-v4.css` の側で止めてあります。
 */
import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsMobile } from '../../client-v4/mobile';
import { PrimaryActionSlotContext } from './primaryAction';
import { SideMenuTopSlotContext } from './sideMenuSlot';
import { NoticeBar } from '../ui/notice';
import { ConfirmHost } from '../ui/confirm';
import ManualModal from '../manual/ManualModal';
import VersionHistoryModal from '../versionHistory/VersionHistoryModal';
import McpInfoModal from '../mcpInfo/McpInfoModal';
import type { ManualContent } from '../manual/types';
import { APP_BY_KEY } from '../apps';
import { AppTopbar } from './AppTopbar';
import { AppSideMenu, currentTo, visibleSections } from './AppSideMenu';
import { MobileTabs } from './MobileTabs';
import type { ShellAccess, ShellChrome, ShellMobileTab, ShellNavSection, ShellUser } from './types';

export interface AppShellProps extends ShellChrome, ShellAccess {
  /** 左メニューの中身。**空を渡すと左メニューを出さない** (トップページなど) */
  sections?: ShellNavSection[];
  /**
   * **スマホのときだけ左メニューから落とすルート**（ご判断）。
   * 出どころは各アプリの `pcOnlyScreens.ts` の `hidden: true`。
   * データを入れる道具は案件の仕事に出てこないので、**選べること自体が邪魔**。
   * **ルートは消しません**（共有された URL は今までどおり案内が出る）。
   */
  mobileHiddenPaths?: string[];
  user: ShellUser | null;
  onLogout: () => void;
  onSwitchUser?: () => void;
  /** 渡すと上辺バーに利用マニュアルのボタンが出る */
  manualContent?: ManualContent;
  /** スマホ下端のタブ。省略すると出さない */
  mobileTabs?: ShellMobileTab[];
  children: ReactNode;
}

export function AppShell({
  appKey,
  appLabel,
  crumb,
  searchSlot,
  notificationSlot,
  note,
  mobileHiddenPaths,
  sections = [],
  user,
  onLogout,
  onSwitchUser,
  manualContent,
  mobileTabs = [],
  role,
  permissions,
  can,
  children,
}: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname, search } = useLocation();
  const isMobile = useIsMobile();
  const [manualOpen, setManualOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  // 差し込み口は「ref」ではなく state で受ける。ref のままだと最初の描画で
  // まだ DOM が無く、子 (PageHeader) が描き直されないので何も出ない
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null);
  // 左メニュー上の差し込み口も同じ理由で state（`sideMenuSlot.ts`）
  const [sideMenuTopSlot, setSideMenuTopSlot] = useState<HTMLDivElement | null>(null);

  const label = appLabel ?? APP_BY_KEY[appKey]?.label ?? 'ONAiR';
  const hasMenu = sections.length > 0;

  /**
   * **パンくずは左メニューの現在地から作る**（モックの上辺バーは
   * 「案件管理 ／ ダッシュボード」）。
   *
   * 画面側で `crumb` を書かせると**書いた画面にしか出ません** — 73 画面ぶん
   * 書き写すことになり、書き忘れた画面だけパンくずが消えます。左メニューが
   * どの項目を光らせているか (`currentTo`) は既に決まっているので、
   * **同じ答えを上辺バーにも出す**だけにします（2か所で別々に判定すると、
   * メニューは「案件一覧」が光っているのにパンくずは「ダッシュボード」、
   * という食い違いが起きます）。
   *
   * 明示的に渡された `crumb` はそのまま優先します（メニューに項目を持たない
   * 画面で名前を出したいとき用）。
   */
  /*
   * ⚠️ **左メニューとまったく同じ並びから引く**（レビューでの指摘 #82）。
   *
   * 前の版は**絞る前の `sections`** から名前を探していたので、
   * ①**権限で消した項目の名前が上辺バーに出る**（メニューには無いのに）
   * ②現在地の判定がメニューと2か所で別々になり、**メニューは何も光っていないのに
   *   パンくずだけ名前を出す**、が起きます。
   * ③`?view=lend` のような**絞り込みつきの行き先**は、道が同じ別の項目
   *   （「機材台帳」）の名前になっていました — 押した先と違う名前が出ます。
   */
  const menuSections = hasMenu
    ? visibleSections(sections, { role, permissions, can, mobile: isMobile, mobileHiddenPaths })
    : [];
  const activeTo = hasMenu ? currentTo(pathname, menuSections, search) : null;
  const crumbText =
    crumb ??
    (activeTo ? menuSections.flatMap((s) => s.items).find((i) => i.to === activeTo)?.label : undefined);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <AppTopbar
        appKey={appKey}
        appLabel={label}
        crumb={crumbText}
        searchSlot={searchSlot}
        notificationSlot={notificationSlot}
        user={user}
        onLogout={onLogout}
        onSwitchUser={onSwitchUser}
        onToggleMenu={hasMenu ? () => setMenuOpen(true) : undefined}
        onOpenManual={manualContent ? () => setManualOpen(true) : undefined}
        onOpenVersionHistory={() => setVersionOpen(true)}
        onOpenMcpInfo={() => setMcpOpen(true)}
        role={role}
        permissions={permissions}
      />

      <div className="flex min-h-0 flex-1">
        {hasMenu && (
          <AppSideMenu
            sections={sections}
            note={note}
            mobileHiddenPaths={mobileHiddenPaths}
            topSlotRef={setSideMenuTopSlot}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            role={role}
            permissions={permissions}
            can={can}
          />
        )}
        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* お知らせ帯はスクロール領域の中の上端 (sticky)。ヘッダーの外に出すと
              下にスクロールしているときに気づけない */}
          <NoticeBar />
          <PrimaryActionSlotContext.Provider value={actionSlot}>
            <SideMenuTopSlotContext.Provider value={sideMenuTopSlot}>
              {/* **鍵は「画面」までで、クエリは含めない。** `?tab=` や `?page=`
                  まで鍵にすると、絞り込みを押すたびに画面ぜんぶが動いて酔う */}
              <div key={pathname} className="v4-screen-in">
                {children}
              </div>
            </SideMenuTopSlotContext.Provider>
          </PrimaryActionSlotContext.Provider>
        </main>
      </div>

      {/*
        スマホの主アクションの差し込み口。中身が無い画面では罫線ごと消える。

        ⚠️ **下タブが無いときは自分で safe-area を足す**（レビューでの指摘 #40）。
        ホームバーの逃げ（`env(safe-area-inset-bottom)`）を持っているのは
        すぐ下の `MobileTabs` で、**タブが 0 本のときは `null` を返します**。
        そのとき**いちばん下に来るのはこの差し込み口**なので、
        主アクションが**ホームバーに重なります**（iPhone で押せない）。
        いまは3アプリとも下タブを3本持っているので起きませんが、
        **タブを持たないアプリを載せた日に、誰も気づかないまま押せなくなります**。
      */}
      <div
        ref={setActionSlot}
        className="shrink-0 border-t border-border bg-card px-4 py-3 empty:hidden sm:hidden"
        style={mobileTabs.length === 0
          ? { paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }
          : undefined}
      />

      <MobileTabs tabs={mobileTabs} onOpenMenu={() => setMenuOpen(true)} />

      {manualContent && <ManualModal open={manualOpen} onOpenChange={setManualOpen} content={manualContent} />}
      <VersionHistoryModal open={versionOpen} onOpenChange={setVersionOpen} productLabel="GMO ONAiR" />
      <McpInfoModal open={mcpOpen} onOpenChange={setMcpOpen} />
      <ConfirmHost />
    </div>
  );
}
