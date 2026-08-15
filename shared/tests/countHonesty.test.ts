/**
 * **絞り込んだ結果を「全N件」と言い切らない**（案件一覧）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * 案件一覧の既定は**いま属する半期**です。これは**絞り込み**なのに、
 * 件数の文は **「全4件を表示しています」** と出していました。
 *
 * **実測**（実 Postgres ＋ 実ブラウザ・375px）: 未削除の案件は **46 件**、
 * この窓に入るのは **4 件**。「全」は**それしか無い**という言い切りなので、
 * **42 件が隠れていることに誰も気づけません**。期間は上の枠に出ていますが、
 * それを「絞り込み」として読むかどうかは人によります。
 *
 * → **絞り込みが1つでも効いているときは「全」を外し、絞り込み中だと書く。**
 *
 * ⚠️ **数えていない総数を作りません。**「46 件のうち 4 件」と書くには
 * 絞り込み無しでもう一度数える必要があり、それは**押していない問い合わせ**です。
 *
 * v4 の PR で指摘された形です（#65）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

/** 説明文を外してから探す（前の版の形が注釈に書いてあるため） */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PAGE = code(read('client', 'src', 'contexts', 'sales', 'pages', 'ProjectListPage.tsx'));
/** 件数とページ送りは別ファイル（一覧が 400 行を超えたので役割で分けた） */
const NAV = code(read('client', 'src', 'contexts', 'sales', 'pages', 'projectList', 'PageNav.tsx'));

describe('件数の文は「全」を名乗ってよいときだけ名乗る', () => {
  it('絞り込みの有無で言い方を変える', () => {
    expect(NAV).toMatch(/const all = filtered \? '' : '全';/);
    expect(NAV).toMatch(/const note = filtered \? '（絞り込み中）' : '';/);
  });

  it('1ページのときも複数ページのときも同じ判断を通す', () => {
    // 片方だけ直すと、ページが増えた瞬間に「全」が戻る
    expect((NAV.match(/\{all\}<span className="font-number">\{pagination\.total\}<\/span>件/g) ?? []).length).toBe(2);
  });

  it('⚠️ 判断のもとは画面がすでに持っている一覧（新しく数え直さない）', () => {
    // `activeFilters` は 0 件のときに「どれを外せば出るのか」を名指しするための一覧。
    // 同じものを使えば、**名指しできる絞り込みがあるときだけ**「全」が消える
    expect((PAGE.match(/filtered=\{activeFilters\.length > 0\}/g) ?? []).length).toBe(2);
  });

  it('既定の期間も絞り込みとして数える', () => {
    // `period.mode !== 'all'` なので、既定の半期でも `activeFilters` に載る
    expect(PAGE).toMatch(/period\.mode !== 'all' \? `実施日: \$\{periodLabel\(period\)\}` : null,/);
  });
});
