/**
 * **確定した記録は後から変わらない／確かめていないものを確定に混ぜない**
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * どれも**画面を見ても気づけません**:
 *
 * ・確定した週報に行が増えても、開けば**その行がふつうに並んでいる**だけです
 *   （読んで確定した人の記憶と食い違うまで分かりません）
 * ・終わった棚卸しの印が変わっても、**数えた紙と突き合わせるまで**分かりません
 * ・AI の未確認の下書きが資料に載っても、**それらしい文が並ぶ**だけです
 * ・受注にした瞬間に放送種別が消えても、**欄が空になる**だけで理由が残りません
 *
 * v4 の PR で繰り返し指摘された形です（#57 / #83 / #61）。
 * **決めごとが画面の側にしか無い**と、別の画面・MCP・直接叩きで通ります。
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const OPS = read('server', 'src', 'contexts', 'dailyops', 'services', 'ops-report.service.ts');
const PROJECT = read('server', 'src', 'contexts', 'sales', 'services', 'project.service.ts');
const KPT = read('server', 'src', 'contexts', 'sales', 'services', 'kpt.service.ts');
const KEEP = read('server', 'src', 'contexts', 'sales', 'services', 'keep-report.service.ts');
const INVENTORY = read('server', 'src', 'contexts', 'equipment', 'services', 'inventory.service.ts');

describe('確定した記録を守る', () => {
  it('確定した週報には足せない・直せない・消せない', () => {
    // 画面（`WeeklyDetailPage` の `editable`）は止めていたのに、
    // **ニュースの「週報へ送る」・MCP・直接叩き**は素通りしていた（#57）
    expect(OPS).toMatch(/export function isReportLocked/);
    for (const fn of ['addItems', 'updateItem', 'deleteItem']) {
      const at = OPS.indexOf(`async ${fn}(`);
      expect(OPS.slice(at, at + 900)).toMatch(/assertReportOpen\(/);
    }
    // AI の再実行が**確定した本文を書き換えて**いた
    const up = OPS.indexOf('async upsertReport');
    expect(OPS.slice(up, up + 2600)).toMatch(/assertReportOpen\(existing\)/);
  });

  it('⚠️ 守るのは週報だけ（ニュースは `published` が「閲覧型」の印）', () => {
    // 種類で分けずに塞ぐと、**デイリーニュースが1行も書けなくなる**
    expect(OPS).toMatch(/const LOCKING_KINDS: readonly string\[\] = \['weekly_activity'\]/);
  });

  it('確定を解く口がある（塞いだ先を行き止まりにしない）', () => {
    expect(OPS).toMatch(/async reopenReport\(/);
    // 一度出した事実は記録なので `published_at` は消さない
    expect(OPS).toMatch(/status = 'draft', reviewed_at = NULL, reviewed_by = NULL/);
    expect(read('server', 'src', 'contexts', 'dailyops', 'routes', 'reports.routes.ts'))
      .toMatch(/router\.post\('\/reports\/:id\/reopen'/);
    // 押す前に止める（ニュース側は送り先の週報の状態を見る）。
    // v4.5.26 で日別ページ→月表示に作り替えた際、月をまたぐと行ごとに送り先の週が
    // 違うため、判定はページ単位（旧 `DailyNewsPage.tsx` の `weekly.data?.status`）
    // から**行ごと**（サーバーが計算する `weekly_locked`）に移した。
    expect(OPS).toMatch(/kind = 'weekly_activity' AND status = 'published'/);
    expect(read('client-daily', 'src', 'pages', 'news', 'NewsRows.tsx'))
      .toMatch(/weeklyLocked = !!item\.weekly_locked/);
  });

  it('週報の記録者に UUID を入れない', () => {
    // `recorded_by` は**画面にそのまま出る名前**の列（#57）
    const at = OPS.indexOf('async sendItemToWeekly');
    expect(OPS.slice(at, at + 2600)).toMatch(/userName \?\? src\.recorded_by \?\? null/);
  });

  it('受注で GLS を採るとき、渡されなかった項目は書き換えない', () => {
    // `changeStage` は `{}` で呼ぶので、常に書くと**放送種別・媒体が消える**（#57）
    expect(PROJECT).toMatch(/if \(data\.broadcast_type !== undefined\)/);
    expect(PROJECT).toMatch(/if \(data\.media_platform !== undefined\)/);
  });

  it('確かめていない AI の下書きは資料の一覧に出さない', () => {
    // 出す先を間違えないこと — **案件詳細のふりかえりでは全部見える**（#83）
    expect(KPT).toMatch(/AND \(k\.ai_generated = FALSE OR k\.confirmed_at IS NOT NULL\)/);
    const at = KEEP.indexOf('async listEventReports');
    expect(KEEP.slice(at, at + 1800)).toMatch(/confirmedOnly: true/);
    const one = KEEP.indexOf('async getEventReportWithProject');
    expect(KEEP.slice(one, one + 900)).not.toMatch(/confirmedOnly/);
  });

  /**
   * ⚠️ **この直下にあった「消えた列（旧 `highlights`）を画面が読んでいない」試験は
   * 削除した。** `KeepReportPage.tsx` 自体を v4 の要件未定によりご指示で削除した
   * ため（`docs/changelog.d/` 参照）、対象のファイルが無くなった。列を読んでいた
   * 画面が無くなったので、この試験が守っていた壊れ方はもう起こり得ない。
   */

  /**
   * ⚠️ **見つけたのは、上の直しを実サーバーで測っていたとき**です。
   * 断り文を丁寧に書いたのに、画面に届いていたのは `VALIDATION_ERROR` の6文字でした。
   *
   * `AppError` は `(状態, コード, 文)` の順ですが、日常業務の 6 ファイル・35 か所が
   * **逆に渡して**いて、`error.message` にコードが入っていました。
   * 画面（`notifyApiError`）は `error.message` をそのまま出すので、
   * **理由も直し方も一度も表示されていなかった**ことになります。
   * 型が通る（どちらも `string`）ので、型検査にも lint にも出ません。
   */
  it('AppError の引数の順は (状態, コード, 文)', () => {
    const files = execSync(
      "grep -rlE \"new AppError\\(\" server/src --include=*.ts",
      { cwd: ROOT, encoding: 'utf8' },
    ).trim().split('\n');
    const swapped: string[] = [];
    for (const f of files) {
      read(...f.split('/')).split('\n').forEach((line, i) => {
        // 第2引数が大文字のコードでないものを探す（文が先に来ている）
        if (/new AppError\(\d+, (?:'[^A-Z']|`)/.test(line)) swapped.push(`${f}:${i + 1}`);
      });
    }
    expect(swapped).toEqual([]);
  });

  it('終わった棚卸しには印を付けられない', () => {
    // PC はボタンを止めていたが、**スマホもサーバーも見ていなかった**（#61）
    const at = INVENTORY.indexOf('async updateItem(');
    const body = INVENTORY.slice(at, at + 1600);
    expect(body).toMatch(/check\.status === INVENTORY_STATUS\.COMPLETED/);
    expect(body).toMatch(/もう一度開く/); // 断る文に**直し方**を書く
    const mobile = read('client-equipment', 'src', 'pages', 'inventory', 'MobileScanSession.tsx');
    expect(mobile).toMatch(/const closed = detail\?\.status === 'completed'/);
    // 列に積む手前で止める（溜めてから断られると気づくのが遅れる）
    const hook = read('client-equipment', 'src', 'pages', 'inventory', 'useScanQueue.ts');
    expect(hook).toMatch(/if \(closed\) \{/);
    // 断られたものを列から外さないと「送れていません」が永久に消えない
    expect(hook).toMatch(/drop: \(err\) =>/);
  });
});
