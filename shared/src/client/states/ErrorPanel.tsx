// shared/src/client/states/ErrorPanel.tsx — エラー
//
// 決めごと (§2.4 / §2.5):
//   ・「入力した内容は残っています」を明言する (消えたのか分からないのが一番困る)
//   ・原因1文 + 次の一手1文
//   ・HTTPコード・タイムアウト・スタックは画面に出さない (console と details に留める)

import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '../utils';

/** 画面に出してよい原因文。技術用語を混ぜない */
export interface HumanCause {
  /** 原因 (1文) */
  cause: string;
  /** 次の一手 (1文) */
  next: string;
}

interface ErrorLike {
  message?: string;
  response?: { status?: number };
}

/**
 * 例外を画面に出せる日本語1文に変換する。
 * 技術用語 (500 / timeout / Network Error) を画面テキストに漏らさないための関門。
 */
export function humanizeError(err: unknown): HumanCause {
  const e = (err ?? {}) as ErrorLike;
  const status = e.response?.status;
  const raw = typeof e.message === 'string' ? e.message : '';

  if (status === 403) {
    return { cause: 'この操作をする権限がありません。', next: '必要な権限を管理者に依頼してください。' };
  }
  if (status === 404) {
    return { cause: '開こうとしたものが見つかりませんでした。', next: '削除された可能性があります。一覧から選び直してください。' };
  }
  if (status === 409) {
    return {
      cause: 'ほかの人が先に保存したため、この内容では保存できません。',
      next: '最新を読み込んでから、もう一度保存してください。',
    };
  }
  if (status === 413) {
    return { cause: 'ファイルが大きすぎます。', next: 'サイズを小さくしてから、もう一度お試しください。' };
  }
  if (status && status >= 500) {
    return { cause: 'サーバー側で処理が止まりました。', next: '少し待ってから、もう一度お試しください。' };
  }
  if (/network|fetch|ECONN|ETIMEDOUT|timeout/i.test(raw) || status === undefined) {
    return { cause: '通信ができませんでした。', next: 'ネットワークを確かめて、もう一度お試しください。' };
  }
  return { cause: '処理が完了しませんでした。', next: 'もう一度お試しください。' };
}

export interface ErrorPanelProps {
  /** 何をしようとして失敗したか。例: 「案件の一覧を読み込めませんでした」 */
  title: string;
  /** 例外。渡すと humanizeError で原因文を組む */
  error?: unknown;
  /** 原因文を自分で書く場合 (error より優先) */
  cause?: HumanCause;
  /** true のとき「入力した内容は残っています」を出す (フォーム上のエラー) */
  inputPreserved?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
  /** 追加の操作 (「最新を読み込む」など) */
  action?: ReactNode;
  className?: string;
}

export function ErrorPanel({
  title,
  error,
  cause,
  inputPreserved = false,
  onRetry,
  retryLabel = 'もう一度試す',
  action,
  className,
}: ErrorPanelProps) {
  const c = cause ?? humanizeError(error);

  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-destructive/30 bg-destructive-surface px-5 py-4',
        className,
      )}
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-foreground">{title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-foreground/80">{c.cause}</p>
          <p className="text-[13px] leading-relaxed text-foreground/80">{c.next}</p>
          {inputPreserved && (
            <p className="mt-2 text-[13px] font-bold text-foreground">入力した内容は残っています。</p>
          )}
          {(onRetry || action) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-control bg-card px-4 py-2 text-[13px] font-bold text-foreground shadow-sm transition-colors hover:bg-secondary"
                >
                  {retryLabel}
                </button>
              )}
              {action}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
