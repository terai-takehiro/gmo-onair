/**
 * **督促は「節目だけ」出す**（ユーザーからの指摘「ゴミ通知が多い／真に必要な通知を見極めて」）
 *
 * ── なぜ試験を書くか ────────────────────────────────────────
 *
 * ⚠️ **これは「動いているように見える」種類の間違いです。**
 * `ref_date` に今日の日付を入れても通知はちゃんと出るので、画面を見ている限り
 * 何も壊れていません。気づけるのは**1か月後に同じ督促が 30 通たまったとき**だけです。
 *
 * ここで固定するのは2つ:
 *   ①節目の境目（0/1/6/7/29/30/59/60/89/90 …）
 *   ②**「ちょうどその日」で判定していないこと** — コンテナが1日落ちていた日の
 *     節目が永久に飛ぶため（`scheduler.service.ts` 冒頭の設計思想）
 */
import { describe, it, expect } from 'vitest';
import { reminderBucket, REMINDER_CADENCE_TEXT } from '../../server/src/shared/services/reminder-bucket';

describe('節目の境目', () => {
  it('遅れていないうちは出さない', () => {
    // 期日当日（0 日）はまだ「遅れ」ではない。ここで出すと入金と行き違う
    expect(reminderBucket(0)).toBeNull();
    expect(reminderBucket(-1)).toBeNull();
    expect(reminderBucket(-30)).toBeNull();
  });

  it('1〜6 日は `late:1`（気づいていない可能性がある。すぐ1通）', () => {
    expect(reminderBucket(1)).toBe('late:1');
    expect(reminderBucket(3)).toBe('late:1');
    expect(reminderBucket(6)).toBe('late:1');
  });

  it('7〜29 日は `late:7`（1週間・先方の締め日を1回またいだ）', () => {
    expect(reminderBucket(7)).toBe('late:7');
    expect(reminderBucket(29)).toBe('late:7');
  });

  it('30〜59 日は `late:30`（1か月）', () => {
    expect(reminderBucket(30)).toBe('late:30');
    expect(reminderBucket(59)).toBe('late:30');
  });

  it('60 日以降は 30 日ごと', () => {
    expect(reminderBucket(60)).toBe('late:60');
    expect(reminderBucket(89)).toBe('late:60');
    expect(reminderBucket(90)).toBe('late:90');
    expect(reminderBucket(119)).toBe('late:90');
    expect(reminderBucket(120)).toBe('late:120');
    expect(reminderBucket(365)).toBe('late:360');
  });
});

describe('⚠️ 「ちょうどその日」で判定していない', () => {
  /*
   * ここが試験の要点です。定時実行は「15 分ごとに起きて、過ぎていれば流す」形で、
   * **起きられなかった日がある**前提で作ってあります（デプロイ中・コンテナ停止）。
   * `daysLate === 7` のような判定だと、その日に起きられなかった督促は
   * **次の判定（30 日目）まで飛びます**。
   */
  it('節目の日に起きられなくても、翌日以降が同じ鍵になる', () => {
    // 7 日目に落ちていても 8 日目に同じ `late:7` が出る（＝飛ばない）
    expect(reminderBucket(8)).toBe(reminderBucket(7));
    expect(reminderBucket(31)).toBe(reminderBucket(30));
    expect(reminderBucket(61)).toBe(reminderBucket(60));
  });

  it('節目のあいだは鍵が変わらない（＝一意索引が2通目を弾く）', () => {
    const week = new Set([7, 10, 15, 20, 29].map(reminderBucket));
    expect(week.size).toBe(1);
    const month = new Set([30, 40, 50, 59].map(reminderBucket));
    expect(month.size).toBe(1);
  });

  it('節目をまたぐと鍵が変わる（＝そこで1通だけ出る）', () => {
    const keys = [1, 7, 30, 60, 90, 120].map(reminderBucket);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('1年放置しても届くのは 14 通まで（毎日なら 365 通）', () => {
    const keys = new Set<string>();
    for (let d = 1; d <= 365; d++) {
      const k = reminderBucket(d);
      if (k) keys.add(k);
    }
    // late:1 / 7 / 30 と、60 / 90 / … / 360 の 11 個 ＝ あわせて 14 個
    expect(keys.size).toBe(14);
  });
});

describe('壊れた入力で毎日出す形に落ちない', () => {
  it('NaN・Infinity は出さない（黙って `late:1` を返さない）', () => {
    expect(reminderBucket(NaN)).toBeNull();
    expect(reminderBucket(Infinity)).toBeNull();
  });

  it('小数は切り捨てる（日をまたぐ計算の丸め違いで鍵が揺れない）', () => {
    expect(reminderBucket(6.9)).toBe('late:1');
    expect(reminderBucket(7.1)).toBe('late:7');
  });
});

describe('頻度は人が読める言葉でも持つ', () => {
  it('画面に出す一文がある（減らしたことが伝わらないと意味が無い）', () => {
    // 通知を減らしたのに画面がそれを言わないと、「止まっている」と誤解される
    expect(REMINDER_CADENCE_TEXT).toContain('30日ごと');
    expect(REMINDER_CADENCE_TEXT).toContain('毎日は出しません');
  });
});
