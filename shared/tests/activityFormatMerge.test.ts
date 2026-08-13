/**
 * 後追い整形で「どの値を行に書くか」（`activity-format.service` の `mergeFormatted`）
 *
 * **なぜここをテストするか**: 間違えると**取込スキルが作った精度の高い件名と
 * 次にやることが、AI の30字の件名で潰れます**。しかも潰れたことは
 * 画面を見ても分かりません（もっともらしい件名が出るだけ）。
 *
 * server は `shared` を import しない構成なので、**server のファイルを直接読みます**
 * （`dueDate.test.ts` と同じやり方）。
 */
import { describe, it, expect } from 'vitest';
import { mergeFormatted, type FormatTargetRow } from '../../server/src/contexts/sales/services/activity-format.service';
import type { StructuredActivity } from '../../server/src/contexts/sales/services/activity-ai.service';

const row = (over: Partial<FormatTargetRow> = {}): FormatTargetRow => ({
  id: 'a1',
  description: '素のテキスト',
  activity_date: '2026-08-13',
  activity_type: 'email',
  subject: '★LED映像の納品仕様を照会 — 先方は素材制作に着手',
  next_action: null,
  next_action_date: null,
  ...over,
});

const ai = (over: Partial<StructuredActivity> = {}): StructuredActivity => ({
  subject: 'LEDの納品仕様を確認',            // 整形器が作る短い件名
  bodyHtml: '<p>整えた本文</p>',
  keyPoints: ['要点1', '要点2'],
  nextAction: 'AI が読み取った次の一手',
  nextActionDate: '2026-08-20',
  ...over,
});

describe('mergeFormatted', () => {
  it('本文と要点は AI のものを採る（ここが埋めたい欄）', () => {
    const m = mergeFormatted(row(), ai());
    expect(m.bodyHtml).toBe('<p>整えた本文</p>');
    expect(m.keyPoints).toEqual(['要点1', '要点2']);
  });

  it('件名は返さない = 呼ぶ側が上書きできない（取込スキルの件名を守る）', () => {
    const m = mergeFormatted(row(), ai());
    expect(m).not.toHaveProperty('subject');
  });

  it('次にやることが入っている行は上書きしない', () => {
    const m = mergeFormatted(
      row({ next_action: '人が決めた次の一手', next_action_date: '2026-08-14' }),
      ai(),
    );
    expect(m.nextAction).toBe('人が決めた次の一手');
    expect(m.nextActionDate).toBe('2026-08-14');
  });

  it('次にやることが入っている行は、期限が空でも AI の期限を入れない', () => {
    // 「次の一手は決まっているが期限は決めていない」を AI の推測で埋めない
    const m = mergeFormatted(row({ next_action: '人が決めた次の一手', next_action_date: null }), ai());
    expect(m.nextAction).toBe('人が決めた次の一手');
    expect(m.nextActionDate).toBeNull();
  });

  it('空白だけの次にやることは「無い」として扱う', () => {
    const m = mergeFormatted(row({ next_action: '   ' }), ai());
    expect(m.nextAction).toBe('AI が読み取った次の一手');
  });

  it('次にやることが空の行は AI の読み取りで埋める', () => {
    const m = mergeFormatted(row(), ai());
    expect(m.nextAction).toBe('AI が読み取った次の一手');
    expect(m.nextActionDate).toBe('2026-08-20');
  });

  it('AI が次にやることを読み取れなかったら期限だけ残さない', () => {
    // 期限だけの行は画面のどこにも出ない（対話経路の `normalizeActivity` と同じ決めごと）
    const m = mergeFormatted(row(), ai({ nextAction: null, nextActionDate: '2026-08-20' }));
    expect(m.nextAction).toBeNull();
    expect(m.nextActionDate).toBeNull();
  });

  it('本文が空なら null を返す（呼ぶ側が失敗として扱える）', () => {
    const m = mergeFormatted(row(), ai({ bodyHtml: null }));
    expect(m.bodyHtml).toBeNull();
  });
});
