/**
 * **AI の指標と費用を信じられる形に保つ**（会社方針「AI を使い捨てにしない」）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * どれも**画面を見ても気づけません**。むしろ**それらしい数字が出る**のが厄介です:
 *
 * ・受入率が 0% でも「AI がまだ下手なのだ」と読めてしまう
 *   （本当は**うまくいった回だけ記録していない**）
 * ・AI が自分で直した分まで「人の修正」に混ざると、
 *   **直すほど修正率が上がる**ので、改善したのか悪化したのか分からない
 * ・落ちた呼び出しの費用は請求書にだけ出て、**画面の合計には出ません**
 * ・下読みの長さは**どこにも表示されない**ので、20 秒のつもりで
 *   5 分まるごと送っていても誰も気づきません
 *
 * v4 の PR で繰り返し指摘された形です（#52 / #75 / #79）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const FEEDBACK = read('server', 'src', 'contexts', 'sales', 'services', 'project-ai-feedback.service.ts');
const INTAKE = read('server', 'src', 'contexts', 'tasks', 'services', 'task-intake.service.ts');
const INTAKE_AI = read('server', 'src', 'contexts', 'tasks', 'services', 'intake-ai.service.ts');
const MINUTES = read('server', 'src', 'contexts', 'sales', 'services', 'minutes.service.ts');
const RECORDER = read('client', 'src', 'contexts', 'tasks', 'components', 'intake', 'Recorder.tsx');

describe('AI の指標が汚れない', () => {
  it('直さずに承認したことを記録する（受入率の分子）', () => {
    // 差分は「直したときだけ」書くので、これが無いと**永久に 0%**（#52）
    expect(FEEDBACK).toMatch(/export async function recordProjectAccepted/);
    // 二度積まない（開くたびに積むと、よく開かれる案件ほど精度が高く見える）
    expect(FEEDBACK).toMatch(/if \(await hasCorrections\(output\.id\)\) return;/);
    const routes = read('server', 'src', 'contexts', 'sales', 'routes', 'projects.routes.ts');
    // 1件ずつの確認とまとめての確認、**両方の入口**から記録する
    expect(routes.match(/recordProjectAccepted\(/g) ?? []).toHaveLength(2);
  });

  it('AI が自分で直した分を人の修正として数えない', () => {
    // MCP は人が居ないとき `config.mcpActorId` で呼ぶ（#52）
    expect(FEEDBACK).toMatch(/if \(userId === config\.mcpActorId\) return;/);
  });

  it('投入口から作った議事録は、議事録の出力に差分を書く', () => {
    // 投入口の出力を持たせると、議事録の直しが**投入口の指標に混ざる**（#75）
    const at = INTAKE.indexOf('議事録。**原文をそのまま');
    const body = INTAKE.slice(at, at + 2200);
    expect(body).toMatch(/kind: MINUTES_KIND/);
    expect(body).toMatch(/minutesOutputId, null, null, userId, userId,/);
    expect(body).not.toMatch(/intake\.ai_output_id, null, null/);
  });
});

describe('AI の費用が実際より安く見えない', () => {
  it('軽いモデルで落ちた回も使用量に残す', () => {
    // やり直して成功すると、**落ちた1回目が消えていた**（#79）
    const at = INTAKE_AI.indexOf('if (!useLight) throw e;');
    expect(INTAKE_AI.slice(at, at + 900)).toMatch(/recordAiUsage\(\{[\s\S]*ok: false/);
  });

  it('議事録の文字起こし・整形が落ちた回も使用量に残す', () => {
    // 文字起こしは**分**で課金されるので、途中で落ちても払っていることがある（#79）
    const at = MINUTES.indexOf("console.error('[minutes] transcription failed:'");
    expect(MINUTES.slice(at, at + 900)).toMatch(/recordAiUsage\(\{[\s\S]*ok: false/);
  });

  it('録りながらの下読みは 20 秒ぶんだけ送る', () => {
    /*
     * 前の版は止めた直後に必ず録り直していたので、間隔が 5 分になったあとは
     * **5 分まるごと**を送っていました（＝打合せを丸ごと2回文字にする）。
     * 画面には「費用を抑えるため 5 分ごと」と出るのに、**送る長さは
     * どこにも出ない**ので気づけません（#79）。
     */
    expect(RECORDER).toMatch(/peekStartedAt\.current = elapsed\.current;/);
    expect(RECORDER).toMatch(/if \(t - peekStartedAt\.current >= PREVIEW_SEC\) p\.stop\(\);/);
    // `onstop` の中で録り直さない（ここが録りっぱなしの原因だった）
    const at = RECORDER.indexOf('mr.onstop = () => {\n        peek.current = null;');
    expect(at).toBeGreaterThan(0);
    expect(RECORDER.slice(at, at + 400)).not.toMatch(/startPeek\(\)/);
  });
});

describe('添付が黙って消えない', () => {
  it('写真を縮めている間は送れない', () => {
    // 縮めるのは非同期。選んですぐ押すと `files` はまだ空で、
    // **添付の無い解析が走る**（押した人は付けたつもり）（#79）
    const hook = read('client', 'src', 'contexts', 'tasks', 'components', 'intake', 'useIntake.ts');
    expect(hook).toMatch(/preparingFiles: preparing > 0/);
    expect(hook).toMatch(/&& preparing === 0 && !submit\.isPending/);
    /*
     * ⚠️ **押せなくするだけでは足りない**（実ブラウザで測って分かった）。
     * `disabled` は描き直しが1回入ってから効くので、**選んだのと同じ瞬間に
     * 押すと素通り**する（実測: 添付 0 件で送られた）。送る側が待つこと。
     */
    expect(hook).toMatch(/await preparePromise\.current;/);
    // 待ったあとに**古い `files`** を読むと、結局 0 件のまま送る
    expect(hook).toMatch(/const attached = filesRef\.current;/);
    // **押せない理由を画面に出す**（黙って押せないと壊れて見える）
    const composer = read('client', 'src', 'contexts', 'tasks', 'components', 'intake', 'IntakeComposer.tsx');
    expect(composer).toMatch(/写真を準備しています/);
  });
});
