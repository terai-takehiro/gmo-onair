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
import { PrimaryActionSlotContext } from './primaryAction';
import { NoticeBar } from '../ui/notice';
import { ConfirmHost } from '../ui/confirm';
import ManualModal from '../manual/ManualModal';
import VersionHistoryModal from '../versionHistory/VersionHistoryModal';
import McpInfoModal from '../mcpInfo/McpInfoModal';
import type { ManualContent } from '../manual/types';
import { APP_BY_KEY } from '../apps';
import { AppTopbar } from './AppTopbar';
import { AppSideMenu } from './AppSideMenu';
import { MobileTabs } from './MobileTabs';
import type { ShellAccess, ShellChrome, ShellMobileTab, ShellNavSection, ShellUser } from './types';

export interface AppShellProps extends ShellChrome, ShellAccess {
  /** 左メニューの中身。**空を渡すと左メニューを出さない** (トップページなど) */
  sections?: ShellNavSection[];
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
  const { pathname } = useLocation();
  const [manualOpen, setManualOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  // 差し込み口は「ref」ではなく state で受ける。ref のままだと最初の描画で
  // まだ DOM が無く、子 (PageHeader) が描き直されないので何も出ない
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null);

  const label = appLabel ?? APP_BY_KEY[appKey]?.label ?? 'ONAiR';
  const hasMenu = sections.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <AppTopbar
        appKey={appKey}
        appLabel={label}
        crumb={crumb}
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
            {/* **鍵は「画面」までで、クエリは含めない。** `?tab=` や `?page=`
                まで鍵にすると、絞り込みを押すたびに画面ぜんぶが動いて酔う */}
            <div key={pathname} className="v4-screen-in">
              {children}
            </div>
          </PrimaryActionSlotContext.Provider>
        </main>
      </div>

      {/* スマホの主アクションの差し込み口。中身が無い画面では罫線ごと消える */}
      <div
        ref={setActionSlot}
        className="shrink-0 border-t border-border bg-card px-4 py-3 empty:hidden sm:hidden"
      />

      <MobileTabs tabs={mobileTabs} onOpenMenu={() => setMenuOpen(true)} />

      {manualContent && <ManualModal open={manualOpen} onOpenChange={setManualOpen} content={manualContent} />}
      <VersionHistoryModal open={versionOpen} onOpenChange={setVersionOpen} productLabel="GMO ONAiR" />
      <McpInfoModal open={mcpOpen} onOpenChange={setMcpOpen} />
      <ConfirmHost />
    </div>
  );
}
