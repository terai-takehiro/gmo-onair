/**
 * 取込（MCP `create_activity_log`）で AI が書いたものの差分
 * （`server/src/contexts/sales/services/activity-log.service.ts` の `intakeDiffs`）
 *
 * **なぜここをテストするか**: この差分は**画面のどこにも出ません**。
 * 壊れても「集計がおかしい」としか分からず、しかも気づくのは
 * 「改善したはずなのに数字が動かない」と思ったずっと後です。
 *
 * 特に固定したいのは2つ:
 *
 *   ① **`description` を数えていること。** 整形側（`activity_format`）の差分は
 *      `body_struct` を見ていて元の本文を1度も見ないので、ここを落とすと
 *      「取り込んだ本文が短い」という**上流の失敗だけが計測の外**に残ります
 *      （利用者からのご指摘「きわめて短いテキストでしか残らない」の上流側）
 *   ② **直っていないときに正解ラベル（`none`）を1行残すこと。**
 *      無いと「無修正採用率」の分母が壊れ、**直され方の傾向が読めなくなります**
 *
 * server は `shared` を import しない構成なので、**server のファイルを直接読みます**。
 */
import { describe, it, expect } from 'vitest';
import { intakeDiffs } from '../../server/src/contexts/sales/services/activity-log.service';

const ai = {
  subject: 'LED映像の納品仕様を照会',
  description: '先方より、8/10 の収録で使う LED の納品仕様について照会。解像度とフレームレートの指定が必要とのこと。',
  next_action: '8/5 までに技術仕様書を返送する。',
  next_action_date: '2026-08-05',
};

const same = (extra: Partial<typeof ai> = {}) => ({ ...ai, ...extra });

describe('intakeDiffs', () => {
  it('1つも直っていなければ「無修正」を1行だけ残す（分母）', () => {
    expect(intakeDiffs(ai, same())).toEqual([{ fieldPath: '(全体)', type: 'none' }]);
  });

  it('空白の差だけでは「直した」に数えない', () => {
    expect(intakeDiffs(ai, same({ subject: `  ${ai.subject}  ` })))
      .toEqual([{ fieldPath: '(全体)', type: 'none' }]);
  });

  it('本文を人が書き足したら enrich（＝取込が要約してしまっている信号）', () => {
    const after = same({
      description: `${ai.description}あわせて、当日の搬入経路と立ち会い人数の確認も依頼あり。見積は別途。`,
    });
    const d = intakeDiffs(ai, after);
    const desc = d.find((x) => x.fieldPath === 'description')!;
    expect(desc.type).toBe('enrich');
    // 直さなかった項目も分母として残る
    expect(d.filter((x) => x.type === 'none').map((x) => x.fieldPath).sort())
      .toEqual(['next_action', 'next_action_date', 'subject']);
  });

  it('本文を書き換えられたら fix（取り違え）', () => {
    const d = intakeDiffs(ai, same({ description: '先方は LED ではなく大型モニタを希望。' }));
    expect(d.find((x) => x.fieldPath === 'description')!.type).toBe('fix');
  });

  it('丸ごと消されたら reject（書き足しにも誤りにも数えない）', () => {
    const d = intakeDiffs(ai, same({ next_action: '' }));
    expect(d.find((x) => x.fieldPath === 'next_action')!.type).toBe('reject');
  });

  it('件名・本文が空から埋まったら enrich（整形器が触らない欄なので取込の取りこぼし）', () => {
    const blank = { ...ai, description: '' };
    const d = intakeDiffs(blank, same());
    expect(d.find((x) => x.fieldPath === 'description')!.type).toBe('enrich');
  });

  it('取込が空だった「次にやること」は数えない（整形器が埋めた値を人のせいにしない）', () => {
    /*
     * `mergeFormatted` は行の next_action が空のときだけ本文から埋める。
     * ここを数えると、人が件名だけ直した最初の保存で**機械が足した値まで**
     * 「人が書き足した」として積まれ、以後 hasCorrections が真になって
     * **本物の修正が永久に記録されなくなる**（Codex レビュー指摘・PR #717）。
     */
    const blank = { ...ai, next_action: '', next_action_date: '' };
    const d = intakeDiffs(blank, same());
    expect(d).toEqual([{ fieldPath: '(全体)', type: 'none' }]);
  });

  it('取込が値を出していた「次にやること」は今までどおり数える', () => {
    const d = intakeDiffs(ai, same({ next_action: '8/1 までに技術仕様書を返送する。' }));
    expect(d.find((x) => x.fieldPath === 'next_action')!.type).toBe('fix');
  });

  it('整形器の持ち場（body_struct / body_html）は数えない（同じ失敗を2つの kind で数えない）', () => {
    const d = intakeDiffs(ai, { ...same(), body_struct: { v: 1, lead: 'ちがう' }, body_html: '<p>x</p>' });
    expect(d).toEqual([{ fieldPath: '(全体)', type: 'none' }]);
  });

  it('null / undefined でも落ちない（取込は任意項目が多い）', () => {
    const d = intakeDiffs({ subject: 'あ' }, { subject: 'あ', description: null, next_action: undefined });
    expect(d).toEqual([{ fieldPath: '(全体)', type: 'none' }]);
  });
});
