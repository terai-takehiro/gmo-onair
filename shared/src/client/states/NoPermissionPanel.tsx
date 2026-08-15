// shared/src/client/states/NoPermissionPanel.tsx — 権限なし
//
// 決めごと (§2.4):
//   ・白紙にしない。何の権限が必要かを名前で書く
//   ・「権限を依頼する」で管理者への依頼を作れる
//   ・そもそもメニューには出さない (レールの権限フィルタが先に効く。
//     ここに来るのは直リンク・ブックマーク・共有URLを踏んだ場合)

import { Lock } from 'lucide-react';
import { cn } from '../utils';
import { APP_LABELS } from '../apps';

/**
 * モジュールキー → 画面に出す権限の名前。
 * **名前は `apps.ts` から引く** (S1)。ここに書き写すと5か所目の一覧になる。
 */
export const MODULE_LABELS: Record<string, string> = {
  ...APP_LABELS,
  // アプリではないが権限モジュールとして存在するもの
  partner_schedule: 'パートナースケジュール',
};

/** アクセスレベルの表示名 (内部値 reader/editor/manager を人の言葉に) */
export const LEVEL_LABELS: Record<string, string> = {
  reader: '見るだけ',
  editor: '書ける',
  manager: '任せる',
};

export interface NoPermissionPanelProps {
  /** 必要なモジュール (複数ならいずれか1つで足りる) */
  modules: string[];
  /** 必要なアクセスレベル */
  level?: 'reader' | 'editor' | 'manager';
  /**
   * **全部要る**とき true（既定は「いずれか1つ」）。
   *
   * ⚠️ 既定の文面は「A か B のいずれか」です。**両方要る画面でそのまま出すと、
   * 片方だけ足してもらって、また同じ所で止まります**（依頼した人にも
   * 足した管理者にも理由が分かりません）。
   */
  requireAll?: boolean;
  /** 何をしようとしたか。例: 「売上の一覧」 */
  target?: string;
  /** 権限を依頼する (管理者への依頼を作る)。渡さないときは連絡先の案内だけ出す */
  onRequestAccess?: () => void;
  className?: string;
}

export function NoPermissionPanel({
  modules,
  level = 'reader',
  target,
  requireAll = false,
  onRequestAccess,
  className,
}: NoPermissionPanelProps) {
  const names = modules.map((m) => MODULE_LABELS[m] ?? m);
  const needed = names.length > 1
    ? (requireAll ? `${names.join(' と ')} の両方` : `${names.join(' か ')} のいずれか`)
    : names[0];

  return (
    <div
      role="status"
      className={cn(
        'mx-auto flex max-w-xl flex-col items-center gap-2 rounded-lg border border-border bg-card px-6 py-12 text-center',
        className,
      )}
    >
      <div className="text-secondary-foreground" aria-hidden="true">
        <Lock className="h-7 w-7" />
      </div>
      <p className="text-cardtitle text-foreground">
        {target ? `${target}を見る権限がありません` : 'この画面を見る権限がありません'}
      </p>
      <p className="text-sub text-secondary-foreground">
        必要なのは <span className="font-bold text-foreground">{needed}</span> の
        「<span className="font-bold text-foreground">{LEVEL_LABELS[level]}</span>」です。
      </p>
      {onRequestAccess ? (
        <button
          type="button"
          onClick={onRequestAccess}
          className="mt-3 rounded-control bg-primary px-4 py-2 text-list text-primary-foreground transition-colors hover:bg-primary-800"
        >
          権限を依頼する
        </button>
      ) : (
        <p className="mt-2 text-sub text-secondary-foreground">
          システム管理者に権限の追加を依頼してください。
        </p>
      )}
    </div>
  );
}
