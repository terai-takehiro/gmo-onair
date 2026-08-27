/**
 * **台帳の一括編集で受注・失注へ動かせないか**を見る検査
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * `a_won`/`e_lost` への遷移は `changeStage()` を通ると
 * `recordStageTransition()`（履歴・`won_at`/`lost_at`）・GLS自動発番・
 * 失注理由の記録が付いてくる。`bulkUpdate()`（案件台帳の一括編集）は
 * これまでサーバー側のガードが無く、画面が `stage` を一括編集の対象に
 * 出さないよう自主規制しているだけだった — API を直接叩けば、履歴も
 * `lost_at` も無いまま `stage` だけを動かせてしまう
 * (docs/project-ledger-phase-c-design.md テーマ2 PR3)。
 *
 * 実 DB を立てずに検査したいので、`droppedColumns.test.ts` /
 * `silentDrop.test.ts` と同じ手法（サーバーのソースをテキストとして読み、
 * 正規表現でガードの実在を確かめる）を使う。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SOURCE = readFileSync(
  join(ROOT, 'server', 'src', 'contexts', 'sales', 'services', 'project.service.ts'),
  'utf8',
);

describe('bulkUpdate() は受注・失注へのステージ変更を拒む', () => {
  it('async bulkUpdate( が実在する', () => {
    expect(SOURCE).toMatch(/async bulkUpdate\(/);
  });

  it('set.stage が a_won または e_lost のとき VALIDATION_ERROR を throw する', () => {
    const at = SOURCE.indexOf('async bulkUpdate(');
    expect(at).toBeGreaterThan(-1);
    // 次のメソッド（create）が始まる手前までを bulkUpdate の本体とみなす
    const nextMethod = SOURCE.indexOf('async create(', at);
    const body = SOURCE.slice(at, nextMethod > -1 ? nextMethod : undefined);

    // ステージの一括更新そのものが生きていること（ガードだけ足して
    // 分岐ごと壊していないかの確認）
    expect(body).toMatch(/set\.stage.*STAGES\.includes\(set\.stage\)/);

    // a_won / e_lost だけを狙って止めていること。ガードの書き方が
    // `!==`（両方でないときだけ通す）でも `||`（どちらかなら止める）でも拾えるよう、
    // 「a_won と e_lost 両方への言及」＋「throw」の実在で確かめる
    const stageGuard = body.slice(body.indexOf("STAGES.includes(set.stage)"));
    expect(stageGuard).toMatch(/'a_won'/);
    expect(stageGuard).toMatch(/'e_lost'/);
    expect(stageGuard).toMatch(/throw new AppError\(400, 'VALIDATION_ERROR'/);
  });

  it('その他のステージ（neta 等）は従来どおり一括更新できる', () => {
    const at = SOURCE.indexOf('async bulkUpdate(');
    const nextMethod = SOURCE.indexOf('async create(', at);
    const body = SOURCE.slice(at, nextMethod > -1 ? nextMethod : undefined);
    // ガードを通り抜けたあとに setClauses へ積む代入が残っていること
    // （a_won/e_lost だけ弾いて、それ以外まで巻き込んでいないか）
    expect(body).toMatch(/setClauses\.push\('stage = \?'\); params\.push\(set\.stage\);/);
  });
});
