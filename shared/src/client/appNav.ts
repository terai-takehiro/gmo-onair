// shared/src/client/appNav.ts — 全アプリ共通のナビゲーション定義
// Sidebarの「他のアプリ」セクションで使用。権限ベースでフィルタリング。

export interface AppNavItem {
  key: string;         // module key (permissions key)
  path: string;        // URL path
  label: string;       // 表示名
  icon: string;        // lucide icon name (Sidebarでマッピング)
  alwaysVisible?: boolean; // 権限不要で常に表示 (ホームなど)
}

/** 全ブロックアプリの定義 */
export const ALL_APPS: AppNavItem[] = [
  { key: 'home',        path: '/',             label: 'ホーム',          icon: 'Home',       alwaysVisible: true },
  { key: 'sales',       path: '/',             label: '案件管理',        icon: 'Briefcase' },
  { key: 'qsheet',      path: '/qsheet',       label: 'Qシート',        icon: 'FileText' },
  { key: 'equipment',   path: '/equipment',    label: '機材管理',        icon: 'Package' },
  { key: 'interactive',  path: '/interactive',   label: 'インタラクティブ', icon: 'Sparkles' },
  { key: 'techsheet',   path: '/techsheet',    label: '技術資料',        icon: 'Wrench' },
];

/**
 * ユーザーの権限に基づいてアクセス可能なアプリ一覧を返す
 * @param currentAppKey 現在のアプリ（除外する）
 * @param role ユーザーロール
 * @param permissions ユーザーのモジュール別権限
 */
export function getAccessibleApps(
  currentAppKey: string,
  role?: string,
  permissions?: Record<string, string>,
): AppNavItem[] {
  return ALL_APPS.filter(app => {
    // 現在のアプリは除外
    if (app.key === currentAppKey) return false;
    // 常に表示するアプリ
    if (app.alwaysVisible) return true;
    // system_admin は全て表示
    if (role === 'system_admin') return true;
    // 権限がないアプリは非表示
    if (!permissions) return false;
    return !!permissions[app.key];
  });
}
