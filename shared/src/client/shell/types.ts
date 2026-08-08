/**
 * 共通シェルの型 (S2)
 *
 * **メニューの中身はここで決めない。** 各アプリが今使っている項目・並び・ラベルを
 * そのまま渡します。v4 で入れ替えるのは**枠だけ**で、情報設計は Phase 2 以降に
 * アプリごとに相談して決めます (前回の刷新は枠と情報設計を同時に変えて、
 * 情報設計が却下されたときに枠まで一緒に捨てられた = ロールバックの原因)。
 */
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface ShellNavItem {
  label: string;
  /** 行き先。外部リンクは `external` を使う */
  to: string;
  icon?: LucideIcon;
  /** `NavLink` の `end`。トップ (`/`) のように前方一致で誤爆する項目に付ける */
  end?: boolean;
  /** 右端の小さい札 (件数・「新」など) */
  tag?: string;
  /** このモジュール権限を持つ人にだけ出す */
  module?: string;
  /** いずれかのモジュール権限を持つ人に出す (`module` より優先) */
  modules?: string[];
  /** system_admin にだけ出す */
  adminOnly?: boolean;
  /** 別タブで開く外部リンク */
  external?: string;
}

export interface ShellNavSection {
  /** 見出し。省略すると見出し無しの塊になる */
  title?: string;
  items: ShellNavItem[];
  /**
   * 折りたたむ塊にする（既定は閉じている）。
   *
   * **v4 で作り直す前の画面をここに畳みます。** メニューから消すと動いている画面に
   * 辿り着けなくなり、全部出すと v4 の並びが読めません。畳んでおいて、作り直した
   * ものから上の塊へ移していきます。
   *
   * **いま開いている画面がこの中にあるときは自動で開きます** —
   * 閉じたままだと、その画面にいるのにメニューのどこも光らず迷子になります。
   */
  collapsible?: boolean;
  /** 折りたたみの塊に添える一行の説明 */
  note?: string;
}

/** スマホ下端のタブ。**3つが基本** (docs/design/v4/_rules.md「3. スマホ」) */
export interface ShellMobileTab {
  label: string;
  icon: LucideIcon;
  /** 行き先 */
  to?: string;
  /** `menu` を渡すと左メニューを開く (行き先の代わり) */
  action?: 'menu';
  end?: boolean;
}

export interface ShellUser {
  name: string;
  role: string;
  email?: string;
}

export interface ShellAccess {
  role?: string;
  permissions?: Record<string, string> | null;
  /**
   * 権限の判定。省略すると `role === 'system_admin' || !!permissions[module]`。
   * アプリ側に独自の判定 (レベル付きなど) がある場合は渡すこと。
   */
  can?: (module: string) => boolean;
}

export interface ShellChrome {
  /** `apps.ts` のキー。アプリ切替のハイライトに使う */
  appKey: string;
  /** 上辺バーに出すアプリ名。省略すると登録から引く */
  appLabel?: string;
  /** アプリ名の右のパンくず (「／ ダッシュボード」) */
  crumb?: ReactNode;
  /** 上辺バーの検索スロット。案件管理のグローバル検索がここに入る */
  searchSlot?: ReactNode;
  /** お知らせのベル。部品は `client-v4/NotificationBell` にある（凍結アプリの CSS を増やさないため） */
  notificationSlot?: ReactNode;
  /** 左メニューの一番下に出す注記 */
  note?: ReactNode;
}
