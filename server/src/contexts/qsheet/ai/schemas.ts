/**
 * LLM に渡す zod スキーマ専用（段8・04-ai.md §2-5）。
 *
 * ⚠️ **これは「normalize 後の内部型」ではない。** 内部表現（`AppliedPayload` 等）は
 * `types.ts` に別に持つ。ここで定義するのは strict structured outputs（OpenAI /
 * Anthropic 双方）に渡す形だけで、**`.optional()` / `.nullable()` / `.default()` を
 * 1つも使わない**（既存5サービスと同じ作法。使うと `zodTextFormat` の時点で落ちる。
 * `intake-ai.service.ts:174-228` が手本）。
 *
 * 無ければ空文字・空配列・0 を返させ、後段の `normalize.ts` が捨てる／整える。
 * `emphasis` は 04-ai.md §2-5 の訂正どおり第1版から落とす（`entries[0]` に置き場所が無い）。
 */
import * as z from 'zod/v4';

/* ── ① イベント設計（枠の叩き台） ────────────────────────────── */

export const EventPlanColumnSchema = z.object({
  key: z.string().describe('この提案内だけで使う一時キー（他の要素と重複しない文字列）'),
  col_group: z.enum(['venue', 'prep', 'ops']).describe('列の種類'),
  label: z.string().describe('列の見出し'),
  room_hint: z.string().describe('部屋名の候補。分からなければ空文字'),
});

export const EventPlanItemSchema = z.object({
  key: z.string().describe('この提案内だけで使う一時キー'),
  column_ref: z.string().describe('既存列の id か、上の columns[].key のどちらか'),
  title: z.string(),
  kind: z.enum([
    'setup', 'rehearsal', 'onair', 'recording', 'meal', 'standby', 'teardown', 'move', 'other',
  ]),
  start_min: z.number().int().describe('その日の 00:00 JST からの分。"HH:MM" にしない'),
  end_min: z.number().int(),
  assignee: z.string().describe('自由入力。分からなければ空文字'),
  note: z.string(),
  reason: z.string().describe('なぜこの枠を置いたか、1行で'),
});

export const EventPlanSchema = z.object({
  columns: z.array(EventPlanColumnSchema),
  items: z.array(EventPlanItemSchema),
});

/* ── ② 台本の骨格（ロールと尺の並び） ─────────────────────────── */

export const ScriptOutlineRowSchema = z.object({
  key: z.string().describe('この提案内だけで使う一時キー'),
  label: z.string().describe('行ラベル'),
  duration_sec: z.number().int().describe('尺（秒）'),
  speaker: z.string().describe('話者名。masters.persons にある名前のみ。分からなければ空文字'),
  hint: z.string().describe('この行で何を話すかの1行メモ。本文は書かない'),
});

export const ScriptOutlineSectionSchema = z.object({
  key: z.string(),
  label: z.string().describe('ロール名'),
  duration_sec: z.number().int(),
  rows: z.array(ScriptOutlineRowSchema),
});

export const ScriptOutlineSchema = z.object({
  budget_sec: z.number().int().describe('合計尺の上限（秒）。分からなければ 0'),
  sections: z.array(ScriptOutlineSectionSchema),
});

/* ── ③ セリフ（プロンプター原稿） ─────────────────────────────── */

export const ScriptLineSchema = z.object({
  row_id: z.string().describe('既存の行 id。渡された行 id 以外を作らない'),
  name: z.string().describe('話者。masters.persons のどれか。分からなければ空文字'),
  text: z.string().describe('プレーンテキスト。改行は \\n。HTML タグ禁止'),
  is_q_word: z.boolean().describe('Qワード（赤 Q→）なら true'),
});

export const ScriptLinesSchema = z.object({
  lines: z.array(ScriptLineSchema),
  advice: z.array(z.string()).describe('「ここは1行足したほうがよい」等。行は勝手に増やさない'),
});

/* ── ④ 壁打ち（対話の1ターン） ────────────────────────────────── */

export const ChatReplySchema = z.object({
  content: z.string().describe('assistant の発言本文'),
  suggests: z.enum(['none', 'event_plan', 'script_outline', 'script_lines'])
    .describe('この発言から次段を起動できるなら種類を、できなければ none'),
  hint: z.string().describe('suggests が none 以外のとき、次段に渡す短い指示。無ければ空文字'),
});
