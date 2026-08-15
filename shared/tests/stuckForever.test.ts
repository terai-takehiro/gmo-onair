/**
 * **止まったものが、止まったまま誰にも見えなくなる**（KPT の下書き・録音の投入）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * この2件は**画面に何も出ません**。出ないので誰も報告しません:
 *
 * ・**KPT の下書き**は「昨日終わった案件」を 20 件だけ見ていました。
 *   同じ日に 21 件以上終わる週（大きなイベントの前後では普通に起きます）では、
 *   **21 件目からは一生作られません** — 仕事は日に1回で、翌日はまた
 *   「その日の昨日」を見るので、**取りこぼしは二度と拾われません**
 * ・**録音の投入**は、サーバーが途中で再起動すると `transcribing` のまま残ります。
 *   復帰の判定（`withStaleCheck`）はありましたが、**pg が `timestamp` を
 *   `Date` で返す**ので `String(...).replace(' ', 'T')` が
 *   `SatTAug 15 2026 …` になり、**必ず `Invalid Date`**。
 *   早期に返していたので**一度も失敗として見せたことがありません**でした
 *
 * v4 の PR で指摘された形です（#83 / #77）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

/**
 * **説明文を外してから探す。** この製品は「前の版がどう間違っていたか」を
 * コードのすぐ横に書き残す決めごとなので、素の文字列検索だと
 * **注釈に書いた古い形**に当たって、直っているのに落ちます
 * （`wrongNumbers.test.ts` / `droppedColumns.test.ts` と同じ理由）。
 */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** SQL の中の `--` も落とす（テンプレート文字列の中に書いてある） */
const sql = (s: string) => code(s).replace(/^\s*--.*$/gm, '');

const SCHEDULER = sql(read('server', 'src', 'contexts', 'platform', 'services', 'scheduler.service.ts'));
const INTAKE = sql(read('server', 'src', 'contexts', 'tasks', 'services', 'task-intake.service.ts'));
const KPT = code(read('server', 'src', 'contexts', 'sales', 'services', 'kpt.service.ts'));
const MCP = code(read('server', 'src', 'contexts', 'mcp', 'tools', 'mytasks.tools.ts'));
/**
 * **投入ログは `TasksPage.tsx` から切り出してあります**（`check-file-size` が
 * 1,000 行超のファイルに足すことを止めるため。中身は移しただけ）。
 */
const INTAKE_TAB = code(read('client-daily', 'src', 'pages', 'tasks', 'IntakeLogTab.tsx'));
const TASKS_API = code(read('client-daily', 'src', 'lib', 'tasksApi.ts'));

