/**
 * 活動記録まわりの **AI フィードバック（条件1・2）専用の道具箱**。
 *
 * ── なぜ `activity-log.service.ts` から切ったか ──────────────
 *
 * あちらは「記録を1件つくる・直す・片づける」業務の口で、こちらは
 * **AI が出したものと人が直したものを突き合わせて `ai_corrections` に積む**仕事です。
 * 役割が違ううえ、あちらは 800 行を超えていて、片方を直すたびに
 * もう片方を読む状態になっていました（1ファイル 400 行の上限の趣旨）。
 *
 * ⚠️ **`ai_outputs.kind` の定数もここに置きます。** ここが差分を積む側の正で、
 * 業務の口（`activity-log.service.ts`）はそれを**再輸出しているだけ**です
 * （既存の import 元を1つも書き換えないため）。
 */
import { execute } from '../../../shared/db/connection';
import { classifyTextCorrection } from '../../../shared/services/ai-coverage';
import {
  recordCorrections, findLatestAiOutput, hasCorrections, type CorrectionInput,
} from '../../../shared/services/ai-output.service';
import {
  normalizeActivityStruct, activityStructLength,
} from '../../../shared/services/activity-struct';

/** `ai_outputs.kind`。**議事録とは別にする** — 直され方の傾向が別物なので混ぜない */
export const ACTIVITY_FORMAT_KIND = 'activity_format';

/**
 * `ai_outputs.kind`。**取込（MCP `create_activity_log`）で外の AI が書いた中身**。
 *
 * ⚠️ **`activity_format` と混ぜないこと。** 書き手が違います:
 *
 *   `activity_intake` … メール取込のスキルを動かしている Claude（本文を写す仕事）
 *   `activity_format` … サーバーの整形器（写された本文を意味の単位に分ける仕事）
 *
 * 混ぜると「短いのは取り込んだ人のせいか、整えた側のせいか」が分かりません。
 * 実際、着手前は**取込側が1行も記録されておらず**、
 * 「きわめて短いテキストでしか残らない」というご指摘に対して
 * **上流を数字で確かめる手段がありませんでした**（条件1の穴）。
 */
export const ACTIVITY_INTAKE_KIND = 'activity_intake';

/**
 * 取込の「プロンプト版」。**MCP ツールの `.describe()` が、外の AI にとってのプロンプト**です
 * （`mcp/tools/activities.tools.ts`）。だから describe を書き換えたらここを上げます。
 *
 * 上げないと、**contract を直した効果を後から数字で言えません**
 * （`ai_outputs.prompt_version` ごとの無修正採用率で比べる）。
 */
export const ACTIVITY_INTAKE_PROMPT_VERSION = 'mcp-intake-v1';

/**
 * 「窓を掛けない」ことを表す日数（`findLatestAiOutput` に渡す）。
 *
 * ⚠️ **ふつうの保存には絶対に使わないこと。** `findLatestAiOutput` の既定の7日窓は
 * 「3ヶ月後に次のアクションを書き換えたのは AI の誤りではなく**ふつうの業務更新**」を
 * 分けるためにあり、全部を時効なしにすると**正常な業務更新まで AI の誤りとして数えます**
 * （会社方針スキルの既知の失敗パターン）。
 *
 * 窓を外してよいのは**人が明示的に「違う」と言った操作だけ**です —
 * 次のアクションの削除・本文の手動での書き直し・「整え直す」。
 * `activity-format.service.ts` の `redoFormat` が同じ値を同じ理由で使っています。
 *
 * ⚠️ **この画面ではこれが例外ではなく既定になります。** 案件別の一覧の主役は
 * **期限超過＝AI が立ててから7日以上経った行**なので、窓を掛けたままだと
 * **削除しても `ai_outputs` が見つからず、`ai_corrections` に1行も残りません**
 * （＝この製品で回収できるいちばん強い否定信号が丸ごと落ちる）。
 */
const NO_WINDOW_DAYS = 36_500;

