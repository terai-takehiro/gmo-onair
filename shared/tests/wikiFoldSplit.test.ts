/**
 * **折りたたみの切り分け**（`client-wiki/src/components/wiki/markdownSource.ts` の `splitFolds`）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * Wiki の本文は `rehype-raw` を**入れない**（本文に `<script>` や `onerror` が
 * 混ざっても素通しにしない。`docs/design/v4/wiki.md` §7-5）。そのため生の HTML は
 * 描かれずに**落ちる**。設計書の表にある「折りたたみ」（`<details><summary>`）だけは、
 * 元の文字列から形を見つけて自前の部品で描いている。
 *
 * ここを間違えると **本文が画面から黙って消える**:
 *  - 閉じ（`</details>`）を取り違えると、その先の本文ごと折りたたみの中に入る
 *  - 開きだけあって閉じが無い（書きかけ）のときに切り分けてしまうと、
 *    残りの本文が全部畳まれて**読めなくなる**
 * どちらも「保存はできている」ので、画面を見ても間違いに気づけない。
 */
import { describe, it, expect } from 'vitest';
import { splitFolds } from '../../client-wiki/src/components/wiki/markdownSource';

describe('折りたたみの切り分け', () => {
  it('折りたたみが無ければ本文1つのまま', () => {
    const segs = splitFolds('# 見出し\n\n本文');
    expect(segs).toEqual([{ kind: 'md', text: '# 見出し\n\n本文' }]);
  });

  it('1行に summary を書いた形', () => {
    const segs = splitFolds('前\n\n<details><summary>畳んだ題</summary>\n\n中身\n\n</details>\n\n後');
    expect(segs.map((s) => s.kind)).toEqual(['md', 'fold', 'md']);
    expect(segs[1]).toMatchObject({ kind: 'fold', summary: '畳んだ題', body: '中身' });
    // 前後の空行はそのまま残す（本文の形を変えない）。中身だけを見る
    expect((segs[0] as { text: string }).text.trim()).toBe('前');
    expect((segs[2] as { text: string }).text.trim()).toBe('後');
  });

  it('summary を次の行に書いた形', () => {
    const segs = splitFolds('<details>\n<summary>題だけ別行</summary>\n中身\n</details>');
    expect(segs).toEqual([{ kind: 'fold', summary: '題だけ別行', body: '中身' }]);
  });

  it('**閉じが無いときは切り分けない**（書きかけで残りの本文が畳まれない）', () => {
    const md = '前\n\n<details><summary>閉じ忘れ</summary>\n\nこの先も読めること';
    const segs = splitFolds(md);
    expect(segs).toEqual([{ kind: 'md', text: md }]);
  });

  it('続けて2つあっても取り違えない（最初の閉じで切る）', () => {
    const segs = splitFolds('<details><summary>A</summary>\na\n</details>\n\n<details><summary>B</summary>\nb\n</details>');
    const folds = segs.filter((s) => s.kind === 'fold');
    expect(folds).toHaveLength(2);
    expect(folds[0]).toMatchObject({ summary: 'A', body: 'a' });
    expect(folds[1]).toMatchObject({ summary: 'B', body: 'b' });
  });

  it('summary が無くても本文は失わない', () => {
    const segs = splitFolds('<details>\n中身だけ\n</details>');
    expect(segs).toEqual([{ kind: 'fold', summary: '', body: '中身だけ' }]);
  });

  it('中に見出し・表・注意書きが入っていてもそのまま渡す', () => {
    const body = '## 中の見出し\n\n| 列 | 列 |\n| --- | --- |\n| a | b |\n\n> [!NOTE]\n> 注意書き';
    const segs = splitFolds(`<details><summary>題</summary>\n\n${body}\n\n</details>`);
    expect(segs).toEqual([{ kind: 'fold', summary: '題', body }]);
  });

  it('空の本文で落ちない', () => {
    expect(splitFolds('')).toEqual([]);
  });
});
