/**
 * Wiki の AI — プロンプトと構造化出力の形（`docs/design/v4/wiki.md` §7-1・§7-5）。
 *
 * ── 全機能で守ること ──────────────────────────────────────
 *
 * - **AI に HTML を書かせない。** 出力は Markdown の文字列で、描くのは画面です
 *   （メール取込で決めた判断と同じ。取引先の文面がそのまま実行されるのを防ぐ）
 * - **材料に無いことを書かない。** 手順書は現場で実行されるので、
 *   AI が話を補うのが最悪の失敗です（議事録の「引用必須」と同じ規律）
 * - **本文の見出しは `#` `##` `###` まで**（§4-2。`####` 以下は描く部品が無い）
 *
 * ⚠️ **ここを1文字でも変えたら `wiki-ai.constants.ts` の版を上げること。**
 * 版が無いと、直した効果を後から数字で言えません。
 *
 * ⚠️ **スキーマに `.optional()` / `.nullable()` / `.default()` を使わないこと。**
 * 構造化出力（OpenAI の `text.format` / Anthropic の `output_config.format`）は
 * それらを受け付けません（`qsheet/ai/schemas.ts` と同じ前提）。
 * 「無い」は空文字・空配列で表します。
 */
import * as z from 'zod/v4';
import type { WikiTidyMode } from './wiki-ai.types';

/* ── ① AI に聞く ──────────────────────────────────────────── */

export const WikiAnswerSchema = z.object({
  answer_md: z.string().describe(
    '答え。Markdown の文字列。材料に書かれていることだけで書く。'
    + '材料から答えが出せないときは空文字にする（作文しない）',
  ),
  citations: z.array(z.object({
    page_id: z.string().describe('材料に付いている page_id をそのまま書く。作らない'),
    heading: z.string().describe('材料の中の見出しの文字。見出しが無い箇所なら空文字'),
    quote: z.string().describe('根拠になった材料の一文をそのまま写す。要約しない。120字以内'),
  })).describe('答えの根拠。**1つも出せないなら空配列にして answer_md も空文字にする**'),
  confidence: z.enum(['cited', 'none']).describe(
    'cited = 材料の引用で答えられた / none = 材料に書かれていない',
  ),
});
export type WikiAnswerRaw = z.infer<typeof WikiAnswerSchema>;

export const WIKI_ANSWER_SYSTEM = [
  'あなたは社内 Wiki の案内役です。渡された材料（社内の公開ページ）だけを使って答えます。',
  '',
  '## 守ること',
  '- **材料に書かれていないことは書かない。** 一般論・推測・外部の知識で補わない',
  '- 答えの根拠になった一文を citations に**そのまま写す**（要約しない）。page_id は材料に付いている値をそのまま使う',
  '- **引用が1つも出せないときは、answer_md を空文字・citations を空配列・confidence を none にする。**',
  '  それが正しい答えです。当てずっぽうで答えるより、書かれていないと言うほうが役に立ちます',
  '- 出力は Markdown の文字列。**HTML タグを書かない**。見出しは `#`〜`###` まで',
  '- 手順は番号付きの箇条書きにする。順番が結果を変える作業（電源・接続・権限）は順番を落とさない',
  '- 材料どうしが食い違っていたら、両方を出して「食い違っている」と書く。片方を黙って選ばない',
].join('\n');

export interface AnswerPromptInput {
  question: string;
  materialBlock: string;
  /** 直前の往復（「言い直して」への追従。無ければ空） */
  history: string;
  /** 直され方の傾向（条件4 の還流）。無ければ空配列 */
  advice: string[];
}

export function buildAnswerPrompt(input: AnswerPromptInput): string {
  const advice = input.advice.length
    ? ['## これまでの傾向（人があなたの答えをどう評価したか）',
      '実測値です。同じ外し方を繰り返さないでください。',
      'ただし**材料に無いことを補ってはいけません**。傾向は判断の重み付けにだけ使うこと。',
      ...input.advice.slice(0, 8).map((a) => `- ${a}`), ''].join('\n')
    : '';
  const history = input.history ? `## これまでのやり取り\n${input.history}\n` : '';
  return [
    advice,
    history,
    '## 質問',
    input.question,
    '',
    '## 材料（社内 Wiki の公開ページ）',
    input.materialBlock || '（材料は1件もありません）',
  ].filter(Boolean).join('\n');
}

/* ── ② AI で下書きを作る ──────────────────────────────────── */

