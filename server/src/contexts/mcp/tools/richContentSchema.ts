/**
 * MCP のツールが「読める形の中身」を受け取るための引数 (migration 160)
 *
 * ── なぜ引数を1本増やすのか ────────────────────────────────
 *
 * これまで AI は、メールから読み取った 差出人・要件・希望日・人数・予算・期限 を
 * **1本の自由文に詰めて**渡していました（`summary` / `content` / `notes`）。
 * 画面はそれをそのまま出すので、受け取った人は毎回全文を読み直していました。
 *
 * AI 側は既に項目を読み分けています。**渡す入れ物が1本しか無かった**だけです。
 * ここで「意味の単位」の配列を受け取れるようにします。
 *
 * ── 既存の呼び出しを壊さない ────────────────────────────────
 *
 * **すべて任意 (`.optional()`) です。** `summary` などの必須引数は今までのまま。
 * 本番の無人バッチ（メール取込スキル）は最短1時間おきに走っており、
 * 必須引数を足すと**次の実行から全部落ちます**。
 *
 * ── AI に HTML を書かせない ──────────────────────────────────
 *
 * 「HTML を返させて画面に流し込む」は採りません。取引先が送ってきた文面が
 * そのまま実行される（XSS）ため、また画面の書体・色・余白が AI ごとに
 * 変わってしまうためです。**AI は何の情報かを言い、どう見せるかはアプリが決めます。**
 */
import { z } from 'zod';

const emphasis = z.enum(['money', 'date', 'strong']);

const heading = z.object({
  type: z.literal('heading'),
  text: z.string().describe('小見出し（例: 先方のご要望）'),
});

const text = z.object({
  type: z.literal('text'),
  text: z.string().describe('ふつうの段落。改行はそのまま出る'),
});

const fields = z.object({
  type: z.literal('fields'),
  items: z.array(z.object({
    label: z.string().describe('項目名（例: 希望日 / 人数 / 予算 / 返事の期限）'),
    value: z.string().describe('値。**読み取れなかった項目はそもそも入れない**（推測しない）'),
    emphasis: emphasis.optional().describe('money=金額として桁を揃える / date=等幅 / strong=太字'),
  })).describe('ラベルと値の組。**メールの要点はほぼこれで表せる**'),
});

const bullets = z.object({
  type: z.literal('bullets'),
  items: z.array(z.string()).describe('箇条書き'),
});

const table = z.object({
  type: z.literal('table'),
  columns: z.array(z.string()).describe('列の見出し（8列まで）'),
  rows: z.array(z.array(z.string())).describe('行（50行まで・列数は自動で揃える）'),
});

const quote = z.object({
  type: z.literal('quote'),
  text: z.string().describe('**メール本文からの引用そのまま**。要約せずに写す'),
  source: z.string().optional().describe('どこからの引用か（例: 本文 3段落目）'),
});

const note = z.object({
  type: z.literal('note'),
  tone: z.enum(['info', 'warning', 'success']).describe('info=補足 / warning=注意 / success=良い知らせ'),
  text: z.string(),
});

const link = z.object({
  type: z.literal('link'),
  url: z.string().describe('http / https のみ。それ以外は捨てられる'),
  label: z.string().optional(),
});

export const richBlock = z.discriminatedUnion('type', [
  heading, text, fields, bullets, table, quote, note, link,
]);

/**
 * ツールの `inputSchema` に混ぜる。
 *
 * ```ts
 * inputSchema: { summary: z.string(), ...RICH_CONTENT_ARGS }
 * ```
 */
export const RICH_CONTENT_ARGS = {
  details: z.array(richBlock).optional().describe(
    'メールの中身を**読める形**に組み立てたもの（任意・最大30ブロック）。'
    + '自由文を1本にまとめるのではなく、意味の単位に分けて渡す。'
    + '種類: heading(小見出し) / text(段落) / fields(ラベルと値の組) / bullets(箇条書き) / '
    + 'table(表) / quote(本文からの引用) / note(注意・補足) / link(参考URL)。'
    + '**おすすめの組み立て方**: ①fields に「差出人の所属・要件・希望日・人数・予算・返事の期限」など'
    + '読み取れた項目だけを入れる（読み取れなかった項目は入れない＝推測しない）'
    + '②bullets に条件や補足 ③quote に判断の根拠になる原文をそのまま引用する。'
    + '**HTML やマークダウンを書かないこと** — 画面側が v4 の書体・色で描く。',
  ),
  body_text: z.string().optional().describe(
    'メール本文の**全文**（任意・切り詰めない）。要約ではなく原文をそのまま。'
    + 'AI がどこを読み違えたかを後から確かめるために残す。画面では「原文を見る」で開ける。',
  ),
};