/**
 * 次のアクションを削除するときの理由（画面の3択。**必須にしない**）。
 *
 * ⚠️ **人に差分の入力を強いると運用が続きません**（会社方針スキルの既知の失敗）。
 * だから理由は任意で、選ばなければ `null` のまま `reject` だけが積まれます。
 *
 * 3つを分けるのは、**プロンプト改善の対象が1つだけ**だからです:
 *   `ai_wrong`        … AI の見当違い  → **これだけ**が整形・取込プロンプトの直し先
 *   `done`            … もう完了した    → 正常な業務の終わり（分母から外せる）
 *   `project_stopped` … 案件が停止した  → 同上
 * 区別できないと「拾いすぎ」なのか「案件が終わっただけ」なのか読めません。
 */
export const NEXT_ACTION_DELETE_REASONS = ['ai_wrong', 'done', 'project_stopped'] as const;
export type NextActionDeleteReason = typeof NEXT_ACTION_DELETE_REASONS[number];

/**
 * 画面から来た削除理由を `ai_corrections.note` の形に整える。
 *
 * 形は `reason:<コード>` ＋ 任意の自由記入（` / <文>`）。**先頭をコードに固定する**のは、
 * あとで集計（`ai-feedback.service` の助言）が「業務の終わり」を分母から外すためです
 * — 自由文だけだと機械では分けられません。
 */
/**
 * **画面が出している日本語の選択肢 → コード**の対応表。
 *
 * ⚠️ **画面はコードではなく表示そのままを送ってきます**（`NextActionDeleteReason.tsx` の
 * `DELETE_REASONS`）。表示文だけを保存すると、集計側が
 * 「業務の終わり」と「AI の見当違い」を機械で分けられず、
 * **プロンプト改善の分母から正常な業務の終わりを外せません**。
 *
 * 画面の文言を直すときは**ここも一緒に直すこと**（当たらなければ自由記入として
 * そのまま残るので、記録は壊れませんが分類だけが効かなくなります）。
 */
const DELETE_REASON_LABEL_TO_CODE: Record<string, NextActionDeleteReason> = {
  '対応済み': 'done',
  'もう済んだ': 'done',
  '案件が停止': 'project_stopped',
  '案件が止まった': 'project_stopped',
  'AI の見当違い': 'ai_wrong',
  'AIの見当違い': 'ai_wrong',
};

export function normalizeDeleteReason(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const [head, ...rest] = s.split('/');
  const picked = (head ?? '').trim();
  const code = (NEXT_ACTION_DELETE_REASONS as readonly string[]).includes(picked)
    ? picked
    : DELETE_REASON_LABEL_TO_CODE[picked] ?? null;
  if (code) {
    const free = rest.join('/').trim();
    return free ? `reason:${code} / ${free.slice(0, 500)}` : `reason:${code}`;
  }
  // 3択に当てはまらない自由記入だけの回。**捨てないで残す** — 何を書いたかは材料になる
  return s.slice(0, 500);
}

/**
 * 人がどこを直したかを残す（条件2）。
 *
 * ── before は「**AI が出したもの**」。直前の行の状態ではない ──────
 *
 * 議事録で実測して分かったのと同じ落とし穴です。「保存する直前の行」と比べると、
 * **一度保存してからもう一度直した分がすべて『無修正』になります**。
 * 比べる相手は `ai_outputs.payload_snapshot` = AI が出した中身そのもの。
 *
 * ── 7日窓 ────────────────────────────────────────────────────
 *
 * `findLatestAiOutput` の既定（7日）に乗ります。3か月後に次のアクションを
 * 書き換えたのは AI の誤りではなく、ふつうの業務更新です。
 */
/**
 * 鍵の並びを揃えて JSON 文字列にする（比較のためだけに使う）。
 *
 * **JSONB は鍵を並べ替えて保存します**（書いた並びと読み出す並びが違う）。
 * いまは比べる両側とも JSONB 経由なので並びは揃いますが、
 * **そこに寄りかかった比較は、片側が JS のオブジェクトのまま来た日に黙って壊れます**
 * — 中身が同じでも別物と判定され、差分が全部「人が直した」になります。
 */
export function stableJson(v: unknown): string {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) out[k] = walk(o[k]);
      return out;
    }
    return x;
  };
  return JSON.stringify(walk(v));
}

/**
 * 人が整えた本文を**膨らませたか**（書き足したか）。
 *
 * 構造（`body_struct`）は行ごとの対応が取れない（並びも件数も変わる）ので、
 * **画面に出る文字量**で見ます。2割以上増えていれば「AI が落としたものを
 * 人が足した」= 追記、それ以外は取り違えの直し。
 *
 * 判定が外れても失われるのは**分類の細かさだけ**（件数は必ず残る）なので、
 * 読めない値では `false`（＝今までどおり `fix`）に倒します。
 */
