/**
 * **待たせる経路が nginx の 60 秒を超える／一緒にできたものに気づけない**（投入口）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * **①解析が 60 秒を超えうる。** 「1回 30 秒だから nginx の 60 秒より十分手前」と
 * 書いてありましたが、**実際に掛かりうるのは 4 倍**でした:
 * SDK に `maxRetries: 1` を渡しているので**1回の呼び出しが 2 回**になり、
 * さらに**軽いモデルで落ちたら上位モデルでやり直す**ので **30 × 2 × 2 = 120 秒**。
 * nginx の `/api/` は `proxy_read_timeout` を書いていないので**既定の 60 秒で切れます**。
 * 切れると押した人には**「押しても何も起きない」**としか見えず、
 * しかもサーバー側では解析が続いていて**費用は掛かっています**。
 *
 * **②一緒にできたものに気づけない。** 「2件以上できたら遷移しない」は
 * **ネタの数**で数えていたので、**ネタ1件 ＋ タスク3件**の回は案件へ飛びます。
 * 「案件（ネタ） 1件・タスク 3件を登録しました」は**その画面の状態**なので、
 * 飛んだ瞬間に消えます — **タスク3件が登録されたことはどこにも出ません**。
 *
 * ── 実測 ────────────────────────────────────────────────────
 *
 * | | 掛かる時間 |
 * | --- | --- |
 * | 前の版の最悪 | **120 秒**（nginx に切られる） |
 * | この版の最悪 | **40 秒** |
 * | 軽いモデルが落ちてやり直す | 13 秒 |
 * | ふつう（軽いモデルで成功） | 3 秒 |
 *
 * v4 の PR で指摘された形です（#76）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

/** 説明文を外してから探す（前の版の形が注釈に書いてあるため） */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const INTAKE_AI = code(read('server', 'src', 'contexts', 'tasks', 'services', 'intake-ai.service.ts'));
const MINUTES_AI = code(read('server', 'src', 'contexts', 'sales', 'services', 'minutes-ai.service.ts'));
const TASKS_ROUTES = code(read('server', 'src', 'contexts', 'dailyops', 'routes', 'tasks.routes.ts'));
const USE_INTAKE = code(read('client', 'src', 'contexts', 'tasks', 'components', 'intake', 'useIntake.ts'));


/**
 * 総枠の効き方。**実装と同じ式**をここに置いて数字で確かめます
 * （画面を立てずに試せるうえ、上限を変えたときに最悪値が動くのが見える）。
 */
const TOTAL_BUDGET_MS = 45_000;
const TIMEOUT_MS = 20_000;
const RETRY_FLOOR_MS = 8_000;

/**
 * `beforeMs` = AI を呼ぶ前に掛かった時間（担当者一覧・案件候補・過去の傾向）。
 * **総枠の起点は「この仕事を始めた時刻」**なので、ここも枠を食います
 * （AI の呼び出しだけを数えると、前段が遅い日に 60 秒を超えます）。
 */
function simulate(o: {
  lightFails: boolean; lightTakesMs: number; heavyTakesMs: number; beforeMs?: number;
}) {
  let t = o.beforeMs ?? 0;
  const remaining = () => TOTAL_BUDGET_MS - t;
  const cap = () => Math.min(TIMEOUT_MS, Math.max(1_000, remaining()));
  t += Math.min(o.lightTakesMs, cap());
  if (!o.lightFails) return { total: t, retried: false };
  if (remaining() < RETRY_FLOOR_MS) return { total: t, retried: false };
  t += Math.min(o.heavyTakesMs, cap());
  return { total: t, retried: true };
}

