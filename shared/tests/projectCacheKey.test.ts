/**
 * **案件を保存したのに、開いた詳細が保存前の姿のまま**にならないことの検査
 *
 * ── 実際に起きたこと ────────────────────────────────────────
 *
 * 案件作成のレールから**ネタ案件**を選び、AI が埋められなかった
 * 「客入れの有無」と「案件分類」を入れて `案件にする（与件化）` を押すと、
 * サーバーには正しく入る（実 Postgres で確認済み）のに、
 * そのあと開く案件詳細は **案件分類「その他」・ステージ「E 問合せ」**という
 * **保存前の姿**を出していました。
 *
 * 原因は鍵の取り違えです:
 *
 *   ・レールは `useIntakeSeed` が `GET /projects/:id` を
 *     **`['project', <id>]`** に載せる（詳細画面・直す画面と**同じ鍵**）
 *   ・保存後に落としていたのは **`['projects']`（一覧）** だけ
 *   ・react-query は鍵の**前方一致**で落とすので、
 *     `'projects'` と `'project'` は**別の文字列＝別の鍵**。当たらない
 *   ・共通の `staleTime` は 60 秒なので、詳細画面は
 *     読み直さずに**古い姿をそのまま出す**
 *
 * ── なぜ検査を置くか ────────────────────────────────────────
 *
 * **型検査にも lint にも出ません**（どちらも正しい配列です）。画面には
 * 「案件にしました」と出たうえで古い値が並ぶので、押した人には
 * **保存できなかった**ようにしか見えず、しかも**読み込み直すと直っている**ため
 * 「再現しない」で片づけられます。いちばん見つけにくい壊れ方です。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QueryClient } from '@tanstack/react-query';

const ROOT = join(__dirname, '..', '..');
const USE_CREATE_PROJECT = join(
  ROOT, 'client', 'src', 'contexts', 'sales', 'pages', 'projectNew', 'useCreateProject.ts',
);

describe('react-query の鍵の当たり方', () => {
  it("['projects'] を落としても ['project', id] には当たらない", async () => {
    const qc = new QueryClient();
    qc.setQueryData(['project', 'p1'], { id: 'p1', project_category: null });
    qc.setQueryData(['projects'], [{ id: 'p1' }]);

    await qc.invalidateQueries({ queryKey: ['projects'] });

    // 一覧は落ちる
    expect(qc.getQueryState(['projects'])?.isInvalidated).toBe(true);
    // **1件の鍵は落ちない。** ここが今回の不具合そのもの
    expect(qc.getQueryState(['project', 'p1'])?.isInvalidated).toBe(false);
    qc.clear();
  });

  it("['project', id] を名指しで落とせば当たる", async () => {
    const qc = new QueryClient();
    qc.setQueryData(['project', 'p1'], { id: 'p1', project_category: null });
    qc.setQueryData(['project', 'p2'], { id: 'p2', project_category: null });

    await qc.invalidateQueries({ queryKey: ['project', 'p1'] });

    expect(qc.getQueryState(['project', 'p1'])?.isInvalidated).toBe(true);
    // 関係のない案件は落とさない（開いている別のタブを無駄に読み直させない）
    expect(qc.getQueryState(['project', 'p2'])?.isInvalidated).toBe(false);
    qc.clear();
  });
});

describe('案件作成の3つの決め方（useCreateProject）', () => {
  const src = readFileSync(USE_CREATE_PROJECT, 'utf8');

  it("保存したあと ['project', id] を落としている", () => {
    expect(src).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\['project',\s*projectId\]\s*\}\)/);
  });

  it('落とす関数を引数なしで呼んでいる場所が無い', () => {
    /*
     * `invalidate()` と書けると、**書いた本人も含めて誰も気づけません** —
     * 一覧だけ新しくなり、開いた1件だけが古いまま出ます。
     * 3つの決め方（案件にする／ネタのまま残す／見送りにする）は
     * どれも1件の行を書き換えるので、必ず id を渡します。
     */
    expect(src).not.toMatch(/\binvalidate\(\s*\)/);
    // 3つの決め方すべてが渡していること
    expect(src.match(/\binvalidate\((?!\s*\))/g)?.length).toBe(3);
  });
});
