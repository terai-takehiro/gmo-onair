/**
 * 上辺バー — 高さ **64px** (docs/design/v4/mockups/AppTopbar.dc.html)
 *
 * 左から: ロゴ ／ 区切り ／ **アプリ切替ボタン** ／ パンくず … 検索 ／ 通知 ／ 本人
 *
 * ── トップページだけ形が違う (モックの main 側 83〜99 行目) ──────
 *
 * **トップページ (`appKey === 'home'`) では、アプリ切替ボタンとパンくずを
 * 出さず、検索を左に置きます** (幅もモックは 400px と広い)。トップページは
 * **アプリの一覧そのもの**なので、切替ボタンは同じ物への2つ目の入口になり、
 * 「ホーム ／ …」というパンくずも行き先を持ちません。
 *
 * ── 補助3つ (マニュアル・履歴・MCP) は本人メニューの中 ──────────
 *
 * モックの上辺バーにアイコンは1つもありません (検索・通知・本人だけ)。
 * **消してはいけない機能**なので、**本人メニューの中に移しました** —
 * もともとスマホでは本人メニューに出していたものを、PC でも同じ場所にします
 * (置き場所が幅で変わると「さっきあった所に無い」が起きる)。
 *
 * ── 旧ヘッダーとの違い ──────────────────────────────────────
 *
 * 旧 `SharedHeader` はアプリ切替が**9個の点のアイコン**だけで、いまどのアプリに
 * いるのかがヘッダーから読み取れませんでした (アプリ名は左メニューの中にあった)。
 * v4 は**アプリ名の入ったボタン**そのものが切替になり、押すと一覧が開きます。
 *
 * ── 凍結4アプリは一覧に出さない ────────────────────────────
 *
 * `visibleApps()` の既定 (`includeFrozen: false`) をそのまま使います。URL は
 * 生きているので、ブックマーク・配布済みQR・OBS の出力URL は今までどおり動きます。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown, Menu, LogOut, ArrowLeftRight, HelpCircle, History, Plug, Home,
  PanelLeftClose, PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../utils';
import { APP_BY_KEY, visibleApps } from '../apps';
import type { ShellAccess, ShellUser } from './types';

const ROLE_LABEL: Record<string, string> = {
  system_admin: 'システム管理者',
  staff: 'スタッフ',
};

interface AppTopbarProps extends ShellAccess {
  appKey: string;
  appLabel: string;
  crumb?: ReactNode;
  searchSlot?: ReactNode;
  /** お知らせのベル（v4 設定 ⑦）。**部品は `client-v4/` 側**に置いてある —
   *  ここに置くと凍結4アプリの CSS が増えるため。ここは受け口だけ */
  notificationSlot?: ReactNode;
  user: ShellUser | null;
  onLogout: () => void;
  onSwitchUser?: () => void;
  /** スマホのハンバーガー。渡さないと出ない (左メニューが無い画面) */
  onToggleMenu?: () => void;
  /** いま PC の左メニューが隠れているか (ボタンの見た目・ラベルの切り替えに使う) */
  sideCollapsed?: boolean;
  /**
   * PC で左メニューを隠す／戻すボタン。渡さないと出ない (左メニューが無い画面)。
   * スマホの `onToggleMenu` (引き出し開閉) とは別物 — こちらは `lg:` 以上でだけ出る。
   */
  onToggleSideCollapse?: () => void;
  onOpenManual?: () => void;
  onOpenVersionHistory?: () => void;
  onOpenMcpInfo?: () => void;
}

/** 押すと閉じる系のドロップダウンで使う「外側を押したら閉じる」 */
function useDismiss(open: boolean, close: () => void, ...refs: Array<React.RefObject<HTMLElement>>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (refs.some((r) => r.current?.contains(e.target as Node))) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // `refs` は毎回新しい配列になるので依存に入れない (入れると毎描画で貼り直す)。
    // 中身の ref オブジェクト自体は変わらないので、これで正しく動く。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close]);
}

