/**
 * 後追い整形で「どの値を行に書くか」（`activity-format.service` の `mergeFormatted`）
 *
 * **なぜここをテストするか**: 間違えると**取込スキルが作った精度の高い件名と
 * 次にやることが、AI の20字の件名で潰れます**。しかも潰れたことは
 * 画面を見ても分かりません（もっともらしい件名が出るだけ）。
 *
 * server は `shared` を import しない構成なので、**server のファイルを直接読みます**
 * （`dueDate.test.ts` と同じやり方）。
 */
import { describe, it, expect } from 'vitest';
import { mergeFormatted, type FormatTargetRow } from '../../server/src/contexts/sales/services/activity-format.service';
import type { StructuredActivity } from '../../server/src/contexts/sales/services/activity-ai.service';
import type { ActivityStruct } from '../../server/src/shared/services/activity-struct';

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

const struct = (): ActivityStruct => ({
  v: 1,
  subtitle: '搬入申請・掲載ロゴを依頼',
  statuses: [{ label: '撮影決定', tone: 'decided' }],
  facts: [{ icon: 'date', value: '8/10 5:00–20:00' }],
  lead: '先方より撮影決定の確定連絡。',
  turns: [{ side: 'them', name: '露崎様', org: 'エンブレム', at: '7/30 21:54', quote: '「撮影は決定で」', note: null, fields: [] }],
});

const ai = (over: Partial<StructuredActivity> = {}): StructuredActivity => ({
  subject: 'LEDの納品仕様を確認',            // 整形器が作る短い件名
  struct: struct(),
  nextAction: 'AI が読み取った次の一手',
  nextActionDate: '2026-08-20',
  ...over,
});

describe('mergeFormatted', () => {
  it('本文の構造は AI のものを採る（ここが埋めたい欄）', () => {
    const m = mergeFormatted(row(), ai());
    expect(m.struct?.lead).toBe('先方より撮影決定の確定連絡。');
    expect(m.struct?.turns).toHaveLength(1);
  });

  it('件名は返さない = 呼ぶ側が上書きできない（取込スキルの件名を守る）', () => {
    const m = mergeFormatted(row(), ai());
    expect(m).not.toHaveProperty('subject');
  });

  it('原文（description）も返さない = 書き戻す先が無い', () => {
    // 「打った文をみる」で戻せることが、整形を任せられる前提になっている
    const m = mergeFormatted(row(), ai());
    expect(m).not.toHaveProperty('description');
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

  it('構造が空なら null を返す（呼ぶ側が失敗として扱える）', () => {
    const m = mergeFormatted(row(), ai({ struct: null }));
    expect(m.struct).toBeNull();
  });
});
