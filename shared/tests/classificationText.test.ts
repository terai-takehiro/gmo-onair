/**
 * 概要タブの「案件分類」に何を出すか — **出すか出さないかを固定する**
 *
 * ── なぜ固定するか（実際に起きたこと）────────────────────────
 *
 * 案件分類は**2つの持ち方が併存**しています（migration 182）— 旧 `project_type`
 * （1段・7種）と `audience` / `project_category`（2段）。
 *
 * 概要タブは2段が空のとき**旧種類を案件分類として出して**いました。ところが
 * `projects.project_type` の**既定値は `other`** なので、AI が起こしたネタ・
 * 決算取込・投入口からできた案件は**何も選んでいなくても「その他」**と書かれます。
 * 一方**案件を直す画面は2段しか見ない**ので「選ぶ」＝未登録に見えます。
 *
 * → **同じ案件が、画面によって「登録済み」と「未登録」に見えていました**
 *   （ご指摘: 「すでに案件分類を登録していても案件を直すを開くと未登録状態になる」）。
 *
 * ⚠️ **これは型でも lint でも見つかりません**（どちらも「文字列を返す関数」に見える）。
 * 気づけるのは2つの画面を突き合わせた人だけなので、ここで固定します。
 */
import { describe, it, expect } from 'vitest';
import { classificationText } from '../../client/src/contexts/sales/pages/projectDetail/classificationText';

describe('概要タブの案件分類', () => {
  it('2段が揃っていれば2段を出す（旧種類より2段が勝つ）', () => {
    // 公開収録（有観客の収録）は旧分類に受け皿が無く `hybrid_event` に寄せてある。
    // 旧種類を先に見ると「有観客 ・ 配信/生放送」と**別の分類**が出てしまう
    expect(classificationText({
      audience: 'with_audience', project_category: 'recording', project_type: 'hybrid_event',
    })).toBe('有観客 ・ 収録');
  });

  it('2段が片方だけなら出さない（決まっているのか決めていないのか読めない）', () => {
    expect(classificationText({ audience: 'no_audience', project_category: null })).toBeNull();
    expect(classificationText({ audience: null, project_category: 'broadcast' })).toBeNull();
  });

  it('⚠️ 旧種類が `other` のときは出さない（列の既定値なので「決めていない」と同じ）', () => {
    expect(classificationText({ audience: null, project_category: null, project_type: 'other' })).toBeNull();
  });

  it('旧種類が空でも出さない', () => {
    expect(classificationText({ audience: null, project_category: null, project_type: null })).toBeNull();
    expect(classificationText({})).toBeNull();
  });

  it('2段が空でも、旧種類が4種のときは旧種類の名前を出す（保存すればその2段が入る値）', () => {
    expect(classificationText({ project_type: 'live_broadcast' })).toBe('生放送');
    expect(classificationText({ project_type: 'recording' })).toBe('収録');
  });

  it('GLS-B の値は出す（工事・構築は2段を持たないので旧種類が案件分類そのもの）', () => {
    expect(classificationText({ project_type: 'gmo_project' })).toBe('GMO案件');
    expect(classificationText({ project_type: 'consulting' })).toBe('コンサルティング');
  });

  it('知らない値はそのまま出す（黙って空にすると入っている値が消えたように見える）', () => {
    expect(classificationText({ project_type: 'event' })).toBe('event');
  });
});
