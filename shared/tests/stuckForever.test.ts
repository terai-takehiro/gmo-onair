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
const MCP = code(read('server', 'src', 'contexts', 'mcp', 'tools', 'mytasks.tools.ts'));
const TASKS_PAGE = code(read('client-daily', 'src', 'pages', 'TasksPage.tsx'));
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
    expect(SCHEDULER).toMatch(/if \(rows\.length >= KPT_PER_NIGHT\) \{[\s\S]{0,200}console\.warn/);
  });
});

describe('録音の投入 — 止まった行を失敗として見せる', () => {
  it('⚠️ 止まったかどうかは SQL で数える（JS で日付を組み立て直さない）', () => {
    // pg は `timestamp` を `Date` で返すので、
    // `String(row.created_at).replace(' ', 'T')` は必ず `Invalid Date` になる。
    // 実測: `String(v)` = `Sat Aug 15 2026 10:53:12 GMT+0000 (…)` → `Date.parse` は NaN
    expect(INTAKE).not.toMatch(/new Date\(String\(row\.created_at\)/);
    expect(INTAKE).toMatch(/i\.created_at < NOW\(\) - \(INTERVAL '1 millisecond' \* \$\{TRANSCRIBE_STALE_MS\}\)\) AS stuck/);
  });

  it('詳細も一覧も同じ1か所を通す', () => {
    // 前の版は詳細だけが判定を呼んでおり、**同じ投入が一覧と詳細で違う状態**に見えた
    expect(INTAKE).toMatch(/function toIntake\(row: Record<string, unknown>\): TaskIntake/);
    expect(INTAKE).toMatch(/return toIntake\(row\);/);          // 詳細
    expect(INTAKE).toMatch(/const list = rows\.map\(toIntake\);/); // 一覧
  });

  it('判定用の列は応答から落とす', () => {
    expect(INTAKE).toMatch(/const \{ stuck, \.\.\.rest \}/);
  });

  it('⚠️ 「失敗だけ」で絞っても止まった行が出る', () => {
    // DB には `transcribing` のまま残っているので、SQL にそのまま渡すと
    // **いちばん取り出したい行が1件も出ない**（実測: 前の版は 0 件、この版は 1 件）
    expect(INTAKE).toMatch(/asked === 'failed' \|\| asked === 'transcribing'/);
    expect(INTAKE).toMatch(/i\.status IN \('failed', 'transcribing'\)/);
    expect(INTAKE).toMatch(/list\.filter\(\(r\) => r\.status === asked\)/);
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
      expect(TASKS_PAGE).toMatch(new RegExp(`${k}: '`));
    }
  });

  it('型もサーバーと同じ5つ', () => {
    expect(TASKS_API).toMatch(/'pending' \| 'committed' \| 'discarded' \| 'transcribing' \| 'failed'/);
  });

  it('失敗した理由を行に出す', () => {
    // 出さないと「録音したのに何も出てこない」で終わり、録り直すかどうかも決められない
    expect(TASKS_PAGE).toMatch(/it\.status === 'failed'/);
    expect(TASKS_PAGE).toMatch(/it\.error_message \?\?/);
  });
});