function structGrew(before: unknown, after: unknown): boolean {
  const b = activityStructLength(normalizeActivityStruct(before));
  const a = activityStructLength(normalizeActivityStruct(after));
  return b > 0 && a >= b * 1.2;
}

/**
 * 取込（MCP）で AI が書いたものを、人がどう直したかの差分を作る。**純関数**。
 *
 * ── なぜ `description` を数えるのが要るか ──────────────────────
 *
 * 整形側（`ACTIVITY_FORMAT_KIND`）の差分は `body_struct` などを見ていて、
 * **`description`（元の本文）を1度も見ていません**。ところが取込メールでは
 * **その本文を書いたのが AI**（取込スキルの Claude）です。
 * ここを数えないと、「本文が短い」という**上流の失敗だけが計測の外**に残ります。
 *
 * ── 整形側と二重に数えないための線引き ────────────────────────
 *
 * 数えるのは**取込 AI が書いた4つだけ**です。`body_struct` / `body_html` は
 * 整形器の仕事なので、こちらでは触りません（`kind` が別なので集計は混ざりませんが、
 * 同じ失敗を2つの kind で数えると、どちらを直せばよいか分からなくなる）。
 *
 * ネットワークにも DB にも触らないので素で試せます
 * （`shared/tests/activityIntakeDiff.test.ts`）。
 */
export function intakeDiffs(
  ai: Record<string, unknown>, after: Record<string, unknown>,
): CorrectionInput[] {
  const norm = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
  const FIELDS = ['subject', 'description', 'next_action', 'next_action_date'] as const;
  const diffs: CorrectionInput[] = [];

  /*
   * ⚠️ **整形器が埋めた値を、取込 AI の成績に数えない**（Codex レビューでの指摘・PR #717）。
   *
   * `mergeFormatted` は**行の `next_action` が空のときだけ**、本文から読み取った
   * 「次にやること」とその期限を埋めます（`activity-format.service`）。つまり
   * 取込が空で出したあとに値が入っていても、**それは整形器が書いたもの**です。
   *
   * ここを数えると、人が件名だけ直した最初の保存で、**機械が足した値まで
   * 「人が書き足した」として積まれます**。しかも一度積むと
   * `hasCorrections` が真になるので、**あとの本物の修正が永久に記録されません**。
   *
   * だから「次にやること」系は**取込 AI が値を出していたときだけ**比べます。
   * 取込が空だったぶんの取りこぼし（人があとから足した分）は数えられなくなりますが、
   * **整形器の仕事を取込のせいにするより、数えないほうがまし**です。
   *
   * `subject` / `description` は整形器が触らない（件名は上書きしない・本文は
   * 1バイトも触らない）ので、空から埋まったぶんも取込の取りこぼしとして数えます。
   */
  const FORMATTER_FILLS = new Set<string>(['next_action', 'next_action_date']);

  for (const col of FIELDS) {
    const b = norm(ai[col]);
    const a = norm(after[col]);
    if (b === a) continue;
    if (b === '' && FORMATTER_FILLS.has(col)) continue;   // 整形器が埋めた（上の注意書き）
    diffs.push({
      fieldPath: col,
      before: ai[col] ?? null,
      after: after[col] ?? null,
      /*
       * 値 → 空 は丸ごと捨てられた = 不採用。それ以外は
       * **書き足し（AI が落とした）と書き換え（AI が取り違えた）**を分ける。
       * `description` がよく書き足されるなら、直すのは整形器ではなく
       * **取込の contract（本文を要約するな）**のほうです。
       */
      type: a === '' ? 'reject' : classifyTextCorrection(ai[col], after[col]),
    });
  }

  // **1つも直っていない = 正解ラベル。** 無いと「無修正採用率」の分母が壊れる
  if (diffs.length === 0) return [{ fieldPath: '(全体)', type: 'none' }];
  // 直さなかった項目も残す（分母）
  for (const col of FIELDS) {
    if (diffs.some((d) => d.fieldPath === col)) continue;
    diffs.push({ fieldPath: col, type: 'none' });
  }
  return diffs;
}

