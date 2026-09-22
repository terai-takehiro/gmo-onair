/**
 * まとめの「網羅量」を決めて、足りなければやり直させる（AI の出力が短すぎる問題）
 *
 * ── 何が起きていたか ────────────────────────────────────────
 *
 * 議事録（`minutes-ai.service`）とやり取りの整形（`activity-ai.service`）は、
 * どちらも**短く書かせる指示だけ**を持っていました:
 *
 *   議事録   `summary` は「3〜5行で」（**打合せが1時間でも3行**）
 *   やり取り 「## 短く書くこと（いちばんよく失敗するところ）」
 *            `turns` は多くて6件・`facts` は多くて4件・`quote` は長くても2文
 *
 * 材料の長さに関係なく上限だけがあるので、**長い打合せ・長いメールほど
 * 落ちる情報が増えます**。利用者からのご指摘は
 * 「きわめて短いテキストでしか残らず、議事録の意味をなしていない」でした。
 *
 * ── なぜ「長く書け」だけでは直らないか ──────────────────────
 *
 * 文字数の下限をプロンプトに書いても、モデルは**水増しで満たせます**。
 * この製品は「書かれていないことを書かない」を最優先にしているので、
 * 水増しは短さより悪い結果です。
 *
 * そこで**2段**にします:
 *
 *   ① 目安を**材料の長さから計算して渡す**（固定値を書かない）
 *   ② 出てきたものを**測り、足りなければ1回だけやり直させる**
 *      — やり直しの指示は「落とした論点を拾え」であって「長く書け」ではない
 *
 * **やり直しても足りなければ、長いほうを採って先に進みます。**
 * 網羅が足りないことを理由に記録そのものを失わせない（短くても残るほうがまし）。
 *
 * ── 測る対象から引用を外している理由 ────────────────────────
 *
 * 議事録の `quote` は文字起こしの写しです。数に入れると
 * **引用を長くするだけで下限を満たせて**しまい、測る意味が無くなります。
 *
 * ネットワークにも DB にも触らないので素で試せます
 * （`shared/tests/aiCoverage.test.ts`）。
 */

/** 網羅量を測る仕事。段（`ai-model.ts`）とは別 — あちらは「どのモデルか」 */
export type CoverageJob = 'minutes' | 'activity';

export interface CoverageTarget {
  /** 材料の文字数（プロンプトにそのまま出す） */
  inputChars: number;
  /** これを下回ったらやり直させる文字数 */
  minChars: number;
  /** プロンプトに書く目安の文字数 */
  guideChars: number;
  /**
   * 測るかどうか。**材料が短いときは測りません** —
   * 3行の電話メモから 200 字を出させるのは水増しの強制になる
   */
  enforced: boolean;
}

/**
 * 仕事ごとの計算。**比率と床・天井をここ1か所に置きます**
 * （プロンプトの文面に数字を焼き込むと、材料の長さに追従しなくなる）。
 *
 * ── 比率の根拠 ──────────────────────────────────────────────
 *
 * 議事録: 1時間の打合せの文字起こしは日本語で 25,000〜30,000 字。
 * 人が書く議事録はおよそ 2,000〜3,000 字なので **1割**を目安にしています。
 *
 * やり取り: 取り込んだメールは署名・引用返信・定型文が半分以上を占めるので、
 * 議事録より高い **1/4** を目安にします（読み捨てる部分が多いぶん、
 * 残すべき中身の密度は高い）。
 */
