/**
 * 「Excel を書き出す」ダイアログの判定を固定する。
 *
 * **画面を見ても間違いに気づけない部分です。** 監査（2026-08-22）で見つかった事故は
 * どれも「画面はいつもどおりに見えるのに、落ちてくるファイルが違う」形でした:
 *   ・見出しだけの見本しか出しておらず、**中身が1行も無い Excel** に誰も気づけなかった
 *   ・「配信先が無い ENC」が台数ぶん並び、**現地で必ず弾かれる赤が埋もれた**
 *   ・シートのチェックを外しても点検・見本が変わらず、**外したシートの赤**が出続けた
 */
import { describe, it, expect } from 'vitest';
import {
  groupGray, visiblePreviewSheets, sheetPosition, SHEET_DEFS, GUIDE_SHEET_NAME,
} from '../../client-qsheet/src/pages/settings-export/exportPlan';
import type { PreflightIssue, PreviewSheet } from '../../client-qsheet/src/lib/deviceSettingsApi';

const gray = (where: string, code: string, message = ''): PreflightIssue => ({ where, code, message });

const sheet = (name: string, rows: string[][], totalRows = rows.length): PreviewSheet =>
  ({ name, headers: ['A', 'B'], rows, totalRows });

describe('groupGray — 灰色は理由ごとに1行へまとめる', () => {
  it('配信先が無い ENC が10台あっても1行になる', () => {
    const issues = Array.from({ length: 10 }, (_, i) => gray(`ENC${i + 1}`, 'NO_DESTINATION'));
    const [g, ...rest] = groupGray(issues);
    expect(rest).toHaveLength(0);
    expect(g.count).toBe(10);
    expect(g.text).toBe(
      '配信先が無いエンコーダー: ENC1, ENC2, ENC3, ENC4, ENC5, ENC6, ENC7, ENC8, ENC9, ENC10（10台）'
    );
  });

  it('理由が違うものは混ぜない（出てきた順に並べる）', () => {
    const groups = groupGray([
      gray('REC3', 'DECK_SKIPPED'),
      gray('ENC3', 'NO_DESTINATION'),
      gray('ENC5', 'NO_DESTINATION'),
      gray('REC4-P', 'DECK_SKIPPED'),
    ]);
    expect(groups.map((g) => g.code)).toEqual(['DECK_SKIPPED', 'NO_DESTINATION']);
    expect(groups[0].text).toBe('使わないと決めたデッキ: REC3, REC4-P（2台）');
    expect(groups[1].text).toBe('配信先が無いエンコーダー: ENC3, ENC5（2台）');
  });

  it('知らない code は黙って消さず、サーバーの文をそのまま見出しにする', () => {
    const [g] = groupGray([gray('ENC9', 'SOMETHING_NEW', 'まだ画面が知らない理由')]);
    expect(g.text).toBe('まだ画面が知らない理由: ENC9（1件）');
  });

  it('0件なら1行も作らない', () => {
    expect(groupGray([])).toEqual([]);
  });
});

describe('visiblePreviewSheets — 外したシートの見本は出さない', () => {
  const preview = [
    sheet('収録設定', [['REC1', '']]),
    sheet('配信設定', [['ENC1', '']]),
    sheet(GUIDE_SHEET_NAME, [['項目', '説明']]),
  ];

  it('選んだシートと入力ガイドだけを出す', () => {
    expect(visiblePreviewSheets(preview, ['recording']).map((s) => s.name))
      .toEqual(['収録設定', GUIDE_SHEET_NAME]);
  });

  it('入力ガイドは外せない（1つも選ばなくても残る）', () => {
    expect(visiblePreviewSheets(preview, []).map((s) => s.name)).toEqual([GUIDE_SHEET_NAME]);
  });

  it('シートの名前はサーバーが付ける名前と一致していること（ここがずれると全部消える）', () => {
    for (const def of SHEET_DEFS) {
      expect(preview.some((s) => s.name === def.sheetName)).toBe(true);
    }
  });
});

describe('sheetPosition — 何枚目か（Assistant は1枚目しか読まない）', () => {
  const preview = [sheet('配信設定', []), sheet(GUIDE_SHEET_NAME, [])];

  it('サーバーが返した並びで数える（画面のチェックを押した順ではない）', () => {
    expect(sheetPosition(preview, '配信設定')).toBe(1);
    expect(sheetPosition(preview, GUIDE_SHEET_NAME)).toBe(2);
  });

  it('返ってきていないシートは null（「1枚目」と嘘を書かない）', () => {
    expect(sheetPosition(preview, '収録設定')).toBeNull();
  });
});

describe('PreviewSheet — 「空のまま書き出す」を見分けられること', () => {
  it('行が0件のシートは totalRows も 0（画面は「このシートは空です」を出す）', () => {
    const s = sheet('収録設定', [], 0);
    expect(s.rows).toHaveLength(0);
    expect(s.totalRows).toBe(0);
  });

  it('先頭5行だけ来ても、残りが何行あるか数えられる', () => {
    const s = sheet('収録設定', [['REC1', 'a'], ['REC2', 'b']], 12);
    expect(s.totalRows - s.rows.length).toBe(10);
  });
});
