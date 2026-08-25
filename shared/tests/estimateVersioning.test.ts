/**
 * 見積の版上げ — **`draft`（下書き）から次の版を作っても、前の版は編集できたままにする**
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * `createNextVersion` は前の版を `superseded` にする UPDATE を持つ。以前は
 * 「`status` が `accepted` 以外なら」という条件で、**まだお客様に出していない
 * `draft` からでも無条件に `superseded` にしていた**。`update`/`replaceItems` は
 * `status = 'draft'` のときしか編集を許さないため、送っていない下書きから版を
 * 上げただけで元の下書きが編集不能になっていた（ユーザー指摘）。
 *
 * 「1案件を複数の見積に分ける（本編とケータリング等）」「並行して複数の版を作る」
 * ケースがあるので、**`sent`（お客様に出した版）から次の版を作ったときだけ**
 * 前の版を `superseded` にする。`draft` はそのまま残す（＝そのまま編集できる）。
 *
 * どちらも**画面を見ても気づけない**（版を重ねた直後は新しい版の入力欄が出るだけで、
 * 前の版が編集できなくなったことは前の版を開き直すまで分からない）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const ESTIMATE = read('server', 'src', 'contexts', 'sales', 'services', 'estimate.service.ts');

describe('見積の版上げ（createNextVersion）', () => {
  it('前の版を superseded にするのは sent からの版上げだけ', () => {
    const at = ESTIMATE.indexOf('async createNextVersion(');
    expect(at).toBeGreaterThan(-1);
    const body = ESTIMATE.slice(at, ESTIMATE.indexOf('async update(', at));

    // **`status = 'sent'` に絞ってあること。** 旧条件の `status <> 'accepted'` に
    // 戻っていないか（draft も rejected も superseded になってしまう旧バグ）を見る
    expect(body).toMatch(/UPDATE estimates SET status = 'superseded'[^`]*WHERE id = \$1 AND status = 'sent'/);
    expect(body).not.toMatch(/WHERE id = \$1 AND status <> 'accepted'/);
  });

  it('draft のときしか中身を直せない、という既存の守りは変えていない', () => {
    // createNextVersion 側で draft を supersede しなくなっても、
    // update/replaceItems 側の「draft だけ編集可」までは緩めていないことを確認する
    expect(ESTIMATE).toMatch(/if \(touchesContent && existing\.status !== 'draft'\)/);
    const at = ESTIMATE.indexOf('async replaceItems');
    const body = ESTIMATE.slice(at, at + 900);
    expect(body).toMatch(/existing\.status !== 'draft'/);
  });
});
