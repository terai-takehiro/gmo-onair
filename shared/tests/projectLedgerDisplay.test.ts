/**
 * 案件台帳の「表に出す形」— 切り詰めと並べ替えを固定する検査
 *
 *  ・**長い案件名は 20 文字で切る**（ご指示）。幅で切ると端末と書体で
 *    切れる位置が変わり、行によって読める文字数がばらばらになります
 *  ・**並べ替えの印を、押せない列に出さない**。⚠️ 実ブラウザで踏みました —
 *    既定に戻した瞬間に、**並べ替えられない列すべてに矢印が出て**いました
 *  ・**3回押すと既定に戻る**。2段（昇順・降順）だけだと、一度押したら
 *    元の並び（おすすめ順＝次に手を打つべき順）に戻せません
 *  ・**「五十音順」と言い切らない**。漢字は読みを持っていないので五十音では
 *    並びません（`server/.../japanese-sort.ts` に実測が書いてあります）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_SORT, JA_SORT_KEYS, JA_SORT_NOTE, NAME_MAX_CHARS,
  nextSort, sortMark, truncateName,
} from '../../client/src/contexts/sales/pages/projectLedger/display';
import { COL_DEFS } from '../../client/src/contexts/sales/pages/projectLedger/types';

const ROOT = join(__dirname, '../..');
const readSrc = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('案件名の切り詰め', () => {
  it('20 文字まではそのまま', () => {
    const n = 'あ'.repeat(NAME_MAX_CHARS);
    expect(truncateName(n)).toEqual({ text: n, cut: false });
  });

  it('20 文字を超えたら … を付けて切る', () => {
    const n = 'あ'.repeat(30);
    const r = truncateName(n);
    expect(r.cut).toBe(true);
    expect([...r.text]).toHaveLength(NAME_MAX_CHARS + 1); // 20 文字 ＋ …
    expect(r.text.endsWith('…')).toBe(true);
  });

  it('切ったかどうかを返す（切れていることを画面が伝えられるように）', () => {
    // **切れているのに何も言わないと、それが正式な名前だと読まれる**
    expect(truncateName('短い').cut).toBe(false);
    expect(truncateName('あ'.repeat(21)).cut).toBe(true);
  });

  it('絵文字を半分に割らない', () => {
    // `slice` で切ると**サロゲートペアが割れて化ける**
    const n = '🎥'.repeat(30);
    expect([...truncateName(n).text]).toHaveLength(NAME_MAX_CHARS + 1);
    expect(truncateName(n).text).not.toContain('�');
  });

  it('空でも落ちない', () => {
    expect(truncateName('')).toEqual({ text: '', cut: false });
  });

  /**
   * ⚠️ **実測で直した。** 「切ったときだけ全文を出す」形にしていたが、
   * **20 文字ちょうどの名前は文字数では切られないのに、240px の列には収まらず
   * CSS が切る**ので、全文の出ないマスができていた（列幅は寸法表のいちばん広い段で、
   * 全角 20 文字＝約 260px は入らない）。
   */
  it('案件名はいつも全文を持たせる（CSS が先に切ることがある）', () => {
    const cells = readSrc('client/src/contexts/sales/pages/projectLedger/LedgerCells.tsx');
    expect(cells).toContain('title={row.name}');
    expect(cells).not.toContain('title={cut ?');
  });
});

describe('並べ替えの押し方', () => {
  it('別の列を押すと昇順から', () => {
    expect(nextSort(DEFAULT_SORT, 'name')).toEqual({ by: 'name', dir: 'asc' });
    expect(nextSort({ by: 'event_start', dir: 'desc' }, 'name')).toEqual({ by: 'name', dir: 'asc' });
  });

  it('同じ列を押すと 昇順 → 降順 → 既定 の3段', () => {
    const a = nextSort(DEFAULT_SORT, 'name');
    expect(a).toEqual({ by: 'name', dir: 'asc' });
    const b = nextSort(a, 'name');
    expect(b).toEqual({ by: 'name', dir: 'desc' });
    // **3段目が要る。** 無いと元の並び（おすすめ順）に戻せない
    expect(nextSort(b, 'name')).toEqual(DEFAULT_SORT);
  });

  it('既定は「並べ替えていない」（サーバーのおすすめ順に任せる）', () => {
    expect(DEFAULT_SORT.by).toBe('');
  });
});

