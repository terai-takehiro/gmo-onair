/**
 * **通知の「ゴミ」を作らない仕掛けを固定する**
 * （ユーザーの指摘「入金予定日を超えているものだけ通知するように／ゴミ通知が多い」）
 *
 * ── なぜ試験を書くか ────────────────────────────────────────
 *
 * ⚠️ **どれも「画面を見ても気づけない」種類の間違いです。**
 * 督促は毎朝ちゃんと届くので、届いている限り誰も壊れているとは思いません。
 * 気づけるのは「1か月ぶん溜まったベルを数えたとき」か、
 * 「請求書を出していない売上に督促が来ていると経理が言ったとき」だけです。
 *
 * ここで固定するのは3つ:
 *   ①定時実行が**「未入金」を自前に定義していない**（`billing-state.ts` を読む）
 *   ②督促が**節目**（`reminderBucket`）に乗っていて、`ref_date` に今日を入れていない
 *   ③設定画面の `JOB_LABELS` に**全ジョブぶんの日本語名**がある
 *     （足し忘れると英字の内部キーが画面に出る。実際に3本出ていた）
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const SCHEDULER = join(ROOT, 'server', 'src', 'contexts', 'platform', 'services', 'scheduler.service.ts');
const NOTIFY_PAGE = join(ROOT, 'client', 'src', 'contexts', 'platform', 'pages', 'notify', 'NotifyPage.tsx');

/** 注釈を外してから探す（この製品は前の版の形を説明として残す決めごと） */
function readCode(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const scheduler = readCode(SCHEDULER);

describe('⚠️ 「未入金」を定時実行が自前に定義していない', () => {
  /*
   * ここが本丸です。定時実行は長らく `paid_date IS NULL` だけを見ており、
   * **請求書をまだ出していない売上まで「入金が遅れています」と督促して**いました。
   * 出していない売上の期日超過は「お客様が遅れている」ではなく
   * **こちらが請求していない**という別の話で、押しても入金は来ません
   * （`billing-state.ts` / `billing.routes.ts` の `overdue` の説明）。
   */
  it('共通の式（`billing-state.ts`）を import している', () => {
    expect(scheduler).toMatch(/import \{ BILLING_STATE_SQL \} from '.*billing-state'/);
  });

  it('未入金の督促は `BILLING_STATE_SQL.unpaid` を組み立てて使う', () => {
    expect(scheduler).toMatch(/AND \$\{BILLING_STATE_SQL\.unpaid\}/);
  });

  it('請求書未発行の督促は `BILLING_STATE_SQL.unissued` を使う（対象が排他になる）', () => {
    // 真偽が逆なので、同じ売上が「請求書がまだ」と「入金が遅れ」の両方に出ることはない。
    // 直す前は同じ朝に2通届いていた
    expect(scheduler).toMatch(/AND \$\{BILLING_STATE_SQL\.unissued\}/);
  });

  it('入金の条件を手で書き写していない', () => {
    expect(scheduler).not.toMatch(/paid_date IS NULL/);
    expect(scheduler).not.toMatch(/invoice_issued IS NOT TRUE/);
  });
});

describe('⚠️ 督促を毎朝出さない（節目に乗せる）', () => {
  it('`reminderBucket` を import している', () => {
    expect(scheduler).toMatch(/import \{ reminderBucket, REMINDER_CADENCE_TEXT \} from '.*reminder-bucket'/);
  });

  it('督促3本が `refDate` に節目を入れている（`refDate: today` が残っていない）', () => {
    /*
     * `refDate: today` だと、一意索引（人 × ひな形 × 対象 × ref_date）が
     * **毎日別の行を許す** — 解消するまで毎朝1通ずつ永久に届きます。
     * 期限前通知（tk_due）や前日案内（bk_remind_todo）は「その日1回きり」の
     * できごとなので `today` のままでよい。ここで見るのは督促の3本だけ。
     */
    for (const tpl of ['inv_late', 'inv_send_todo', 'eq_return']) {
      const block = scheduler.slice(scheduler.indexOf(`templateId: '${tpl}',`));
      const push = block.slice(0, block.indexOf('});'));
      expect(push, tpl).toMatch(/refDate: bucket/);
      expect(push, tpl).not.toMatch(/refDate: today/);
    }
  });

  it('週報のまとめ通知は `refId` を NULL にしない', () => {
    /*
     * ⚠️ **Postgres の一意索引は NULL 同士を別物として扱います。**
     * まとめ通知には「対象の1行」が無いからと `refId` を NULL にすると、
     * `uq_notifications_dedup` が毎回別の行として通し、重複排除が効きません
     * （「いま流す」を押すたびに増える）。固定文字列にすること。
     */
    expect(scheduler).toMatch(/refId: 'digest'/);
    expect(scheduler).toMatch(/refDate: `weekly:\$\{oldest\}:\$\{n\}`/);
  });

  it('督促の宛先から `system_admin` 全員を外している', () => {
    // 権限の管理者であって経理でも機材担当でもない。届いても動けない人のベルに毎日積む
    const narrowed = scheduler.match(/usersWithPermission\([^)]*includeAdmins: false[^)]*\)/g) ?? [];
    expect(narrowed.length).toBe(4);   // inv_late / eq_return / inv_send_todo / weekly_unreviewed
    // できごと型（依頼・コメント等）の宛先は**変えていない**（既定は今までどおり足す）
    expect(readCode(join(ROOT, 'server', 'src', 'contexts', 'platform', 'services', 'notification.service.ts')))
      .toMatch(/opts\.includeAdmins === false \? \[\] : await queryAll/);
  });

  it('督促は `sales:editor` ではなく `manager` に出す', () => {
    // editor は「フルアクセスの正規メンバー」＝実質全社。督促は動ける人に出す
    expect(scheduler).not.toMatch(/usersWithPermission\('sales', 'editor'\)/);
    expect(scheduler).not.toMatch(/usersWithPermission\('equipment', 'editor'\)/);
    expect(scheduler).not.toMatch(/usersWithPermission\('dailyops', 'editor'\)/);
  });
});

