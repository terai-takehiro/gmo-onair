/**
 * どの仕事にどのモデルを使うか（1か所）
 *
 * ── なぜ1か所にまとめたか ──────────────────────────────────
 *
 * 着手時点で、モデルの決め方が **4つの service にばらばらに書かれて**いました。
 * しかも落とし方が食い違っていて:
 *
 *   投入口   `INTAKE_AI_MODEL`   → 既定
 *   やり取り `ACTIVITY_AI_MODEL` → `MINUTES_AI_MODEL` → 既定
 *   KPT     `KPT_AI_MODEL`      → `MINUTES_AI_MODEL` → 既定
 *   議事録   `MINUTES_AI_MODEL`  → 既定
 *
 * **`MINUTES_AI_MODEL` を1つ入れると、やり取りと KPT まで巻き添えで変わる**
 * という、名前から読み取れない結びつきがありました。
 *
 * ── 段は2つだけ ────────────────────────────────────────────
 *
 * モデル名を機能ごとに考えるのをやめ、**「重い仕事か / 軽い仕事か」の2段**に
 * したうえで、段ごとにモデル名を1つ決めます。
 *
 *   light … 形を整える・短い文から項目を拾う（**間違えても人がその場で気づける**）
 *   heavy … 取引先との合意を記録する・写真や PDF を読む・長い文をまとめる
 *
 * **判断の基準は「間違いに気づけるか」です。** 費用ではありません。
 * 気づけない間違い（議事録の決定事項が捏造される等）は、
 * 何円安くなっても割に合いません。逆に、画面上で読めばすぐ分かる崩れは
 * 軽いモデルで十分です。
 *
 * ── 入力の重さで上げる ──────────────────────────────────────
 *
 * 同じ機能でも、**長い文・添付つきは重い仕事**です。段は機能だけでなく
 * 入力の中身でも決まります（`tierFor` を呼ぶ側が渡す）。
 *
 * ⚠️ **迷ったら heavy に倒すこと。** 読み落として依頼が消えるほうが、
 * 数円より高くつきます（投入口の `canUseLightModel` と同じ決めごと）。
 *
 * ── モデル名を新しい世代に上げるとき ────────────────────────
 *
 * **先に環境変数（`AI_MODEL_HEAVY` / `AI_MODEL_LIGHT`）で検証環境に当てて、
 * 実際に呼んでから**ここを書き換えてください。**構造化出力（JSON スキーマ）に
 * 対応していない世代・名前があります** — 対応していないと、
 * 軽いほうは上位モデルへ逃げ（`formatActivity` のやり直し）、
 * 上位も落ちれば `format_error` が立って**待ち行列から外れます**。
 * つまり「整わない記録が増える」という**理由の分かりにくい形**で出ます。
 *
 * ⚠️ **上げたら `AI_PRICING_JSON` の鍵も足すこと。** モデル名が変わると
 * 古い鍵は当たらなくなり、**その行は合計に足されず静かに安く見えます**。
 */

export type AiProvider = 'openai' | 'anthropic';

/** 段。**3つ以上に増やさないこと** — 増やすと「どれを選ぶか」を毎回考えることになる */
export type AiTier = 'light' | 'heavy';

/** AI を使う仕事。`ai_usage.kind` とは別（あちらは呼び出しの記録） */
export type AiJob = 'intake' | 'activity' | 'minutes' | 'kpt';

/**
 * 段ごとの既定のモデル。**ここだけが「いま何を使っているか」の正**。
 *
 * ⚠️ **値段はここに書かない。** 単価は `AI_PRICING_JSON`（環境変数）で持ちます —
 * 焼き込むと「いつの値段か」が分からないまま金額が独り歩きします。
 */
export const BUILTIN_MODELS: Record<AiTier, Record<AiProvider, string>> = {
  heavy: { openai: 'gpt-5.6-terra', anthropic: 'claude-opus-5' },
  light: { openai: 'gpt-5.6-luna', anthropic: 'claude-haiku-4-5-20251001' },
};

const env = (name: string): string | null => {
  const v = (process.env[name] ?? '').trim();
  return v || null;
};

/**
 * 段ごとの上書き（環境変数）。**機能をまたいで効く**。
 *
 * ⚠️ **`process.env[名前]` のように動的に引かないこと。** `.env` に書いた変数が
 * コンテナに届いているかを見る検査（`scripts/check-env-passthrough.mjs`）は
 * **`process.env.X` の literal を数えている**ので、動的に引くと数えられず、
 * **docker-compose.yml に足し忘れても止まりません**（＝入れたのに効かない）。
 */
function tierEnv(tier: AiTier): string | null {
  return tier === 'heavy' ? env('AI_MODEL_HEAVY') : env('AI_MODEL_LIGHT');
}