/**
 * 取込の差分を記録する（条件2）。**best-effort** — 記録に失敗しても保存は壊さない。
 *
 * ⚠️ **`ai_formatted` を条件にしません。** 整形の差分（`recordActivityCorrections`）は
 * 整えた行だけが対象ですが、**取込の本文は整形される前から人に直されます**
 * （待ち行列に入ったまま案件詳細で直す）。条件を付けると、
 * **いちばん早く直された回＝いちばん強い信号**が落ちます。
 */
export async function recordIntakeCorrections(
  id: string, after: Record<string, unknown>, userId: string | null,
  explicitReject = false,
): Promise<void> {
  const out = await findLatestAiOutput('activity_logs', id, ACTIVITY_INTAKE_KIND);
  if (!out) return;
  /*
   * ⚠️ **削除のときだけ早期 return を素通りさせる**（会社方針スキルの設計監査）。
   *
   * 早期 return は「よく開かれる案件ほど精度が高く見える」のを防ぐ正しい仕掛けですが、
   * **削除は編集より後に来ます**（まず件名や本文を直して保存 → 後日いらなくなって削除）。
   * 現実の順序では**削除だけが確実に捨てられる**ので、そこだけ通します。
   *
   * 二重積みは `replaceCorrections`（同じ `output_id` × `field_path` は最後の1行だけ残す）が
   * 潰すので、通しても件数は膨らみません。
   */
  if (!explicitReject && await hasCorrections(out.id)) return;
  await replaceCorrections(
    out.id, intakeDiffs((out.payload ?? {}) as Record<string, unknown>, after), userId,
  );
}

