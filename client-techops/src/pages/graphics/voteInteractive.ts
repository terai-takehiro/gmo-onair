// テロップCG — 投票・クイズ部品（`vote`）の締切連動（段6-6）・外部インタラクティブ連携
// （段6-7）用フィールドの型と正規化。`voteState.ts`（`fields.voteState`）と同じ設計方針
// （JSONBの1キー・migration不要・省略時は後方互換のデフォルト）で、`fields`に以下を追加する:
//
//   - `countdownSeconds`（段6-6・任意）: 「続き」でvoteStateが`'open'`になったとき、
//     サーバー側がこの秒数後に自動で`'closed'`へ進める（`vote-lifecycle.service.ts`が
//     タイマーを持つ・クライアントはこの値を読み書きするだけ）。未指定＝自動締切なし
//     （従来どおり手動で「続き」を押すまで開票しない）。
//   - `interactiveQuestionId`（段6-7・任意）: この投票ページが外部インタラクティブの
//     どの設問に対応するかのID。`POST /pages/:id/vote/sync-interactive`で発行される——
//     フォームで手入力するものではない（`RankingControlPanel`と同じく、直接編集不可の
//     コンソール専用フィールド）。
//   - `openedAt`（段6-6・サーバー専用）: voteStateが`'open'`になった時刻（ISO文字列）。
//     クライアントは読むだけ（残り時間表示に使える）——書き込みはサーバー側
//     （`vote-lifecycle.service.ts`が`PUT /pages/:id`の一部として設定する）。
export interface VoteInteractiveFields {
  countdownSeconds?: number;
  interactiveQuestionId?: string;
  openedAt?: string;
}

const COUNTDOWN_SECONDS_KEY = 'countdownSeconds';
const INTERACTIVE_QUESTION_ID_KEY = 'interactiveQuestionId';
const OPENED_AT_KEY = 'openedAt';

/** `fields.countdownSeconds`を読む。未指定・不正値は`null`（自動締切なし＝従来どおり） */
export function readCountdownSeconds(fields: Record<string, unknown> | null | undefined): number | null {
  const v = fields?.[COUNTDOWN_SECONDS_KEY];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}

/** `fields`に`countdownSeconds`を書き込んだ新しい`fields`を返す。`null`で解除（自動締切なしに戻す） */
export function withCountdownSeconds(fields: Record<string, unknown>, seconds: number | null): Record<string, unknown> {
  const next = { ...fields };
  if (seconds == null) delete next[COUNTDOWN_SECONDS_KEY];
  else next[COUNTDOWN_SECONDS_KEY] = seconds;
  return next;
}

/** `fields.interactiveQuestionId`を読む。未指定は`null`（外部連携未設定・従来どおり手入力運用） */
export function readInteractiveQuestionId(fields: Record<string, unknown> | null | undefined): string | null {
  const v = fields?.[INTERACTIVE_QUESTION_ID_KEY];
  return typeof v === 'string' && v !== '' ? v : null;
}

/** `fields.openedAt`を読む。未指定は`null` */
export function readOpenedAt(fields: Record<string, unknown> | null | undefined): string | null {
  const v = fields?.[OPENED_AT_KEY];
  return typeof v === 'string' && v !== '' ? v : null;
}