export function AppTopbar({
  appKey,
  appLabel,
  crumb,
  searchSlot,
  notificationSlot,
  user,
  onLogout,
  onSwitchUser,
  onToggleMenu,
  sideCollapsed,
  onToggleSideCollapse,
  onOpenManual,
  onOpenVersionHistory,
  onOpenMcpInfo,
  role,
  permissions,
}: AppTopbarProps) {
  const [swOpen, setSwOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const swRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  // 本人メニューは createPortal で document.body 直下に描くため、
  // ボタン側の userRef だけでは「メニューの中」を判定できない。
  // menuRef が無いと mousedown の時点で「外側」と誤判定され、続く click が
  // 発火する前にメニューが消えて項目が押せなくなる（実際に踏んだ不具合）。
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(swOpen, () => setSwOpen(false), swRef);
  useDismiss(userOpen, () => setUserOpen(false), userRef, menuRef);

  const app = APP_BY_KEY[appKey];
  const AppIcon = app?.icon;
  const apps = visibleApps({ current: appKey, role, permissions });
  const base = typeof import.meta !== 'undefined' ? (import.meta.env?.BASE_URL ?? '/') : '/';
  /** トップページ。アプリ切替とパンくずを出さず、検索を左に置く (モック) */
  const isHome = appKey === 'home';

  return (
    <header data-shell-topbar className="flex h-16 shrink-0 items-center gap-3.5 border-b border-border bg-card px-4 sm:px-6">
      {/* スマホの左メニュー呼び出し。タップ領域 44px を確保する */}
      {onToggleMenu && (
        <button
          type="button"
          onClick={onToggleMenu}
          className="min-h-tap min-w-tap -ml-2 flex items-center justify-center rounded-control text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="メニューを開く"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/*
        ── PC で左メニューを隠す／戻す ────────────────────────────
        上のハンバーガーは `lg:hidden`（スマホ専用）。こちらは真逆に
        `hidden lg:inline-flex` で PC でだけ出す（EditorPage の右パネル用
        トグルと同じ考え方）。隠した／出したは `AppShell.tsx` が
        `localStorage` に覚える（スマホの引き出し開閉とは別の状態）。
      */}
      {onToggleSideCollapse && (
        <button
          type="button"
          onClick={onToggleSideCollapse}
          aria-pressed={sideCollapsed}
          aria-label={sideCollapsed ? 'サイドバーを表示する' : 'サイドバーを隠す'}
          title={sideCollapsed ? 'サイドバーを表示する' : 'サイドバーを隠す'}
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted lg:inline-flex"
        >
          {sideCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      )}

      {/*
        ── ロゴ。**スマホではどの画面でもロゴを出す**（モック `v4-live`）─────

        スマホの上辺バーは **`☰` ／ ロゴ ／ 余白 ／ ベル ／ 本人** の1種類に
        しました（トップだけ形を変えない）。以前はここに**アプリ名のチップ**が
        入っていましたが、375px では `☰` ＋ チップ ＋ ベル ＋ 本人 で
        横がいっぱいになり、**上辺バーが「いまどこか」を言うためだけに
        1行まるごと**使っていました。

        **現在地はパンくずと左メニューが示します。** 上辺バーはロゴだけにして、
        本文の見出しに場所を譲ります。PC は今までどおり
        ロゴ ／ 区切り ／ アプリ切替 ／ パンくず です。

        ロゴは押すとトップへ戻る**リンク**なので、当たり判定を 44px 取ります
        （絵は 20px・スマホでは 18px。高さは `tokens-v4.css` が
         `[data-shell-logo]` を見て当てる — ここにクラス名を書くと
         凍結4アプリの CSS が増えるため）。
      */}
      <a href="/" className="min-h-tap flex shrink-0 items-center" title="ONAiR トップページへ">
        <img data-shell-logo src={`${base}logo-onair.svg`} alt="GMO ONAiR" className="h-5 w-auto" />
      </a>
      <span className="v4-wide-only h-[22px] w-px bg-border" aria-hidden="true" />

      {/*
        ── アプリ切替 (アプリ名がそのままボタン) ─────────────────────
        **トップページには出しません**（トップはアプリの一覧そのものなので、
        切替は同じ物への2つ目の入口になる）。

        **スマホにも出しません**（モック `v4-live`）。375px では
        `☰` ＋ チップ ＋ ベル ＋ 本人 で横がいっぱいになり、
        上辺バーが「いまどこか」を言うためだけに 1 行使っていました。
        いまいるアプリは**左メニュー**（`☰`）が開けば先頭に出ます。
        `v4-wide-only` は 1024px 以上でだけ出す指定で、実体は `tokens-v4.css`。
        ⚠️ ここで Tailwind の幅つきクラスを使わないこと（凍結4アプリの CSS が増えます）。
        **説明の文の中にも実物を書かないこと** — 3 度踏んでいます。
      */}
      {!isHome && (
      <div ref={swRef} className="v4-wide-only relative shrink-0">
        <button
          type="button"
          onClick={() => setSwOpen((v) => !v)}
          aria-expanded={swOpen}
          aria-haspopup="menu"
          className="text-list min-h-tap flex h-11 items-center gap-2.5 whitespace-nowrap rounded-control-lg border border-primary-border bg-primary-surface-weak px-3 text-primary hover:bg-primary-surface lg:h-10 lg:min-h-0"
        >
          {AppIcon && (
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-control bg-primary-surface">
              <AppIcon className="h-3.5 w-3.5" />
            </span>
          )}
          {appLabel}
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>

        {swOpen && (
          <div
            role="menu"
            className="absolute left-0 top-[46px] z-[60] w-[min(600px,calc(100vw-2rem))] rounded-card border border-border bg-card p-4 shadow-2xl shadow-black/10"
          >
            {/* 字間 .1em の小見出し (モック)。クラスの実体は `tokens-v4.css` */}
            <p className="v4-eyebrow mb-2">アプリを切り替え</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {apps.map((a) => (
                <a
                  key={a.key}
                  href={a.external ?? a.path}
                  {...(a.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  onClick={() => setSwOpen(false)}
                  className="flex items-center gap-2.5 rounded-control-lg border border-border bg-card p-2.5 hover:border-primary-border-strong"
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control-md"
                    style={{ backgroundColor: `${a.color}1a` }}
                  >
                    <a.icon className="h-4 w-4" style={{ color: a.color }} />
                  </span>
                  <span className="text-list truncate">{a.label}</span>
                </a>
              ))}
            </div>
            <a
              href="/"
              className="text-list mt-3 flex items-center gap-2.5 border-t border-border-faint pt-3 text-primary"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              トップページへ戻る
            </a>
          </div>
        )}
      </div>
      )}

      {!isHome && crumb && (
        <span className="text-sub v4-wide-only truncate text-muted-foreground">／ {crumb}</span>
      )}

      {/* **トップページの検索は左** (モック: ロゴ ／ 区切り ／ 検索)。
          ほかの画面は右に置く (モックの共通上辺バー) */}
      {isHome && searchSlot}

      <div className="flex-1" />

      {!isHome && searchSlot}

      {notificationSlot}

      {/* ── 本人 ─────────────────────────────────────────────── */}
      {user && (
        <div ref={userRef} className="relative shrink-0">
          {/*
            丸は 32px (モックの値) だが、**押せる範囲は 44px** にする
            (docs/design/v4/_rules.md「3. スマホ」= タップ対象は最低 44px)。
            見た目を大きくすると上辺バーの 64px に収まらないので、
            当たり判定だけ広げる形にしてある。
          */}
          <button
            type="button"
            onClick={() => setUserOpen((v) => !v)}
            aria-expanded={userOpen}
            aria-haspopup="menu"
            aria-label={`${user.name} のメニュー`}
            className="min-h-tap min-w-tap flex items-center justify-center gap-2.5"
          >
            <span className="text-list flex h-8 w-8 shrink-0 items-center justify-center rounded-chip bg-primary-surface text-primary">
              {user.name.trim().charAt(0) || '?'}
            </span>
            {/* **氏名を丸の横に出す** (モック)。丸だけだと、誰でログインしているのかが
                メニューを開かないと分からない。狭い画面では丸だけにする */}
            <span className="text-sub v4-wide-only whitespace-nowrap text-foreground">{user.name}</span>
          </button>
          {userOpen &&
            createPortal(
              <div
                ref={menuRef}
                role="menu"
                className="fixed right-4 top-14 z-[9999] w-60 rounded-card border border-border bg-card p-1.5 shadow-2xl shadow-black/10"
              >
                <div className="border-b border-border-faint px-3 pb-2 pt-1.5">
                  <p className="text-list truncate">{user.name}</p>
                  <p className="text-sub-sm truncate text-muted-foreground">
                    {ROLE_LABEL[user.role] ?? user.role}
                    {user.email ? ` ・ ${user.email}` : ''}
                  </p>
                </div>
                {/* 補助3つ。**幅にかかわらずここに置く** — 上辺バーのアイコン列を
                    やめたので、PC とスマホで置き場所が変わらない */}
                <div>
                  {onOpenManual && <MenuRow onClick={() => { setUserOpen(false); onOpenManual(); }} icon={HelpCircle}>利用マニュアル</MenuRow>}
                  {onOpenVersionHistory && <MenuRow onClick={() => { setUserOpen(false); onOpenVersionHistory(); }} icon={History}>バージョン履歴</MenuRow>}
                  {onOpenMcpInfo && <MenuRow onClick={() => { setUserOpen(false); onOpenMcpInfo(); }} icon={Plug}>AI につなぐ</MenuRow>}
                </div>
                {onSwitchUser && (
                  <MenuRow onClick={() => { setUserOpen(false); onSwitchUser(); }} icon={ArrowLeftRight}>ユーザー切替</MenuRow>
                )}
                <MenuRow onClick={() => { setUserOpen(false); onLogout(); }} icon={LogOut} danger>ログアウト</MenuRow>
              </div>,
              document.body,
            )}
        </div>
      )}
    </header>
  );
}

function MenuRow({
  onClick,
  icon: Icon,
  danger,
  children,
}: {
  onClick: () => void;
  icon: LucideIcon;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-list min-h-tap flex w-full items-center gap-2.5 rounded-control px-3 text-left hover:bg-muted',
        danger ? 'text-destructive' : 'text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </button>
  );
}