export async function recordActivityCorrections(
  id: string, after: Record<string, unknown>, userId: string | null,
): Promise<void> {
  const out = await findLatestAiOutput('activity_logs', id, ACTIVITY_FORMAT_KIND);
  if (!out) return;
  const ai = (out.payload ?? {}) as Record<string, unknown>;

  const norm = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
  const diffs: CorrectionInput[] = [];
  /*
   * ⚠️ **`body_html` は比べません**（設計監査での指摘）。
   *
   * 整形の `payload_snapshot` に **`body_html` という鍵はそもそも存在しません**
   * （入っているのは `original` / `subject` / `body_struct` / `next_action` /
   * `next_action_date` / `coverage`）。そのため人が本文を HTML で書き直すと
   * `before=''` → `after=<html>` になり、`classifyTextCorrection` が
   * **`enrich`（AI が落としたものを人が足した）と誤ラベル**します。
   *
   * 実際に起きているのは「構造を捨てて人が書き直した」= `reject` で、
   * しかも同じ編集が `body_struct` の `reject` としても積まれ**二重に数えられます**。
   *
   * 誤った `enrich` は無害ではありません — 「整形が短すぎる」という読み方が
   * 既に助言（`thinAdvice`）に組み込まれているので、**AI を無用に長文化させます**。
   * 手動編集は `body_struct` 1項目の `reject` だけで表すこと。
   */
  const fields: [string, string][] = [
    ['subject', 'subject'],
    ['next_action', 'next_action'],
    ['next_action_date', 'next_action_date'],
  ];
  for (const [aiKey, rowKey] of fields) {
    const b = norm(ai[aiKey]);
    const a = norm(after[rowKey]);
    if (b === a) continue;
    diffs.push({
      fieldPath: rowKey,
      before: ai[aiKey] ?? null,
      after: after[rowKey] ?? null,
      /*
       * 空 → 値 は「AI が拾えなかったものを人が足した」= 追記。
       * 値 → 空 は丸ごと捨てられた = 不採用。
       * 値 → 別の値 は取り違え = 誤り。**混ぜると直す先が分からない**。
       *
       * ⚠️ **AI の文を残したまま人が書き足した場合も追記です**
       * （`classifyTextCorrection`）。ここを全部 `fix` にしていたので、
       * 「整形が短くて人が足している」が**どの数字にも出ませんでした**。
       */
      type: a === '' ? 'reject' : classifyTextCorrection(ai[aiKey], after[rowKey]),
    });
  }
  // 要点は行ごとの対応が取れない（並びが変わる）ので、丸ごと1項目として扱う
  const beforePoints = JSON.stringify(ai.key_points ?? []);
  const afterPoints = JSON.stringify(after.key_points ?? []);
  if (beforePoints !== afterPoints) {
    diffs.push({
      fieldPath: 'key_points',
      before: ai.key_points ?? null,
      after: after.key_points ?? null,
      type: beforePoints === '[]' ? 'enrich' : 'fix',
    });
  }
  // 本文の構造（migration 188）も丸ごと1項目。**鍵の並びを揃えてから比べる**。
  //
  // いまは両側とも JSONB を読んだもので、**JSONB は鍵を並べ替えて保存する**
  // （`{v, subtitle, turns, lead}` → `{v, lead, turns, subtitle}`。実測）ため
  // 並びは揃っています。ただし**それに寄りかかると、片側を JS の
  // オブジェクトのまま渡す経路が1つ増えた日に、1文字も直していない行が
  // 全部「直した」に数えられます**（無修正採用率が意味を失う）。
  // 並びに依存しない比較にしておくこと。
  const beforeStruct = stableJson(ai.body_struct ?? null);
  const afterStruct = stableJson(after.body_struct ?? null);
  if (beforeStruct !== afterStruct) {
    diffs.push({
      fieldPath: 'body_struct',
      before: ai.body_struct ?? null,
      after: after.body_struct ?? null,
      /*
       * **人が書き足したのか、直したのかを分ける**（上の本文と同じ理由）。
       * 構造は行ごとの対応が取れないので、**画面に出る文字量**で見ます
       * （`activityStructLength`）。2割以上増えていれば、AI が
       * **落としたものを人が足した**＝整形が短すぎたという信号です。
       */
      type: beforeStruct === 'null' ? 'enrich'
        : afterStruct === 'null' ? 'reject'
          : structGrew(ai.body_struct, after.body_struct) ? 'enrich' : 'fix',
    });
  }

  // **`body_html` は分母にも入れない**（上の注意書き。比べていない項目を
  // 「直されなかった」と数えると、無修正採用率が実際より高く出る）
  const all = ['subject', 'body_struct', 'next_action', 'next_action_date', 'key_points'];
  if (diffs.length === 0) {
    // **無修正で通した**ことを残す。これが正解ラベルで、
    // 無いと「無修正採用率」の分母が壊れる
    // （前の保存で積んだ項目ごとの行は `replaceCorrections` が一緒に消す）
    await replaceCorrections(out.id, [{ fieldPath: '(全体)', type: 'none' }], userId);
    return;
  }
  // 直さなかった項目も残す（分母）
  for (const col of all) {
    if (diffs.some((d) => d.fieldPath === col)) continue;
    diffs.push({ fieldPath: col, type: 'none' });
  }
  await replaceCorrections(out.id, diffs, userId);
}

/**
 * 同じ出力に**積み直す**（同じ `output_id` × `field_path` は最後の1行だけ残す）。
 *
 * ── なぜ要るか（設計監査での指摘）────────────────────────────
 *
 * 着手前は保存のたびに**まるごと積み直して**いました。本文を Notion のように
 * 手で編集できるようにすると**保存回数が桁違いに増える**ので、
 * 1回の編集で `(全体) none` や `body_struct reject` が何十行も積まれ、
 * **無修正採用率（`as_is_rate`）と「よく直される項目」の両方が壊れます**。
 *
 * ⚠️ **差分が1つでも出たら `(全体) none` は消します。** 残ると
 * **同じ出力に「無修正」と「修正あり」が同居**し、集計がどちらとも読めなくなります。
 *
 * 記録の失敗で保存を止めないのは `recordCorrections` と同じ（best-effort）。
 */