describe('並べ替えの印', () => {
  it('並べ替えている列にだけ出す', () => {
    expect(sortMark({ by: 'name', dir: 'asc' }, 'name')).toBe('asc');
    expect(sortMark({ by: 'name', dir: 'desc' }, 'name')).toBe('desc');
    expect(sortMark({ by: 'name', dir: 'asc' }, 'event_start')).toBeNull();
  });

  /**
   * ⚠️ **実ブラウザで踏んだ。** 並べ替えられない列は鍵を持たない（`''`）ので、
   * 素朴に `cur.by === key` と書くと、**既定（`by: ''`）に戻した瞬間に
   * それらの列すべてに矢印が出ます**（案件名を3回押したら案件分類に降順が付いた）。
   */
  it('鍵を持たない列には出さない（既定に戻したときも）', () => {
    expect(sortMark(DEFAULT_SORT, '')).toBeNull();
    expect(sortMark({ by: '', dir: 'desc' }, '')).toBeNull();
    for (const c of COL_DEFS.filter((x) => !('sort' in x))) {
      expect(sortMark(DEFAULT_SORT, (c as { sort?: string }).sort ?? ''), c.key).toBeNull();
    }
  });
});

describe('サーバーと画面で並べ替えの鍵が合っている', () => {
  const svc = readSrc('server/src/contexts/sales/services/project.service.ts');
  const jaSrc = readSrc('server/src/contexts/sales/services/japanese-sort.ts');

  it('画面が押せる鍵は、サーバーが並べ替えられる鍵だけ', () => {
    // **無い鍵を送ると `created_at` に黙って落ちる**（押したのに並びが変わらない）
    const map = svc.slice(svc.indexOf('const SORT_COLUMN_MAP'), svc.indexOf('};', svc.indexOf('const SORT_COLUMN_MAP')));
    for (const c of COL_DEFS) {
      const key = (c as { sort?: string }).sort;
      if (!key) continue;
      expect(map, `${c.key} の並べ替え鍵 ${key} がサーバーに無い`).toMatch(new RegExp(`\\n\\s*${key}:`));
    }
  });

  it('五十音で並べる列は、画面とサーバーで同じ', () => {
    for (const k of JA_SORT_KEYS) expect(jaSrc).toContain(`'${k}'`);
  });

  it('ICU が無い環境では素の順に落とす（500 にしない）', () => {
    // `ja-x-icu` は Postgres が ICU 付きでないと**存在しない**。
    // 決め打ちで書くと、その環境では**押した瞬間に一覧が 500** になる
    expect(jaSrc).toMatch(/available \? .*COLLATE/);
    expect(jaSrc).toMatch(/catch\s*\{\s*hasIcu = false/);
  });

  it('並べ替えはサーバーに渡す（画面で並べ替えない）', () => {
    // 出ているのは 100 件だけなので、画面で並べ替えると**そのページの中だけ**が並び替わる
    const st = readSrc('client/src/contexts/sales/pages/projectLedger/useLedgerState.ts');
    expect(st).toMatch(/sort_by: sort\.by \|\| undefined/);
    expect(st).toMatch(/sort_dir: sort\.by \? sort\.dir : undefined/);
  });
});

describe('五十音と言い切らない', () => {
  it('但し書きに漢字のことが書いてある', () => {
    expect(JA_SORT_NOTE).toContain('漢字');
    expect(JA_SORT_NOTE).not.toContain('五十音順で並びます');
  });
});
