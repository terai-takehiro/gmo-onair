/**
 * 台詞など「本文そのもの」を差分に残さないための落とし方（段7 §7-2 案A）。
 *
 * `get_ai_feedback_digest`（MCP）は無ゲートの read ツールで、`recent_examples` が
 * `before_value` / `after_value` をそのまま返す（`ai-feedback.service.ts:238-246,267-273`）。
 * `script_line_draft` の差分に台詞の本文をそのまま入れると、共有 API キーの誰からでも
 * 台本の中身が読めてしまう。**全文の正は `ai_outputs.payload_snapshot`（MCP から読めない）
 * に残る**ので、`ai_corrections` 側は「何が変わったか」が分かる最小限の情報だけを持つ。
 *
 * ⚠️ 二重防御の片割れ（もう片方は §7-2 案B・`aifeedback.tools.ts` の degrade）。
 * どちらか片方だけにしないこと（04-ai.md §5-6 の理由）。
 */
import { createHash } from 'node:crypto';

export interface RedactedText {
  len: number;
  head: string;
  hash: string;
}

/**
 * ⚠️ `head` の20字にも顧客名等が入りうる（「本日は◯◯社の…」）。それでも残すのは、
 * ハッシュだけでは「何を直したのか」が1バイトも分からないため（README 確認7・§12 #1。
 * 未決のまま既定 A を採用している）。
 */
export function redactText(v: string): RedactedText {
  const s = String(v ?? '');
  return {
    len: [...s].length,
    head: [...s].slice(0, 20).join(''),
    hash: createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16),
  };
}

/**
 * kind ごとに、どのフィールドを `redactText()` に通すかを1か所で決める。
 * `computeSettleCorrections`（settle.core.ts）と `sanitizeApplied`（apply.core.ts）の
 * 両方がここを読む。
 */
export const REDACT_FIELDS: Record<string, string[]> = {
  script_line_draft: ['html'], // 本文
  script_outline_draft: [], // ロール名・尺は落とさない（骨格の段では本文を書かせない設計）
  event_plan_draft: [],
};

/** `kind` に登録された落とすべきフィールド名の一覧（無ければ空配列） */
export function redactedFieldsOf(kind: string): string[] {
  return REDACT_FIELDS[kind] ?? [];
}