/**
 * 機能ごとの上書き（環境変数）。**段より先に効きます。**
 *
 * 新しく増やさないこと — 増やすほど「なぜこのモデルなのか」を追うのに
 * 読む場所が増えます。ここにあるのは**すでに運用で使われている名前**で、
 * 消すと入れてある環境の挙動が黙って変わるため残しています。
 */
const JOB_ENV: Record<AiJob, string[]> = {
  intake: ['INTAKE_AI_MODEL'],
  activity: ['ACTIVITY_AI_MODEL'],
  minutes: ['MINUTES_AI_MODEL'],
  kpt: ['KPT_AI_MODEL'],
};

/**
 * 仕事と段からモデル名を決める。
 *
 * 優先順位は **機能ごとの上書き → 段ごとの上書き → 組み込みの既定**。
 *
 * ⚠️ **機能ごとの上書きは段を無視します。** 「`ACTIVITY_AI_MODEL` を入れたのに
 * 長い記録で上位モデルに上がらない」のは正しい挙動です（名指しした人の指定が勝つ）。
 *
 * ネットワークにも DB にも触らないので素で試せます
 * （`shared/tests/aiModel.test.ts`）。
 */
export function modelFor(job: AiJob, tier: AiTier, provider: AiProvider): string {
  for (const name of JOB_ENV[job]) {
    const v = env(name);
    if (v) return v;
  }
  return tierEnv(tier) ?? BUILTIN_MODELS[tier][provider];
}

/** 段を決めるときに渡す材料。**持っているものだけ渡せばよい** */
export interface TierInput {
  /** AI に読ませる文字数 */
  chars?: number;
  /** 画像・PDF・音声などの添付の数 */
  attachments?: number;
  /** 中身に関わらず重い仕事として扱う（呼ぶ側が既に判断している） */
  force?: AiTier;
}

/**
 * 機能ごとの既定の段と、軽いままでいられる上限。
 *
 * ── なぜ議事録と KPT は常に heavy か ────────────────────────
 *
 * **議事録は取引先との合意の記録**です。決定事項には引用を必須にしてあり、
 * ここで話を補われると**そのまま「言った / 言わない」の材料**になります。
 * しかも読む人は文字起こしの全文と突き合わせないので、**間違いに気づけません**。
 *
 * **KPT は隔週キープの資料**に出ます。材料は やり取り＋議事録＋遅れたタスクを
 * 束ねた長い文で、**長い文から要点を抜くのは軽いモデルがいちばん苦手**な仕事です。
 *
 * ── なぜやり取りの整形は light か ──────────────────────────
 *
 * やることが**形を整えるだけ**（原文にあることを、意味の単位に分ける）で、
 * **崩れていれば画面を見た人がその場で気づけます**。しかも原文（`description`）は
 * 1バイトも触らないので、**「打った文をみる」でいつでも突き合わせられます**。
 *
 * ⚠️ ただし v2 は **AI が「誰の発言か」を決めます**。取り違えは崩れと違って
 * もっともらしく見えるので、**「整え直す」で人が押し戻せる**ようにしてあります
 * （`activity-format.service` の `redoFormat`）。押した事実は `ai_corrections` に
 * `reject` で残り、精度が落ちていれば数字に出ます。
 * **落ちてきたら `ACTIVITY_AI_MODEL` で上位モデルに戻せます**（環境変数1つ）。
 */
const POLICY: Record<AiJob, { base: AiTier; lightMaxChars?: number }> = {
  // 添付・行数は呼ぶ側（`canUseLightModel`）が既に見ているので、ここでは文字数だけ
  intake: { base: 'light', lightMaxChars: 400 },
  // 取り込んだメールは 400 字では収まらない。**1往復ぶんの長さ**を目安にする
  activity: { base: 'light', lightMaxChars: 4_000 },
  minutes: { base: 'heavy' },
  kpt: { base: 'heavy' },
};

/**
 * 入力を見て段を決める。**上げることはあっても、下げることはありません。**
 *
 * `heavy` が既定の仕事は、短い入力でも `heavy` のままです — 難しさは
 * 長さではなく**間違いに気づけるかどうか**で決まるためです。
 */
export function tierFor(job: AiJob, input: TierInput = {}): AiTier {
  if (input.force) return input.force;
  const policy = POLICY[job];
  if (policy.base === 'heavy') return 'heavy';
  if ((input.attachments ?? 0) > 0) return 'heavy';       // 写真・PDF は読む力が要る
  if (policy.lightMaxChars !== undefined && (input.chars ?? 0) > policy.lightMaxChars) return 'heavy';
  return 'light';
}

/** その仕事で軽いモデルを使わない設定になっているか（`off` で止める） */
export function isLightDisabled(): boolean {
  return (process.env.AI_MODEL_LIGHT ?? '').trim().toLowerCase() === 'off';
}
