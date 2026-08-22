import { useAuth } from './useAuth';

// ⚠️ 権限区画の統合（'liveops' → 'qsheet'・migration 232・計時・視聴者のミニアプリ化
// フェーズ2）で、判定に使う区画名を 'qsheet' に変えた。GROUND_RULES で変えてよいと
// 明示されているのは「権限モジュール文字列」だけなので、それ以外（このファイル自体の
// 構成・呼び出し元）は変えていない。運用画面（ダッシュボード・タイマー管理・番組設定・
// 設定・セッション一覧）がまだ client-live 側にも残っている（並行稼働・2-X/2-Y分割の
// 前段）ため、この仕組み自体は今回のフェーズ2ではまだ不要にならない。
export function usePermissions() {
  const { loading, hasPermission } = useAuth();

  return {
    hasPermission,
    canView:           hasPermission('qsheet', 'reader'),
    canManage:         hasPermission('qsheet', 'manager'),
    permissionsLoading: loading,
  };
}