describe('待たせる解析が nginx の 60 秒を超えない', () => {
  it('最悪でも 60 秒より手前で終わる', () => {
    const worst = simulate({ lightFails: true, lightTakesMs: 60_000, heavyTakesMs: 60_000 });
    expect(worst.total).toBe(40_000);
    expect(worst.total).toBeLessThan(60_000);
    // 前の版: 30 秒 × SDK の2回 × light→heavy の2回 = 120 秒
    expect(30_000 * 2 * 2).toBeGreaterThan(60_000);
  });

  it('ふつうの回は今までどおり速い', () => {
    expect(simulate({ lightFails: false, lightTakesMs: 3_000, heavyTakesMs: 0 }).total).toBe(3_000);
    expect(simulate({ lightFails: true, lightTakesMs: 4_000, heavyTakesMs: 9_000 }).total).toBe(13_000);
  });

  it('残りが足りなければやり直さない（切られるのに費用だけ掛かる）', () => {
    // 前段が遅い日: 候補の読み込みに 20 秒 ＋ 軽いモデルが上限まで粘る
    const r = simulate({ lightFails: true, lightTakesMs: 60_000, heavyTakesMs: 9_000, beforeMs: 20_000 });
    expect(r.retried).toBe(false);
    expect(r.total).toBe(40_000);
  });

  it('総枠の起点は「この仕事を始めた時刻」（AI を呼ぶ前も数える）', () => {
    expect(TASKS_ROUTES).toMatch(/const startedAt = Date\.now\(\);/);
    expect(TASKS_ROUTES).toMatch(/advice, projects, attachments, startedAt,/);
  });

  it('総枠と1回ぶんの上限を名前で持つ', () => {
    expect(INTAKE_AI).toMatch(/const TIMEOUT_MS = 20_000;/);
    expect(INTAKE_AI).toMatch(/const TOTAL_BUDGET_MS = 45_000;/);
    expect(INTAKE_AI).toMatch(/const RETRY_FLOOR_MS = 8_000;/);
    expect(INTAKE_AI).toMatch(/const remaining = \(\) => TOTAL_BUDGET_MS - \(Date\.now\(\) - startedAt\);/);
    expect(INTAKE_AI).toMatch(/if \(remaining\(\) < RETRY_FLOOR_MS\) \{/);
  });

  it('⚠️ SDK に黙って2回呼ばせない', () => {
    // `maxRetries: 1` を残すと、上の総枠が意味を失う
    expect(INTAKE_AI).toMatch(/new OpenAI\(\{ timeout: timeoutMs, maxRetries: 0 \}\)/);
    expect(INTAKE_AI).toMatch(/new Anthropic\(\{ timeout: timeoutMs, maxRetries: 0 \}\)/);
    expect(INTAKE_AI).not.toMatch(/maxRetries: 1/);
  });
});

describe('録りながらの下読みは「短く諦める」を守る', () => {
  it('やり直しの回数を呼ぶ側が決められる', () => {
    // 既定は 1（裏で走る長い文字起こしは、一時的な 5xx で録音を捨てたくない）
    expect(MINUTES_AI).toMatch(/maxRetries\?: number;/);
    expect(MINUTES_AI).toMatch(/maxRetries: opts\.maxRetries \?\? 1/);
  });

  it('⚠️ 待たせる下読みはやり直さない（20 秒が 40 秒になる）', () => {
    expect(TASKS_ROUTES).toMatch(/\{ timeoutMs: PREVIEW_STT_TIMEOUT_MS, maxRetries: 0 \}/);
  });
});

describe('一緒にできたものを黙らせない', () => {
  it('⚠️ 遷移するのは「できたものが1件だけ」のとき', () => {
    // 前の版は**ネタの数**で数えていたので、ネタ1件 ＋ タスク3件でも飛んでいた。
    // 飛ぶと「タスク 3件を登録しました」の帯ごと画面が消える
    expect(USE_INTAKE).toMatch(
      /const jumps = opts\.canOpenProject && netas\.length === 1 && created\.length === 1;/);
    expect(USE_INTAKE).toMatch(/if \(jumps\) navigate\(`\/sales\/projects\/\$\{netas\[0\]\.id\}`\);/);
  });

  it('飛ばないときは案件へのリンクを並べる', () => {
    expect(USE_INTAKE).toMatch(/setCreatedProjects\(opts\.canOpenProject && !jumps \? netas : \[\]\);/);
  });
});