// ───────────────────────────────────────────────────────────
// ③ 設定画面に英字の内部キーを出さない
// ───────────────────────────────────────────────────────────

/** `scheduler.service.ts` の `JOBS` に並んでいるジョブキーを取り出す */
function schedulerJobKeys(): string[] {
  const start = scheduler.indexOf('const JOBS: Job[] = [');
  expect(start, 'JOBS の配列が見つからない').toBeGreaterThan(-1);
  const block = scheduler.slice(start, scheduler.indexOf('\n];', start));
  const keys: string[] = [];
  for (const m of block.matchAll(/key: '([a-z_0-9]+)'/g)) keys.push(m[1]);
  /*
   * 月次の3本は定数で書いてある。**定義元から値を引く**（ここに写すとずれる）。
   *
   * ⚠️ **知らない定数名が来たら、その場で落とすこと。** 前は `consts[...]` が
   * `undefined` のまま `readFileSync` に渡っており、月次の仕事を1本足した日に
   * **試験ファイルごと読み込みに失敗**していた（`TypeError: path must be a string`）。
   * そうなると③だけでなく①②の見張りも一緒に黙るので、ここで名指しで止める。
   */
  const consts: Record<string, string> = {
    AI_REVIEW_JOB_KEY: join(ROOT, 'server', 'src', 'contexts', 'qsheet', 'ai', 'monthly-review.service.ts'),
    SALES_AI_REVIEW_JOB_KEY: join(ROOT, 'server', 'src', 'contexts', 'sales', 'services', 'sales-ai-review.service.ts'),
    WIKI_REVIEW_JOB_KEY: join(ROOT, 'server', 'src', 'contexts', 'wiki', 'services', 'wiki-review.service.ts'),
  };
  for (const m of block.matchAll(/key: ([A-Z_]+),/g)) {
    expect(consts[m[1]], `${m[1]} の定義元をこの表に足してください`).toBeTypeOf('string');
    const src = readFileSync(consts[m[1]], 'utf8');
    const v = new RegExp(`export const ${m[1]} = '([^']+)'`).exec(src);
    expect(v, `${m[1]} の定義が見つからない`).not.toBeNull();
    keys.push(v![1]);
  }
  return keys;
}

/** 設定画面の `JOB_LABELS` に並んでいるキーを取り出す */
function pageLabelKeys(): string[] {
  const src = readCode(NOTIFY_PAGE);
  const start = src.indexOf('const JOB_LABELS: Record<string, string> = {');
  expect(start, 'JOB_LABELS が見つからない').toBeGreaterThan(-1);
  const block = src.slice(start, src.indexOf('\n};', start));
  return [...block.matchAll(/^ {2}([a-z_0-9]+):/gm)].map((m) => m[1]);
}

describe('⚠️ 定時実行の名前が画面から抜け落ちない', () => {
  /*
   * `JOB_LABELS` は「ひな形を持たない仕事だけ」の表として作られたが、
   * **「直近の記録」の行はジョブキーで引く**（ひな形の id とは別物）ので、
   * 名前が無いキーは**英字のまま画面に出ます**。実際に `project_tidy` /
   * `ai_review_production_draft` / `sales_ai_review` の3本が出ていました。
   * 足し忘れは目視では気づけない（設定画面を開く人が少ない）ので機械で見ます。
   */
  const jobs = schedulerJobKeys();
  const labels = new Set(pageLabelKeys());

  it('ジョブが1本以上読めている（読み取りが壊れたら試験ごと無意味になる）', () => {
    expect(jobs.length).toBeGreaterThanOrEqual(14);
    expect(jobs).toContain('inv_late');
    expect(jobs).toContain('sales_ai_review');
  });

  for (const key of jobs) {
    it(`\`${key}\` に日本語の名前がある`, () => {
      expect(labels.has(key)).toBe(true);
    });
  }

  it('画面はジョブキーを1か所（`jobLabel`）でだけ名前に直す', () => {
    // 前は「チップ」と「直近の記録」が別々の引き方をしており、片方だけ外れていた
    const src = readCode(NOTIFY_PAGE);
    expect(src).toMatch(/function jobLabel\(/);
    expect(src.match(/jobLabel\(/g)?.length).toBeGreaterThanOrEqual(3);   // 定義 ＋ 2 か所
  });
});

describe('どの通知が誰に・どのくらいの頻度で出るかが画面から読める', () => {
  it('サーバーが宛先と頻度を渡す（画面に第2の説明を持たせない）', () => {
    expect(scheduler).toMatch(/key: j\.key, at: j\.at, templateId: j\.templateId, sendTo: j\.sendTo, cadence: j\.cadence/);
  });

  it('画面が宛先と頻度を描く', () => {
    const src = readCode(NOTIFY_PAGE);
    expect(src).toMatch(/\{j\.sendTo\}/);
    expect(src).toMatch(/\{j\.cadence\}/);
  });
});
