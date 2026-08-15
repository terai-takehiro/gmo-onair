/**
 * **拾わなかったものを黙らない**（投入口）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * 出ないと、投げた人は「**AI が読み落とした**」と思って**もう一度投げます**
 * — そして2回目も同じ行が落ちます。しかも:
 *
 * ・**打ったときは出るのに、録音だと出ない**という食い違いがありました
 *   （録音は裏で解析するので、その場の応答に載せても画面に届かない）
 * ・**添付は種類によって黙って捨てられて**いました（Anthropic は画像4種類だけ）。
 *   iPhone の写真（HEIC）を貼っても、AI は一度も見ていません
 *
 * v4 の PR で指摘された形です（#77 / #75）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const ROUTES = read('server', 'src', 'contexts', 'dailyops', 'routes', 'tasks.routes.ts');
const SERVICE = read('server', 'src', 'contexts', 'tasks', 'services', 'task-intake.service.ts');
const AI = read('server', 'src', 'contexts', 'tasks', 'services', 'intake-ai.service.ts');
const REVIEW = read('client', 'src', 'contexts', 'tasks', 'components', 'intake', 'IntakeReview.tsx');

describe('拾わなかったものを画面に出す', () => {
  it('録音から投げたぶんは行に残す（応答に載せても届かない）', () => {
    expect(SERVICE).toMatch(/warnings\?: \{ line: string; reason: string \}\[\]/);
    expect(SERVICE).toMatch(/SET raw_text = \?, drafts = \?::jsonb, ai_output_id = \?, warnings = \?::jsonb/);
    // 読み出しにも載せる（載せないと行に残しただけで終わる）
    expect(SERVICE).toMatch(/SELECT i\.id, i\.raw_text, i\.kind, i\.status, i\.drafts, i\.ai_output_id, i\.warnings/);
    expect(ROUTES).toMatch(/warnings: intakeWarnings\(a\.parsed\.skipped, a\.aiError, a\.droppedAttachments\)/);
  });

  it('列を足す migration がある', () => {
    const files = readdirSync(join(ROOT, 'server', 'src', 'shared', 'db', 'migrations'));
    const m = files.find((f) => f.startsWith('191_'));
    expect(m).toBeTruthy();
    expect(read('server', 'src', 'shared', 'db', 'migrations', m!))
      .toMatch(/ADD COLUMN IF NOT EXISTS warnings JSONB/);
  });

  it('読めなかった添付も同じ列に並べる', () => {
    // **落とすのは変えず、落としたことを返す**（#75）
    expect(AI).toMatch(/export function unreadableAttachments/);
    expect(ROUTES).toMatch(/この形式（\$\{d\.mime\}）は読めなかったので、AI に渡していません/);
  });

  /**
   * ⚠️ **相手ごとに違う、と思い込まないこと**（この PR のレビューで指摘された）。
   * 最初の版は Anthropic だけを見ていましたが、**主経路は OpenAI** です。
   * そちらへ HEIC を渡すと **400 で解析まるごとが規則ベースへ落ち**、
   * どのファイルが原因かは出ません＝**直そうとした形がそのまま残っていました**。
   */
  it('OpenAI でも規則ベースだけの環境でも、読めない添付を数える', () => {
    expect(AI).toMatch(/const AI_IMAGE_TYPES = \['image\/jpeg', 'image\/png', 'image\/gif', 'image\/webp'\]/);
    expect(AI).toMatch(/if \(!provider\) return false;\s+\/\/ 規則ベースは添付を1つも読まない/);
    // **読めないものは渡さない**（渡すと解析まるごとが落ちる）
    expect(AI).toMatch(/\.filter\(\(a\) => readableForProvider\(provider, a\.mime\)\)/);
  });

  it('規則ベースに落ちたことも並べる', () => {
    expect(ROUTES).toMatch(/規則ベースで読み取りました。行き先はすべてタスクになります/);
  });

  it('画面は応答と行の両方を見る', () => {
    // 片方だけ見ると「打つと出るのに、録音だと出ない」が残る
    expect(REVIEW).toMatch(/\[\.\.\.\(intake\.skipped \?\? \[\]\), \.\.\.\(intake\.warnings \?\? \[\]\)\]/);
    expect(REVIEW).toMatch(/\{notPicked\.length > 0 && \(/);
  });
});
