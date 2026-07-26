// shared/src/client/notify.ts — 操作の結果を伝える 1 本の口
//
// v2.9.290 まで、この薄いラッパーは **client-qsheet にだけ**あった。
// 他の 6 アプリは `alert()` を直接呼んでいて、結果として
// 「保存に失敗しました」がブラウザ標準のダイアログで出ていた
// (デザインの外側に出る / 押すまで他の操作ができない)。
//
// **トーストは使わない** (§4.15)。流れて消えると「保存に失敗した」ことに
// 気づけないので、`NoticeBar` に 1 件だけ出して**人が閉じるまで残す**。
// 出る場所は各アプリのレイアウトに置いた `<NoticeBar />` 1 か所だけ。
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
 * 各画面に散っていたので 1 本にした。**技術用語をそのまま出さない**ために、
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
