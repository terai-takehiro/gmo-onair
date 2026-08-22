/**
 * 収録設定・配信設定を編集できる人か。
 *
 * ⚠️ **なぜ作ったか**（監査 2026-08-22）
 * この2画面には権限の分岐が1つも無かった。閲覧しかできない人（`qsheet` が reader）でも
 * 12台ぶん・配信先・WEB会議を**全部入力できてしまい**、最後に「保存に失敗しました」
 * とだけ出て、打った内容はすべて捨てられていた。何が悪いのか分からないので
 * 入力をやり直し、また捨てられる。
 *
 * サーバー側は `requirePermission('qsheet', 'editor')` で PUT と書き出しを守っている
 * （`server/src/contexts/qsheet/routes/device-settings.routes.ts`）ので、
 * 画面はそれと同じ線を引くだけでよい。
 */
import { useAuth } from '@/hooks/useAuth';

export function useCanEditDeviceSettings(): boolean {
  const { hasPermission } = useAuth();
  return hasPermission('qsheet', 'editor');
}
