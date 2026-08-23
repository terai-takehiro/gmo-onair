// shared/src/client/appNav.ts — 左メニュー下部の「他のアプリ」
//
// **一覧そのものは持たない。** アプリ登録は `apps.ts` が唯一の正で、ここは
// 「現在のアプリを外して、権限で絞る」という**使い方**だけを提供する薄い層。
//
// 以前はここに `ALL_APPS` という2つ目の一覧があり、`AppSwitcher` の `ONAIR_APPS`・
// `AuthContext` の `BLOCK_APPS`・`client` の Sidebar と**4か所で食い違っていた**
// (「カレンダー」が「スタジオ予約」になっている、技術資料のアイコンが2種類、など)。
import { visibleApps, type AppDef } from './apps';

/**
 * ユーザーの権限に基づいてアクセス可能なアプリ一覧を返す。
 *
 * **凍結4アプリは既定で含む。** 旧シェル (v4 に載せ替える前の画面) から
 * Qシート等へ行けなくなるのを避けるため。v4 の共通シェルは
 * `visibleApps({ includeFrozen: false })` を直接呼ぶ。
 */
export function getAccessibleApps(
  currentAppKey: string,
  role?: string,
  permissions?: Record<string, string> | null,
): AppDef[] {
  return visibleApps({ current: currentAppKey, role, permissions, includeFrozen: true, includeHome: true });
}
