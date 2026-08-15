/**
 * 案件台帳の書き出し（CSV）を固定する検査
 *
 * ── ここで守りたいこと ──────────────────────────────────────
 *
 *  ・**`COL_DEFS` の全部の列に中身がある**こと。列を足して `cellText` に
 *    書き忘れると**その列だけ空欄で出ます** — 画面には出ているので、
 *    書き出したファイルを Excel で開くまで誰も気づけません
 *  ・**絞り込み全体を書き出す**こと。画面に並んでいる行だけを書き出すと
 *    **101 件目から黙って落ちます**（1ページ 100 件がサーバーの上限）
 *  ・**切ったときは必ず言う**こと。言わないと Excel で数えて
 *    「これで全部だ」と読まれます
 *  ・**Excel で開いて壊れない**こと（BOM・改行・引用符・数式）
 *
 * `csv.ts` は画面の物を1つも import しないので**そのまま読めます**。
 * `ledgerCsv.ts` は `@/` の別名を使うので**文字として**検査します
 * （`estimateCategory.test.ts` と同じやり方）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CSV_MAX_ROWS, csvCell, csvFileName, toCsv,
} from '../../client/src/contexts/sales/pages/projectLedger/csv';
import { COL_DEFS } from '../../client/src/contexts/sales/pages/projectLedger/types';

const ROOT = join(__dirname, '../..');
const LEDGER = 'client/src/contexts/sales/pages/projectLedger';
const readSrc = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const CSV_SRC = readSrc(`${LEDGER}/ledgerCsv.ts`);
const HOOK_SRC = readSrc(`${LEDGER}/useLedgerCsv.ts`);

describe('列の書き忘れ', () => {
  it('COL_DEFS の全部の列が cellText に書いてある', () => {
    expect(COL_DEFS.length).toBeGreaterThanOrEqual(20);
    for (const c of COL_DEFS) {
      // **`default:` に落ちる列があってはいけない**（空欄で書き出される）
      expect(CSV_SRC, `${c.key}（${c.label}）が cellText に無い`).toContain(`case '${c.key}':`);
    }
  });

  it('知らない列は undefined を返す（空文字だと書き忘れと見分けが付かない）', () => {
    expect(CSV_SRC).toMatch(/default:\s*return undefined;/);
  });

  it('金額に ¥ を付けない（付けると Excel が文字列として読み、合計が出せない）', () => {
    const fn = CSV_SRC.slice(CSV_SRC.indexOf('function numeric'), CSV_SRC.indexOf('export function cellText'));
    expect(fn).not.toContain('¥');
  });

  it('0 は空欄にする（サーバーが「見積が無い」も 0 で返すため）', () => {
    // **0 と書くと「0 円で見積もった」と読まれ、Excel の平均に見積の無い案件が入る**
    const fn = CSV_SRC.slice(CSV_SRC.indexOf('function numeric'), CSV_SRC.indexOf('export function cellText'));
    expect(fn).toMatch(/n === 0/);
  });
});

describe('落とすところ', () => {
  it('URL をその場で捨てない（中身が空のファイルになる）', () => {
    expect(HOOK_SRC).toMatch(/setTimeout\(\(\) => URL\.revokeObjectURL/);
  });
});

describe('Excel で開いて壊れない', () => {
  it('カンマ・引用符・改行を含むマスは包む', () => {
    expect(csvCell('ふつう')).toBe('ふつう');
    expect(csvCell('A社, B社')).toBe('"A社, B社"');
    expect(csvCell('彼は"来た"')).toBe('"彼は""来た"""');
    expect(csvCell('1行目\n2行目')).toBe('"1行目\n2行目"');
  });

  it('数式になる頭文字は文字に留める', () => {
    // ⚠️ 開いた人の Excel で式が走らないようにする
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+SUM(A1)')).toBe("'+SUM(A1)");
    expect(csvCell('@関数')).toBe("'@関数");
  });

  it('マイナスの金額はそのまま（符号を消さない）', () => {
    // **`-` に `'` を足すと、金額のマイナスが読めなくなる**
    expect(csvCell('-100000')).toBe('-100000');
  });

  it('BOM を付ける（付けないと Excel で日本語が全部化ける）', () => {
    expect(HOOK_SRC).toContain('﻿');
  });

  it('改行は CRLF', () => {
    expect(toCsv(['a'], [['b']])).toBe('a\r\nb');
  });
});

describe('組み立て', () => {
  it('1件も無くても表頭だけは出す（空のファイルにしない）', () => {
    expect(toCsv(['案件名'], [])).toBe('案件名');
  });

  it('表頭も包む（列名にカンマが入っても崩れない）', () => {
    expect(toCsv(['あ,い'], [['x']])).toBe('"あ,い"\r\nx');
  });

  it('画面に出している列だけ・出している並びのまま', () => {
    expect(CSV_SRC).toMatch(/shown\.filter\(\(k\) => COL_DEFS\.some/);
  });
});

describe('ファイル名', () => {
  it('絞り込みが入る（ダウンロードに3つ並んでも見分けられる）', () => {
    expect(csvFileName(null, '20260815')).toBe('project-ledger_20260815.csv');
    expect(csvFileName('no_classification', '20260815'))
      .toBe('project-ledger_20260815_no_classification.csv');
  });

  /**
   * ⚠️ **実ブラウザで踏んだ**（`csv.ts` に理由あり）。名前が全部 非ASCII だと
   * Chromium は名前ごと捨てて `download` にし、**`.csv` が落ちて Excel で開けません**。
   */
  it('日本語を混ぜない（Chromium が名前ごと捨てて .csv が落ちる）', () => {
    for (const name of [
      csvFileName(null, '20260815'),
      csvFileName('案件分類が入っていない', '20260815'),
      csvFileName('type_mismatch', '20260815'),
    ]) {
      // eslint-disable-next-line no-control-regex
      expect(name, name).toMatch(/^[\x00-\x7F]+$/);
      expect(name).toMatch(/\.csv$/);
    }
  });

  it('ファイル名に使えない文字を落とす', () => {
    expect(csvFileName('A/B:C*D', '20260815')).toBe('project-ledger_20260815_ABCD.csv');
  });
});

describe('絞り込み全体を書き出す（画面の行だけにしない）', () => {
  it('一度に書き出す上限がある（1万件を引くと画面が固まる）', () => {
    expect(CSV_MAX_ROWS).toBeGreaterThan(100);
    expect(CSV_MAX_ROWS).toBeLessThanOrEqual(5000);
  });

  it('ページを送って全部引く', () => {
    expect(HOOK_SRC).toMatch(/page \+= 1/);
    expect(HOOK_SRC).toMatch(/rows\.length < total/);
  });

  it('引くのは表と同じ口（書き出し専用の口を作らない）', () => {
    expect(HOOK_SRC).toContain("api.get('/projects'");
  });

  it('絞り込みは表が使っているものをそのまま渡す（組み直さない）', () => {
    const page = readSrc('client/src/contexts/sales/pages/ProjectLedgerPage.tsx');
    expect(page).toMatch(/csv\.download\(\s*s\.params,/);
    expect(readSrc(`${LEDGER}/useLedgerState.ts`)).toMatch(/\n\s{4}params,\n/);
  });

  it('上限で切ったことを画面に出す（黙って切らない）', () => {
    expect(HOOK_SRC).toMatch(/const cut = rows\.length < total/);
    expect(HOOK_SRC).toContain('件までです');
  });
});
