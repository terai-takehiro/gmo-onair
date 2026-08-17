/**
 * 受付（案件作成）の件数と、決めたあとの後始末
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * ご指摘は2つでした。**どちらもエラーが出ません**:
 *
 *  ① **「自動取込案件を確認」の数字と実数がまったく一致しない**
 *  ② **案件を見送りにしても全く反応しない**
 *
 * 原因はどちらも「同じものを2か所で別々に決めていた」ことです:
 *
 *  ① ダッシュボードのバッジは受信箱の**4種類の合計**（`counts.total`）を出し、
 *    押した先の案件作成は**2種類だけ**（`INTAKE_KINDS`）を並べていた。
 *    さらに件数を `rows.length` で出していたので `LIMIT` に当たると頭打ちになった
 *    （実測: バッジ 14 ／ レール 7。溜めると 実数 255 ／ バッジ 150）
 *  ② 「見送り」は `stage` を `e_lost` にするだけで、受付の一覧
 *    （`AI_INBOX_SQL`）は `ai_reviewed_at IS NULL` しか見ていなかったので
 *    **カードが残り続けた**（受注・完了まで進めても残っていた）
 *
 * 画面を見ても「数字が多いな」としか分からず、**押した人は壊れているとしか
 * 思えません**。離れたら落ちるところまでは機械に見させます。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INTAKE_KINDS, intakeCountOf } from '../../client/src/contexts/sales/pages/inbox/kinds';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

/** 説明文を外してから探す（前の版の形が注釈に書いてある） */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const COUNTS = {
  overdue_action: 3,
  ai_project: 5,
  inquiry: 2,
  finance_doc: 4,
  agreement: 1,
  total: 14,
};

describe('自動取込案件の件数は「押した先に並ぶもの」を数える', () => {
  it('レールに出す2種類だけを足す', () => {
    // 3 + 5 + 2 + 4 = 14 ではなく、5 + 2 = 7
    expect(intakeCountOf({ counts: COUNTS })).toBe(7);
  });

  it('⚠️ `counts.total` を足し直したものにはならない', () => {
    // ここが同じ値を返すようになったら、また4種類を数えている
    expect(intakeCountOf({ counts: COUNTS })).not.toBe(COUNTS.total);
  });

  it('数える種類はレールが出す種類と同じ1つの定義', () => {
    expect(INTAKE_KINDS).toEqual(['ai_project', 'inquiry']);
    // 種類を1つ足したら件数も自動で増える（写しを作ると必ず離れる）
    expect(intakeCountOf({ counts: { ...COUNTS, ai_project: 0, inquiry: 0 } })).toBe(0);
  });

  it('まだ読み込んでいないときは 0 ではなく null（0 件と紛らわしい）', () => {
    expect(intakeCountOf(undefined)).toBeNull();
  });

  it('知らない種類が増えても勝手に足さない', () => {
    expect(intakeCountOf({ counts: { ...COUNTS, some_new_kind: 99 } })).toBe(7);
  });

  it('ダッシュボードのバッジ（PC・スマホ）が同じ関数を通る', () => {
    for (const f of ['IntakeButton.tsx', 'MobileSalesDashboard.tsx']) {
      const src = code(read('client', 'src', 'contexts', 'platform', 'pages', 'salesDashboard', f));
      expect(src).toContain('intakeCountOf');
      // 4種類の合計に戻したら落とす
      expect(src).not.toMatch(/counts\??\.\??total/);
    }
  });
});