const POLICY: Record<CoverageJob, {
  /** 目安の比率 */
  guideRatio: number;
  guideFloor: number;
  guideCap: number;
  /** 下限の比率 */
  minRatio: number;
  minFloor: number;
  minCap: number;
  /** 材料がこれより短ければ測らない */
  enforceFrom: number;
  /**
   * 床が効くときでも、**材料に対してこの割合は超えさせない**。
   * 床（`minFloor`）をそのまま短い材料に当てると、
   * 「400字の原文から 200字」のような**水増しを強いる目安**になる。
   */
  inputShareCap: number;
}> = {
  minutes: {
    guideRatio: 0.12, guideFloor: 400, guideCap: 5_000,
    minRatio: 0.06, minFloor: 200, minCap: 2_500,
    enforceFrom: 800, inputShareCap: 0.25,
  },
  /*
   * やり取りの下限を議事録より**低めに置いています**（比率で 0.10）。
   *
   * 取り込んだメールは署名・引用返信・定型文が長く、**それを正しく捨てた結果
   * 短くなる**ことが普通にあります。下限を高くすると、正しい整形にまで
   * 拾い直し（＝上位モデルでのもう1回）が走り、**一括整形200件では
   * その全部に2回ぶんの費用**がかかります。
   *
   * ここは「短いものを全部やり直させる」ための値ではなく、
   * **明らかに落ちているものだけを掬う**ための値です。
   */
  activity: {
    guideRatio: 0.25, guideFloor: 200, guideCap: 3_000,
    minRatio: 0.10, minFloor: 100, minCap: 1_500,
    enforceFrom: 500, inputShareCap: 0.35,
  },
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** 材料の長さから、まとめの目安と下限を決める */
export function coverageTarget(job: CoverageJob, inputChars: number): CoverageTarget {
  const p = POLICY[job];
  const n = Number.isFinite(inputChars) ? Math.max(0, Math.round(inputChars)) : 0;
  const guide = Math.min(
    clamp(Math.round(n * p.guideRatio), p.guideFloor, p.guideCap),
    Math.round(n * p.inputShareCap * 1.6),
  );
  const min = Math.min(
    clamp(Math.round(n * p.minRatio), p.minFloor, p.minCap),
    Math.round(n * p.inputShareCap),
  );
  return {
    inputChars: n,
    minChars: Math.max(0, min),
    guideChars: Math.max(0, guide),
    enforced: n >= p.enforceFrom,
  };
}

/** 出てきたものが足りているか。**測らない設定のときは常に足りている扱い** */
export function isTooThin(outputChars: number, target: CoverageTarget): boolean {
  if (!target.enforced) return false;
  const n = Number.isFinite(outputChars) ? Math.max(0, outputChars) : 0;
  return n < target.minChars;
}

/**
 * プロンプトに入れる目安の文。**「長く書け」と言わない** —
 * 言うと水増しで満たされる。言うのは「落とさないこと」で、
 * 文字数はその結果の目安として添えるだけ。
 */
export function coverageBrief(
  target: CoverageTarget,
  /** 材料の呼び名（「今回の文字起こし」「今回の原文」） */
  unitLabel: string,
  /** **何を数えるか**の呼び名。議事録は引用を数えない（上の見出しの理由） */
  outputLabel: string,
): string {
  if (!target.enforced) return '';
  return `## 分量の目安

${unitLabel}は **${target.inputChars.toLocaleString()} 字**あります。
${outputLabel}は **${target.guideChars.toLocaleString()} 字程度**が目安です
（**${target.minChars.toLocaleString()} 字を下回るときは、たいてい論点を落としています**）。

**文字数を満たすために書き足さないでください。** 目安を下回ったときに疑うのは
「書きすぎたか」ではなく「話されたのに書いていない論点があるか」です。
材料に無いことを足して長さを合わせるのは、短いまとめより悪い結果です。`;
}

/**
 * やり直しのときに足す指示。**「長く書け」ではなく「拾い直せ」**。
 *
 * 1回目の結果を渡さないのは、渡すと**それを膨らませる**方向に働くためです
 * （落とした論点は1回目の出力には載っていないので、材料を読み直させたい）。
 */
export function coverageRetryNote(got: number, target: CoverageTarget, outputLabel: string): string {
  return `## やり直し（1回目が短すぎました）

1回目の${outputLabel}は ${got.toLocaleString()} 字で、目安の
${target.guideChars.toLocaleString()} 字を大きく下回りました。
**材料をもう一度はじめから読み、話題ごとに拾い直してください。**

- 話された論点・依頼・条件・数字を**1つずつ**数えながら進めること
- 1回目で書かなかった話題が無いかを確かめること
- **それでも材料に無いことは書かないこと。** 拾うのは書かれているものだけです`;
}

/**
 * 人がテキストを直したとき、それが**書き足し**か**書き換え**かを分ける。
 *
 * ── なぜ分けるか ────────────────────────────────────────────
 *
 * どちらも `fix`（値の誤り）にしていると、**「AI が短すぎる」が数字に出ません**。
 * 人が AI の文を残したまま先に書き足しているなら、それは誤りではなく
 * **網羅が足りなかった**という別の信号です（条件2）。
 * `enrich` として貯めておくと、`buildAdvice` が次のプロンプトに返せます（条件4）。
 *
 * 判定は**素朴に**します。AI の文がほぼそのまま残っていて、
 * 全体が目に見えて長くなったものだけを書き足しとみなします。
 */
export function classifyTextCorrection(
  before: unknown, after: unknown,
): 'none' | 'enrich' | 'fix' {
  const b = typeof before === 'string' ? before.trim() : '';
  const a = typeof after === 'string' ? after.trim() : '';
  if (b === a) return 'none';
  // 空から書いたものは今までどおり書き足し（`minutes.service` の元の判定）
  if (!b) return 'enrich';
  if (!a) return 'fix';
  // AI の文が原形をとどめていない = 書き換え
  if (!a.includes(b)) return 'fix';
  /*
   * 残したうえで**2割以上かつ10字以上**増えていれば書き足し。
   *
   * 割合だけで見ると、短い一文に「（済）」と足しただけでも書き足しになります
   * （13字 → 16字は 1.2 倍を超える）。**字数の下限も要る**。
   */
  return a.length >= b.length * 1.2 && a.length - b.length >= 10 ? 'enrich' : 'fix';
}
