/**
 * notify — 操作の結果を伝える1本の口。
 *
 * v4 着手時点で、結果の伝え方は**アプリごとに3通り**でした:
 *
 *   `alert()` を直接呼ぶ                 25 か所 (ブラウザ標準のダイアログ)
 *   `console.error` だけ                  多数   (**利用者には何も出ない**)
 *   何もしない                            多数   (押しても変わらないように見える)
 *
 * **トーストは使いません** (docs/design/v4/_rules.md)。流れて消えると
 * 「保存に失敗した」ことに気づけないので、`NoticeBar` に1件だけ出して
 * **人が閉じるまで残します**。
 */
import { setNotice } from './ui/notice';

export interface NotifyOptions {
  /** 何が起きたか・次に何をすればよいか (1〜2行) */
  description?: string;
}

export function notifySuccess(message: string, options?: NotifyOptions): void {
  setNotice({ tone: 'success', title: message, description: options?.description });
}

export function notifyError(message: string, options?: NotifyOptions): void {
  setNotice({ tone: 'error', title: message, description: options?.description });
}

export function notifyInfo(message: string, options?: NotifyOptions): void {
  setNotice({ tone: 'info', title: message, description: options?.description });
}

export function notifyWarning(message: string, options?: NotifyOptions): void {
  setNotice({ tone: 'warning', title: message, description: options?.description });
}

/**
 * サーバーからのエラーを人が読める形にして出す。
 *
 * `alert(\`更新に失敗しました: ${err?.response?.data?.error?.message}\`)` の形が
 * 各画面に散っていたので1本にした。**技術用語をそのまま出さない**ために、
 * サーバーの日本語メッセージがあればそれを、無ければ何をしようとして
 * 失敗したかだけを出す。
 */
export function notifyApiError(what: string, err: unknown, fallback?: string): void {
  const res = (err as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response;
  const message =
    res?.data?.error?.message ??
    res?.data?.message ??
    fallback ??
    (err instanceof Error ? err.message : undefined);
  notifyError(what, { description: message });
}