describe('件数は上限を掛けずに数える', () => {
  const routes = read('server', 'src', 'contexts', 'platform', 'routes', 'dashboard.routes.ts');

  it('4つのキューとも COUNT(*) で数える', () => {
    // `rows.length` に戻すと、LIMIT に当たった瞬間から数字が実数と別のものになる
    for (const base of ['OVERDUE_ACTIONS_COUNT_SQL', 'AI_INBOX_COUNT_SQL']) {
      expect(routes).toContain(base);
    }
    expect((routes.match(/SELECT COUNT\(\*\)::int AS c/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('一覧と件数は同じ WHERE から組む（写すと片方だけ直る）', () => {
    for (const base of ['OVERDUE_ACTIONS_BASE', 'AI_INBOX_BASE', 'AGREEMENT_BASE', 'INQUIRY_BASE', 'FINANCE_DOC_BASE']) {
      // 定義と、一覧・件数の2か所での参照＝最低3回出てくる
      expect((routes.match(new RegExp(base, 'g')) ?? []).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('並べた枚数は `shown` として別に返す（黙って切り詰めない）', () => {
    expect(routes).toMatch(/shown: \{/);
    const rail = read('client', 'src', 'contexts', 'sales', 'pages', 'projectNew', 'IntakeRail.tsx');
    // 出す数字は実数。並べきれなかった分は画面に書く
    expect(rail).toMatch(/const hidden = total !== null && total > shown \? total - shown : 0;/);
    expect(rail).toContain('ほかに {hidden} 件');
  });
});

describe('決めたら受付から消える', () => {
  const routes = read('server', 'src', 'contexts', 'platform', 'routes', 'dashboard.routes.ts');
  const service = read('server', 'src', 'contexts', 'sales', 'services', 'project.service.ts');

  it('受付に出すのはネタ行きだけ（ご判断）', () => {
    // 段が1つでも進んでいれば誰かが動かした＝仕分け済み。見送り (e_lost) も
    // 受注 (a_won) も完了 (s_completed) も、この1行で自動的に外れる。
    // ⚠️ 緩めると「決めても消えない行」が戻る（印が書かれていない古い行が残るため）
    const at = routes.indexOf('const AI_INBOX_BASE');
    expect(at).toBeGreaterThan(-1);
    expect(routes.slice(at, at + 900)).toMatch(/AND p\.stage = 'neta'/);
  });

  it('人がステージを動かしたら「確認済み」の印を押す', () => {
    expect(service).toContain('markAiReviewedByStageDecision');
    // ステージが変わったときだけ（同じ段への押し直しでは押さない）
    expect(service).toMatch(/if \(stageChanged\) \{[\s\S]{0,400}?markAiReviewedByStageDecision\(id, stage, userId\)/);
  });

  it('⚠️ AI 自身が動かしたときは押さない（誰も見ていないものが消える）', () => {
    const at = service.indexOf('private async markAiReviewedByStageDecision');
    expect(at).toBeGreaterThan(-1);
    const body = service.slice(at, at + 1600);
    expect(body).toMatch(/if \(userId === config\.mcpActorId\) return;/);
  });

  it('⚠️ 印が本当に付いたときだけ教師データを積む（RETURNING で確かめる）', () => {
    const at = service.indexOf('private async markAiReviewedByStageDecision');
    const body = service.slice(at, at + 1600);
    expect(body).toContain('RETURNING id');
    expect(body).toMatch(/if \(!marked\) return;/);
  });

  it('段が1つも動かないときは画面が印を押す（「ネタのまま残す」）', () => {
    // ネタをネタのままにする操作なので段が動かず、サーバー側の印も押されない。
    // 押さないと、読んで残すと決めたものが明日もレールの先頭に出続ける
    const hook = read('client', 'src', 'contexts', 'sales', 'pages', 'projectNew', 'useCreateProject.ts');
    const at = hook.indexOf('const saveExisting');
    expect(at).toBeGreaterThan(-1);
    const body = hook.slice(at, at + 700);
    expect(body).toMatch(/selection\.project\.stage !== stage/);
    expect(body).toMatch(/\} else \{[\s\S]{0,300}?\/ai-review/);
  });

  it('⚠️ 3つの決め方で扱いを分けない（分けた結果が今回の不具合）', () => {
    const hook = code(read('client', 'src', 'contexts', 'sales', 'pages', 'projectNew', 'useCreateProject.ts'));
    // `/ai-review` を叩くのは `saveExisting` の中の1か所だけ。
    // 決め方ごとに散らすと、また片方だけ受付から消える形に戻る
    expect((hook.match(/\/ai-review/g) ?? []).length).toBe(1);
  });

  it('⚠️ 見送りは「無修正で採用」に数えない（拾いすぎの指標が消える）', () => {
    const at = service.indexOf('private async markAiReviewedByStageDecision');
    const body = service.slice(at, at + 1600);
    expect(body).toMatch(/if \(stage !== 'e_lost'\) await recordProjectAccepted\(id, userId\);/);
    // 見送り側は `recordIntakeDecision(…'dropped')` が残す（`changeStage` の中）
    expect(service).toMatch(/recordIntakeDecision\(id, 'dropped', userId/);
  });
});

describe('押せるのに 403 にしない — 問い合わせの行き先を動かす口', () => {
  it('案件作成から叩くので sales でも通す', () => {
    // 受信箱は `dailyops` の reader にも問い合わせのカードを返す。案件作成の
    // 「ネタのまま残す」「見送りにする」はこの口を叩くので、`dailyops` の
    // editor だけを要求していると **sales:editor + dailyops:reader の人は必ず 403**
    const src = read('server', 'src', 'contexts', 'dailyops', 'routes', 'inbox.routes.ts');
    const at = src.indexOf("router.post('/inquiries/:id/state'");
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 160)).toContain("requireAnyPermission(['dailyops', 'sales'], 'editor')");

    // 画面側（`useCreateProject`）がこの口を叩いていること
    const hook = read('client', 'src', 'contexts', 'sales', 'pages', 'projectNew', 'useCreateProject.ts');
    expect(hook).toMatch(/dailyops\/inquiries\/\$\{[^}]+\}\/state/);
  });
});
