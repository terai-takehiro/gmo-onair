/**
 * セルをその場で直す・貼り付ける — 受け取り方を固定する検査（案件台帳）
 *
 * ── ここがいちばん危ない ────────────────────────────────────
 *
 * 貼り付けは**取り消せません**。しかも Excel からの貼り付けは
 * **貼る場所を1列ずらしただけで、まったく別の項目が書き換わります**。
 * 間違いは画面に出ません（N 件が黙って別の値になるだけ）。
 *
 * だから、ここで固定するのは「**当てずっぽうで通してしまわないか**」です:
 *
 *  ・**同じ名前が2つ以上あるときに、片方を選ばない**（同姓同名の担当・同名の取引先は
 *    実際にあり、間違えると**別の会社の案件**になります）
 *  ・**空にできない項目を空にしない**（担当は NOT NULL・お客様が無い案件を作らない）
 *  ・**直せない列に貼らない**（ステージ・金額・案件名は `bulk` が受けない）
 *  ・**Excel の末尾の改行で、最後の行を空文字で上書きしない**
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EDITABLE_COLS, PASTE_MAX_CELLS, inRange, isEditable, parseCell, parseClipboardGrid,
  rangeOf, rangeSize, toClipboardText, toIsoDate, type ParseCtx,
} from '../../client/src/contexts/sales/pages/projectLedger/editable';
import { BULK_FIELDS, COL_DEFS } from '../../client/src/contexts/sales/pages/projectLedger/types';

const ROOT = join(__dirname, '../..');
const readSrc = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const CTX: ParseCtx = {
  users: [
    { id: 'u1', name: '山田 太郎' },
    { id: 'u2', name: '鈴木 花子' },
    // ⚠️ **同姓同名**（実際にある）
    { id: 'u3', name: '佐藤 健' },
    { id: 'u4', name: '佐藤 健' },
  ],
  customers: [
    { id: 'c1', name: 'A社' },
    { id: 'c2', name: '株式会社ビー' },
    { id: 'c3', name: '同名商事' },
    { id: 'c4', name: '同名商事' },
  ],
  combos: [
    { label: '有観客 ・ 配信/生放送', audience: 'with_audience', category: 'broadcast' },
    { label: '有観客 ・ 収録', audience: 'with_audience', category: 'recording' },
    { label: '無観客 ・ 収録', audience: 'no_audience', category: 'recording' },
  ],
};

describe('直せる列は bulk が受ける物だけ', () => {
  it('直せる列は全部 COL_DEFS にある（表に出ていない列は直せない）', () => {
    for (const c of EDITABLE_COLS) {
      expect(COL_DEFS.some((d) => d.key === c), c).toBe(true);
    }
  });

  it('ステージ・案件名・金額は直せない', () => {
    // 段を動かすと履歴・失注理由・GLS 発番の確認が要るが `bulk` はどれもしない
    for (const c of ['stage', 'name', 'estimate_amount', 'total_revenue', 'gls_number']) {
      expect(isEditable(c), c).toBe(false);
    }
  });

  it('直せる列は、まとめて直せる項目と対応している', () => {
    const bulk = new Set<string>(BULK_FIELDS.map((b) => b.key));
    const map: Record<string, string> = {
      classification: 'classification',
      event_start: 'event_start',
      event_end: 'event_end',
      assigned_to_name: 'assigned_to',
      customer_name: 'customer_id',
      application_form: 'application_form',
    };
    for (const c of EDITABLE_COLS) {
      expect(bulk.has(map[c]), `${c} に対応する一括の項目が無い`).toBe(true);
    }
  });
});

describe('⚠️ 1つに決まらないものは通さない', () => {
  it('同姓同名の担当は断る（片方を選ばない）', () => {
    const r = parseCell('assigned_to_name', '佐藤 健', CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toContain('2人以上');
  });

  it('同じ名前の取引先は断る', () => {
    const r = parseCell('customer_name', '同名商事', CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toContain('2つ以上');
  });

  it('いない人・無い取引先は断る（作らない）', () => {
    expect(parseCell('assigned_to_name', '居ない 人', CTX).ok).toBe(false);
    expect(parseCell('customer_name', '無い会社', CTX).ok).toBe(false);
  });

  it('ちょうど1件なら通す', () => {
    const r = parseCell('assigned_to_name', '山田 太郎', CTX);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.set).toEqual({ assigned_to: 'u1' });
  });

  it('全角の空白・記号の揺れは吸収する（Excel から来る文字は揺れる）', () => {
    expect(parseCell('assigned_to_name', '　山田　太郎　', CTX).ok).toBe(true);
    expect(parseCell('classification', '有観客・収録', CTX).ok).toBe(true);
    expect(parseCell('classification', '有観客 ･ 収録', CTX).ok).toBe(true);
  });
});

describe('⚠️ 空にできない項目を空にしない', () => {
  it('社内の担当は空にできない（NOT NULL）', () => {
    for (const blank of ['', '—', '-', 'なし']) {
      expect(parseCell('assigned_to_name', blank, CTX).ok, JSON.stringify(blank)).toBe(false);
    }
  });

  it('お客様は空にできない（お客様の無い案件を作らない）', () => {
    expect(parseCell('customer_name', '', CTX).ok).toBe(false);
    expect(parseCell('customer_name', '—', CTX).ok).toBe(false);
  });

  it('案件分類は空にできない', () => {
    expect(parseCell('classification', '', CTX).ok).toBe(false);
    expect(parseCell('classification', '入っていません', CTX).ok).toBe(false);
  });

  it('実施日だけは空にできる（未定に戻すことがある）', () => {
    const r = parseCell('event_start', '', CTX);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.set).toEqual({ event_start: '' });
    expect(parseCell('event_start', '未定', CTX).ok).toBe(true);
  });
});

describe('案件分類は2つで1つ', () => {
  it('札から2段の両方を作る（片方だけ送らない）', () => {
    const r = parseCell('classification', '有観客 ・ 収録', CTX);
    expect(r.ok).toBe(true);
    // ⚠️ 片方だけ送ると**サーバーが導けず黙って捨てられる**
    if (r.ok) expect(r.set).toEqual({ audience: 'with_audience', project_category: 'recording' });
  });

  it('旧「案件種類」は送らない（サーバーが導く）', () => {
    const r = parseCell('classification', '無観客 ・ 収録', CTX);
    if (r.ok) expect(Object.keys(r.set)).not.toContain('project_type');
  });

  it('読めない札は断り、例を出す（手が止まらないように）', () => {
    const r = parseCell('classification', 'ハイブリッド', CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toContain('例');
  });
});

describe('日付', () => {
  it('Excel から来る形をならす', () => {
    expect(toIsoDate('2026-08-15')).toBe('2026-08-15');
    expect(toIsoDate('2026/8/5')).toBe('2026-08-05');
    expect(toIsoDate('2026年8月5日')).toBe('2026-08-05');
    expect(toIsoDate('2026.8.5')).toBe('2026-08-05');
  });

  it('読めない形は断る（直したつもりで直っていない、を作らない）', () => {
    expect(toIsoDate('8/5')).toBeNull();
    expect(toIsoDate('来週')).toBeNull();
    expect(toIsoDate('2026-13-01')).toBeNull();
    expect(toIsoDate('2026-08-32')).toBeNull();
  });

  it('日付の解釈に new Date() を使わない（時間帯で1日ずれる）', () => {
    // 注釈は落として**コードだけ**見る（「使わない」と書いた説明文で落ちないように）
    const src = readSrc('client/src/contexts/sales/pages/projectLedger/editable.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/new Date\(/);
  });
});

describe('申込書', () => {
  it('あり／なしの言い方を広く受ける', () => {
    for (const t of ['あり', '有', '○', 'yes', '1']) {
      const r = parseCell('application_form', t, CTX);
      expect(r.ok, t).toBe(true);
      if (r.ok) expect(r.set).toEqual({ application_form: true });
    }
    for (const t of ['なし', '無', '×', 'no', '0']) {
      const r = parseCell('application_form', t, CTX);
      expect(r.ok, t).toBe(true);
      if (r.ok) expect(r.set).toEqual({ application_form: false });
    }
  });

  it('読めないものは断る（勝手に「なし」にしない）', () => {
    expect(parseCell('application_form', 'たぶん', CTX).ok).toBe(false);
  });
});

describe('貼り付けの文字をほどく', () => {
  it('タブ区切り・改行で升目にする', () => {
    expect(parseClipboardGrid('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('⚠️ Excel が付ける末尾の改行を落とす（最後の行を空で上書きしない）', () => {
    expect(parseClipboardGrid('a\nb\n')).toEqual([['a'], ['b']]);
    expect(parseClipboardGrid('a\r\nb\r\n')).toEqual([['a'], ['b']]);
  });

  it('1マスだけの貼り付けも升目になる', () => {
    expect(parseClipboardGrid('あ')).toEqual([['あ']]);
  });

  it('空の貼り付けでも落ちない', () => {
    expect(parseClipboardGrid('')).toEqual([['']]);
  });
});

describe('コピーする文字', () => {
  it('タブ区切りで出す（Excel にそのまま貼れる）', () => {
    expect(toClipboardText([['a', 'b'], ['c', 'd']])).toBe('a\tb\nc\td');
  });

  it('⚠️ 中身のタブ・改行は空白にする（貼った先で升目がずれる）', () => {
    expect(toClipboardText([['1行目\n2行目', 'x']])).toBe('1行目 2行目\tx');
    expect(toClipboardText([['a\tb']])).toBe('a b');
  });
});

describe('範囲', () => {
  it('どちらから掴んでも同じ長方形になる', () => {
    const a = rangeOf({ row: 3, col: 5 }, { row: 1, col: 2 });
    expect(a).toEqual({ r1: 1, c1: 2, r2: 3, c2: 5 });
    expect(rangeOf({ row: 1, col: 2 }, { row: 3, col: 5 })).toEqual(a);
  });

  it('中にあるかを見られる', () => {
    const r = { r1: 1, c1: 1, r2: 2, c2: 3 };
    expect(inRange(r, 1, 1)).toBe(true);
    expect(inRange(r, 2, 3)).toBe(true);
    expect(inRange(r, 0, 1)).toBe(false);
    expect(inRange(r, 1, 4)).toBe(false);
    expect(inRange(null, 1, 1)).toBe(false);
  });

  it('升目の数を数えられる', () => {
    expect(rangeSize({ r1: 0, c1: 0, r2: 0, c2: 0 })).toBe(1);
    expect(rangeSize({ r1: 0, c1: 0, r2: 2, c2: 3 })).toBe(12);
  });
});

describe('書き換える前に必ず確かめる', () => {
  const hook = readSrc('client/src/contexts/sales/pages/projectLedger/useLedgerGrid.ts');

  it('貼り付けはすぐ書かない（下見を作るだけ）', () => {
    // **書く関数（`write.mutate`）を通らずに `setPlan` で終える**ことを見る。
    // ⚠️ 前は `setPlan({ changes, rejected, tooMany: null })` と**1行そのまま**を
    // 見ていたので、同じ意味のまま**改行を入れただけで落ちました**（実際に落ちた）。
    // 見たいのは「すぐ書かないこと」なので、そちらを見ます
    const paste = hook.slice(hook.indexOf('const planPaste'), hook.indexOf('const write'));
    expect(paste).toMatch(/setPlan\(\{/);
    expect(paste).not.toMatch(/write\.mutate/);
  });

  it('読めなかった升目を必ず持ち帰る（黙って捨てない）', () => {
    expect(hook).toMatch(/rejected\.push/);
    const dlg = readSrc('client/src/contexts/sales/pages/projectLedger/PastePlanDialog.tsx');
    expect(dlg).toContain('は書き換えません');
  });

  it('多すぎる貼り付けは止める（たいてい貼る場所が違う）', () => {
    expect(PASTE_MAX_CELLS).toBeGreaterThan(0);
    expect(hook).toMatch(/cells > PASTE_MAX_CELLS/);
  });

  it('送る先は bulk の1本だけ（別の口を作らない）', () => {
    expect(hook).toContain("api.patch('/projects/bulk'");
    expect((hook.match(/api\.(patch|put|post)\(/g) ?? []).length).toBe(1);
  });

  it('同じ中身はまとめて1回で送る（1件ずつだとどこまで入ったか分からない）', () => {
    expect(hook).toMatch(/groups\.set\(k, g\)/);
  });

  it('閲覧モードでは貼り付けを受けない', () => {
    expect(hook).toMatch(/if \(!canEdit \|\| !anchor\) return;/);
    const table = readSrc('client/src/contexts/sales/pages/projectLedger/LedgerTable.tsx');
    expect(table).toMatch(/if \(!canEdit \|\| !grid\.anchor\) return;/);
  });

  it('直したあとは台帳・整合性・一覧の鍵を落とす', () => {
    for (const k of ['project-ledger', 'project-integrity', 'projects']) {
      expect(hook).toContain(`'${k}'`);
    }
  });
});