describe('KPT の下書き — 1晩で切ったぶんを翌晩に拾う', () => {
  it('窓で引く（「昨日ちょうど」に固定しない）', () => {
    // 実測: 同じ日に 25 件終わったとき **1晩目 20 件**。
    // 前の版は翌晩「その日の昨日」を見るので、**残り5件は 0 件**（二度と拾われない）。
    // この版は窓（7日）なので**翌晩に残り5件**が出る
    expect(SCHEDULER).toMatch(/BETWEEN \? AND \?/);
    expect(SCHEDULER).not.toMatch(/NULLIF\(p\.event_start, ''\)\) = \?/);
  });

  it('古いものから片づける（新しい案件で毎晩の枠を埋めない）', () => {
    expect(SCHEDULER).toMatch(/ORDER BY ended_on ASC/);
    expect(SCHEDULER).toMatch(/LIMIT \?/);
  });

  it('1晩の上限とさかのぼる日数を名前で持つ', () => {
    expect(SCHEDULER).toMatch(/const KPT_PER_NIGHT = \d+;/);
    expect(SCHEDULER).toMatch(/const KPT_LOOKBACK_DAYS = \d+;/);
    expect(SCHEDULER).toMatch(/shiftDate\(today, -KPT_LOOKBACK_DAYS\)/);
  });

  it('⚠️ 切ったことを黙らせない', () => {
    // 黙って切ると「作られない案件がある」ことに誰も気づけない
    expect(SCHEDULER).toMatch(/leftOver > 0 \|\| rows\.length >= KPT_SCAN_MAX/);
    expect(SCHEDULER).toMatch(/console\.warn\('\[scheduler\] kpt_draft:'/);
  });

  /**
   * ⚠️ **この PR のレビューで指摘された P1**。**引いた行で数えると、
   * AI を呼ばずに諦める案件が毎晩いちばん古い側の枠を全部埋め**、
   * 新しい案件は窓（7日）から出るまで一度も下書きが作られません
   * （古い順に並べたこの版だけが持つ壊れ方 — 前の版は毎日対象が入れ替わっていた）。
   */
  it('⚠️ 上限は「AI を呼んだ回数」で数える（引いた行数ではない）', () => {
    expect(SCHEDULER).toMatch(/\[from, yesterday, KPT_SCAN_MAX\]/);
    expect(SCHEDULER).not.toMatch(/\[from, yesterday, KPT_PER_NIGHT\]/);
    expect(SCHEDULER).toMatch(/if \(calls >= KPT_PER_NIGHT\) \{ leftOver = rows\.length - i; break; \}/);
    expect(SCHEDULER).toMatch(/if \(aiCalled\) calls \+= 1; else passed \+= 1;/);
  });

  it('AI を呼ぶ前に諦めたかどうかを下書き側が返す', () => {
    // 呼ぶ前の2通り（未確認の下書きが残っている／材料が1件も無い）は**費用ゼロ**。
    // 呼んだあとの「書けることが無い」は**費用が掛かっている**ので数える
    expect(KPT).toMatch(/Promise<\{ created: number; skipped\?: string; aiCalled: boolean \}>/);
    expect(KPT).toMatch(/created: 0, aiCalled: false, skipped: '確かめていない下書きが残っています/);
    expect(KPT).toMatch(/created: 0, aiCalled: false, skipped: 'この案件には、下書きの材料/);
    expect(KPT).toMatch(/created: 0, aiCalled: true, skipped: '材料からは書けること/);
    expect(KPT).toMatch(/return \{ created: items\.length, aiCalled: true \};/);
  });
});

describe('録音の投入 — 止まった行を失敗として見せる', () => {
  it('⚠️ 止まったかどうかは SQL で数える（JS で日付を組み立て直さない）', () => {
    // pg は `timestamp` を `Date` で返すので、
    // `String(row.created_at).replace(' ', 'T')` は必ず `Invalid Date` になる。
    // 実測: `String(v)` = `Sat Aug 15 2026 10:53:12 GMT+0000 (…)` → `Date.parse` は NaN
    expect(INTAKE).not.toMatch(/new Date\(String\(row\.created_at\)/);
    expect(INTAKE).toMatch(/i\.created_at < NOW\(\) - \(INTERVAL '1 millisecond' \* \$\{TRANSCRIBE_STALE_MS\}\)/);
    expect(INTAKE).toMatch(/\$\{STUCK_SQL\} AS stuck/);
  });

  it('詳細も一覧も同じ1か所を通す', () => {
    // 前の版は詳細だけが判定を呼んでおり、**同じ投入が一覧と詳細で違う状態**に見えた
    expect(INTAKE).toMatch(/function toIntake\(row: Record<string, unknown>\): TaskIntake/);
    expect(INTAKE).toMatch(/return toIntake\(row\);/);          // 詳細
    expect(INTAKE).toMatch(/return rows\.map\(toIntake\);/);       // 一覧
  });

  it('判定用の列は応答から落とす', () => {
    expect(INTAKE).toMatch(/const \{ stuck, \.\.\.rest \}/);
  });

  it('⚠️ 「失敗だけ」で絞っても止まった行が出る', () => {
    // DB には `transcribing` のまま残っているので、SQL にそのまま渡すと
    // **いちばん取り出したい行が1件も出ない**（実測: 前の版は 0 件、この版は 1 件）
    expect(INTAKE).toMatch(/AND \(i\.status = 'failed' OR \$\{STUCK_SQL\}\)/);
    expect(INTAKE).toMatch(/AND i\.status = 'transcribing' AND NOT \$\{STUCK_SQL\}/);
  });

  /**
   * ⚠️ **この PR のレビューで指摘された P2**。読んでから絞ると **`LIMIT` が先に効く**ので、
   * いま録っている新しい投入が 50 件あるだけで**「失敗だけ」が空になります**
   * （古い失敗は 51 件目より後ろに居る）。**実測: 前の版 0 件 → この版 1 件**。
   */
  it('絞るのは SQL の中（読んでから絞らない）', () => {
    expect(INTAKE).toMatch(/return rows\.map\(toIntake\);/);
    expect(INTAKE).not.toMatch(/list\.filter\(\(r\) => r\.status === asked\)/);
    // 判定の式は1か所（2か所に書くと片方だけ直る）
    expect(INTAKE).toMatch(/const STUCK_SQL =/);
    expect((INTAKE.match(/i\.created_at < NOW\(\) -/g) ?? []).length).toBe(1);
  });

  it('MCP からも録音の2つで絞れる', () => {
    // ここに無いと、止まった投入は**どの絞り込みでも取り出せない**
    expect(MCP).toMatch(/z\.enum\(\['pending', 'committed', 'discarded', 'transcribing', 'failed'\]\)/);
  });
});

describe('投入ログ（日常業務）— 英語のまま出さない', () => {
  it('状態の日本語は5つとも書く', () => {
    // 応答は `as TaskIntake[]` で受けるので**型チェックには出ない**。
    // 抜けていた2つは `?? it.status` に落ちて **`transcribing` と英語で**出ていた
    for (const k of ['pending', 'committed', 'discarded', 'transcribing', 'failed']) {
      expect(INTAKE_TAB).toMatch(new RegExp(`${k}: '`));
    }
  });

  it('型もサーバーと同じ5つ', () => {
    expect(TASKS_API).toMatch(/'pending' \| 'committed' \| 'discarded' \| 'transcribing' \| 'failed'/);
  });

  it('失敗した理由を行に出す', () => {
    // 出さないと「録音したのに何も出てこない」で終わり、録り直すかどうかも決められない
    expect(INTAKE_TAB).toMatch(/it\.status === 'failed'/);
    expect(INTAKE_TAB).toMatch(/it\.error_message \?\?/);
  });
});