export const WikiDraftSchema = z.object({
  title: z.string().describe('ページの題。20字以内を目安に、何の手順書かが分かる短い名前'),
  body_md: z.string().describe(
    '本文。Markdown の文字列。見出し（`#`〜`###`）・箇条書き・表で構成する。HTML は書かない',
  ),
  open_questions: z.array(z.string()).describe(
    '材料からは決められなかったこと。**本文に推測で書かず、ここに出す**。無ければ空配列',
  ),
});
export type WikiDraftRaw = z.infer<typeof WikiDraftSchema>;

export const WIKI_DRAFT_SYSTEM = [
  'あなたは社内 Wiki の手順書の下書きを書きます。材料（会話・既存のページ・メモ）だけを使います。',
  '',
  '## 守ること',
  '- **材料に無いことを書かない。** 分からないことは本文に推測で書かず、open_questions に出す',
  '- 読む人は**現場でこの手順どおりに手を動かします**。順番・前提・注意を落とさない',
  '- 構成は「何のためのページか → 前提 → 手順 → 困ったとき → 関連」を目安にする',
  '- 出力は Markdown の文字列。**HTML タグを書かない**。見出しは `#`〜`###` まで',
  '- 注意書きは `> [!CAUTION]` の行で始める（この Wiki が描ける形）',
  '- 人の名前を断定で書かない。担当は役割（「配信の担当」）で書く',
].join('\n');

export interface DraftPromptInput {
  title: string;
  /** 会話・既存の本文・手で渡したメモを束ねた文字列 */
  materialBlock: string;
  advice: string[];
}

export function buildDraftPrompt(input: DraftPromptInput): string {
  const advice = input.advice.length
    ? ['## これまでの傾向（人があなたの下書きをどう直したか）',
      '実測値です。同じ直され方を繰り返さないでください。',
      ...input.advice.slice(0, 8).map((a) => `- ${a}`), ''].join('\n')
    : '';
  return [
    advice,
    `## 作るページ\n${input.title || '（題は材料から決めてください）'}`,
    '',
    '## 材料',
    input.materialBlock || '（材料は1件もありません。書けることが無ければ本文を空文字にしてください）',
  ].filter(Boolean).join('\n');
}

/* ── ③ AI で整える ────────────────────────────────────────── */

export const WikiRewriteSchema = z.object({
  result_md: z.string().describe('整えたあとの Markdown。**元の文に無い事実を足さない**'),
  changed_terms: z.array(z.string()).describe(
    '揃えた語。「元の語 → 揃えた語」の形（例「カード → セキュリティカード」）。無ければ空配列',
  ),
});
export type WikiRewriteRaw = z.infer<typeof WikiRewriteSchema>;

/** 「AI で整える」のやり方ごとの指示（§7-1。主な使い方は structure） */
const TIDY_INSTRUCTION: Record<WikiTidyMode, string> = {
  structure: '手入力のメモを**手順書の形**にしてください。見出しで区切り、作業は番号付きの箇条書きにし、'
    + '気をつけることは `> [!CAUTION]` の注意書きにします。**書かれていない手順を足さないこと**',
  heading: '文のかたまりごとに**見出し**（`##`・`###`）を付けてください。本文の言い回しは変えません',
  bullets: '並んでいる事実を**箇条書き**にしてください。順番が意味を持つものは番号付きにします',
  terms: '社内で使う言葉に**揃えて**ください。変えた語は必ず changed_terms に「元 → 後」で出します。'
    + '言い回しの好みでは変えず、同じものを指す別の呼び方だけを揃えます',
  shorten: '意味を落とさずに**短く**してください。手順・数値・固有名詞・注意書きは1つも削りません',
};

export const WIKI_REWRITE_SYSTEM = [
  'あなたは社内 Wiki の文章を整えます。**書かれていることの形だけ**を直します。',
  '',
  '## 守ること',
  '- **事実を足さない・減らさない。** 手順・数値・日付・固有名詞・注意書きを落とさない',
  '- 出力は Markdown の文字列。**HTML タグを書かない**。見出しは `#`〜`###` まで',
  '- 元の文が既に整っているなら、そのまま返してよい（無理に書き換えない）',
  '- 語を揃えたときは changed_terms に「元の語 → 揃えた語」で必ず出す',
].join('\n');

export function buildRewritePrompt(mode: WikiTidyMode, text: string, glossary: string[]): string {
  const terms = glossary.length
    ? `\n## 社内で使う言葉（この Wiki によく出る語）\n${glossary.slice(0, 40).join('・')}\n`
    : '';
  return [
    `## やること\n${TIDY_INSTRUCTION[mode]}`,
    terms,
    '## 元の文',
    text,
  ].filter(Boolean).join('\n');
}
