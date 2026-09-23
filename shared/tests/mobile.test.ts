/**
 * スマホの小さな決めごと（M0）の計算部分
 *
 * **画面を見ても間違いに気づけない**もの（日付の足し算・過ぎた日数）なので、
 * ここは素で固定しておきます（`manYen` と同じ扱い）。
 */
import { describe, it, expect } from 'vitest';
import { duePresets, dueLabel, MOBILE_MAX } from '../src/client-v4/mobile';

describe('duePresets — 期限のプリセット', () => {
  // **基準日を渡せるようにしてある。** 中で new Date() を呼ぶと結果が日によって変わる
  const base = new Date('2026-08-07T09:30:00');

  it('モックの3つをこの順で出す', () => {
    expect(duePresets(base).map((p) => p.label)).toEqual(['明日 18:00', '3日後 18:00', '日時を選ぶ']);
  });

  it('明日 18:00 は翌日の18時ちょうど', () => {
    expect(duePresets(base)[0].value).toBe('2026-08-08T18:00');
  });

  it('3日後 18:00 は3日足した日の18時', () => {
    expect(duePresets(base)[1].value).toBe('2026-08-10T18:00');
  });

  it('「日時を選ぶ」は値を持たない（端末のピッカーに渡す）', () => {
    expect(duePresets(base)[2].value).toBeNull();
  });

  it('月をまたいでも繰り上がる', () => {
    expect(duePresets(new Date('2026-08-31T09:00:00'))[0].value).toBe('2026-09-01T18:00');
  });

  it('年をまたいでも繰り上がる', () => {
    expect(duePresets(new Date('2026-12-30T09:00:00'))[1].value).toBe('2027-01-02T18:00');
  });

  it('基準の時刻に関係なく 18:00 になる', () => {
    expect(duePresets(new Date('2026-08-07T23:59:00'))[0].value).toBe('2026-08-08T18:00');
  });
});

describe('dueLabel — 期限の見え方', () => {
  const today = '2026-08-07';

  it('期限未設定', () => {
    expect(dueLabel(null, today)).toEqual({ text: '期限未設定', tone: 'none' });
    expect(dueLabel('', today).tone).toBe('none');
  });

  it('当日は「本日」（✕「今日まで」）', () => {
    expect(dueLabel('2026-08-07', today)).toEqual({ text: '本日', tone: 'today' });
  });

  it('**超過したものを「残り -2日」と出さない**', () => {
    expect(dueLabel('2026-08-05', today)).toEqual({ text: '2日超過', tone: 'over' });
  });

  it('1日だけ過ぎた', () => {
    expect(dueLabel('2026-08-06', today).text).toBe('1日超過');
  });

  it('7日以内は「残りN日」（✕「あと N日」）', () => {
    expect(dueLabel('2026-08-09', today)).toEqual({ text: '残り2日', tone: 'soon' });
    expect(dueLabel('2026-08-14', today)).toEqual({ text: '残り7日', tone: 'soon' });
  });

  it('8日以上先は日付で出す（何日後かは押す理由にならない）', () => {
    expect(dueLabel('2026-08-15', today)).toEqual({ text: '08/15', tone: 'far' });
  });

  it('時刻が付いていても日付だけ見る', () => {
    expect(dueLabel('2026-08-07T18:00', today).tone).toBe('today');
    expect(dueLabel('2026-08-05T23:59', today).tone).toBe('over');
  });

  it('月をまたいだ超過も日数で数える', () => {
    expect(dueLabel('2026-07-31', '2026-08-02').text).toBe('2日超過');
  });
});

describe('スマホと見なす幅', () => {
  it('**Tailwind の lg と同じ**（CSS と JS がずれると片方だけ切り替わる）', () => {
    expect(MOBILE_MAX).toBe(1023);
  });
});