async function replaceCorrections(
  outputId: string, diffs: CorrectionInput[], userId: string | null,
): Promise<void> {
  if (!diffs.length) return;
  const paths = [...new Set(diffs.map((d) => d.fieldPath))];
  // 差分が1つでもあるなら「無修正で通した」ラベルは嘘になるので一緒に消す
  const hasReal = diffs.some((d) => d.type !== 'none');
  if (hasReal) paths.push('(全体)');
  try {
    /*
     * ⚠️ **差分が1つも無い回は、その出力の行を全部消してから積む**（#727 の Codex 指摘）。
     * 一度直してから AI の値へ全部戻したとき、`(全体)` だけ消すと前の保存の
     * `fix`/`reject` が残り、**同じ出力が「直した」と「無修正」の両方に数えられます**
     * （`as_is_rate` とよく直される項目が両方狂う）。項目名を並べて消す形にすると、
     * 比べる項目を足した日に消し漏れるので、出力ごと消す。
     */
    await execute(
      hasReal
        ? 'DELETE FROM ai_corrections WHERE output_id = ? AND field_path = ANY(?::text[])'
        : 'DELETE FROM ai_corrections WHERE output_id = ?',
      hasReal ? [outputId, paths] : [outputId],
    );
  } catch (e) {
    // 消せなくても積む。**信号が残らないより、少し重複するほうがまし**
    console.warn('[activity] correction cleanup failed (non-blocking):', (e as Error).message);
  }
  await recordCorrections(outputId, diffs, userId);
}

/**
 * **人が明示的に「違う」と言った操作**を、時効なしで `reject` として1行残す。
 *
 * 対象は2つだけ:
 *   `next_action` … 次のアクションを削除した（AI がやることを拾いすぎた）
 *   `body_struct` … 本文を手で書き直して AI の構造を捨てた（「整え直す」と同じ）
 *
 * ⚠️ **`before` は「AI が出したもの」**（`payload_snapshot` の該当鍵）です。
 * 行の直前の状態ではありません — 一度保存してから消した分が全部「無修正」に
 * なってしまうのを避けるため（このファイルの `recordActivityCorrections` と同じ作法）。
 *
 * ⚠️ **AI が値を出していない出力には積みません。** 人が手で書いたやることを
 * 消しただけの回に `reject` を積むと、**AI が一度も関わっていない行の削除で
 * AI の成績が下がります**（画面が AI の印を出すのと表裏）。
 *
 * @param kinds 引き直す `ai_outputs.kind`（削除は整形・取込の**両方**）
 */
export async function recordExplicitReject(
  id: string, field: 'next_action' | 'body_struct', kinds: string[],
  userId: string | null, note: string | null,
): Promise<void> {
  for (const kind of kinds) {
    try {
      const out = await findLatestAiOutput('activity_logs', id, kind, NO_WINDOW_DAYS);
      if (!out) continue;
      const before = ((out.payload ?? {}) as Record<string, unknown>)[field];
      // 中身が無いものを「不採用」にしても**何も否定していない**（分母だけ増える）
      if (before === null || before === undefined || String(before).trim() === '') continue;
      await replaceCorrections(
        out.id, [{ fieldPath: field, before, after: null, type: 'reject', note }], userId,
      );
    } catch (e) {
      console.warn('[activity] explicit reject record failed (non-blocking):', kind, (e as Error).message);
    }
  }
}

/**
 * 延期を `next_action_date` の `fix` として残す（条件2）。
 *
 * `recordExplicitReject` と同じく**時効なし・整形と取込の両方**。
 * 違いは種別が `fix`（値の取り違え）であることと、`after` に延期先が入ること —
 * 「いつからいつへ動かしたか」が分からないと、プロンプトの
 * 「期限の読み取り」をどちらへ直せばよいか決められません。
 *
 * @param before 延期する前に行に入っていた期限（AI の値が引けなければこれを使う）
 */
export async function recordPostponeCorrection(
  id: string, before: string | null, after: string, userId: string | null,
): Promise<void> {
  for (const kind of [ACTIVITY_FORMAT_KIND, ACTIVITY_INTAKE_KIND]) {
    const out = await findLatestAiOutput('activity_logs', id, kind, NO_WINDOW_DAYS);
    if (!out) continue;
    const payload = (out.payload ?? {}) as Record<string, unknown>;
    // **AI が期限を置いた行だけ**を数える。人が自分で入れた期限を自分で延ばしたのは
    // AI の誤りではない（「正常な業務更新を誤りと数える」を踏まない）
    const aiDate = payload.next_action_date;
    if (aiDate === null || aiDate === undefined || String(aiDate).trim() === '') continue;
    await replaceCorrections(out.id, [{
      fieldPath: 'next_action_date',
      before: aiDate ?? before ?? null,
      after,
      type: 'fix',
      note: 'postponed',
    }], userId);
  }
}

