// shared/src/client/states/NoPermissionPanel.tsx — 権限なし
//
// 決めごと (§2.4):
//   ・白紙にしない。何の権限が必要かを名前で書く
//   ・「権限を依頼する」で管理者への依頼を作れる
//   ・そもそもメニューには出さない (レールの権限フィルタが先に効く。
//     ここに来るのは直リンク・ブックマーク・共有URLを踏んだ場合)

import { Lock } from 'lucide-react';
import { cn } from '../utils';

/** モジュールキー → 画面に出す権限の名前 */
export const MODULE_LABELS: Record<string, string> = {
  sales: '案件管理',
  budget: 'お金 (財務管理)',
  studio: 'スタジオ予約',
  partner_schedule: 'パートナースケジュール',
  qsheet: 'Qシート',
  equipment: '機材管理',
  techsheet: '技術資料',
  liveops: '計時LIVE',
  awards: 'リアルタイムCG',
  dailyops: '日常業務',
  admin: 'システム管理',
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
  onRequestAccess,
  className,
}: NoPermissionPanelProps) {
  const names = modules.map((m) => MODULE_LABELS[m] ?? m);
  const needed = names.length > 1 ? `${names.join(' か ')} のいずれか` : names[0];

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
      <p className="text-[15px] font-bold text-foreground">
        {target ? `${target}を見る権限がありません` : 'この画面を見る権限がありません'}
      </p>
      <p className="text-[13px] leading-relaxed text-secondary-foreground">
        必要なのは <span className="font-bold text-foreground">{needed}</span> の
        「<span className="font-bold text-foreground">{LEVEL_LABELS[level]}</span>」です。
      </p>
      {onRequestAccess ? (
        <button
          type="button"
          onClick={onRequestAccess}
          className="mt-3 rounded-control bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground transition-colors hover:bg-primary-800"
        >
          権限を依頼する
        </button>
      ) : (
        <p className="mt-2 text-[13px] text-secondary-foreground">
          システム管理者に権限の追加を依頼してください。
        </p>
      )}
    </div>
  );
}
