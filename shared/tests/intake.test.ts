/**
 * 投入口の1本化（v4）— 画面を見ても気づけない部分を固定する
 *
 * ここで固定しているのは3つです:
 *
 * 1. **姓の取り出し**（挨拶）。「寺井 剛弘」→「寺井」。
 *    ずれても画面には別の名前が出るだけで、**本人以外は気づけません**。
 * 2. **行き先の正規化**（`normalizeDest`）。知らない値を素通しさせると、
 *    サーバーが分岐に失敗して**何も作らずに 200 を返す**形になりえます。
 * 3. **登録できない理由**（`rowBlockers`）。サーバーの検証と同じ条件でないと、
 *    押したあとに 400 で戻され、**どの行が悪いのか画面に出ません**。
 */
import { describe, it, expect } from 'vitest';
import { familyName } from '../../client/src/contexts/platform/pages/home/Greeting';
import { rowBlockers, destOf, type Row } from '../../client/src/contexts/tasks/components/intake/types';
import { normalizeDest, parseDue } from '../../server/src/contexts/tasks/services/intake-parser.service';
import { jstNaive } from '../../server/src/shared/utils/jst';

describe('familyName — 挨拶は姓だけ', () => {
  it('半角の空白で切る', () => {
    expect(familyName('寺井 剛弘')).toBe('寺井');
  });

  it('全角の空白でも切る（社内の登録はこちらが多い）', () => {
    expect(familyName('寺井　剛弘')).toBe('寺井');
  });

  it('空白が2つ以上あっても先頭だけ', () => {
    expect(familyName('山田  太郎 次郎')).toBe('山田');
  });

  it('空白が無ければそのまま出す（適当な位置で切ると別人の名前になる）', () => {
    expect(familyName('やまだ')).toBe('やまだ');
  });

  it('前後の空白は落とす', () => {
    expect(familyName('  佐藤 花子 ')).toBe('佐藤');
  });

  it('未設定なら空（「さん」だけが残らないよう呼ぶ側が見る）', () => {
    expect(familyName(null)).toBe('');
    expect(familyName(undefined)).toBe('');
    expect(familyName('   ')).toBe('');
  });
});

describe('normalizeDest — 知らない行き先はタスクに倒す', () => {
  it('4つはそのまま通る', () => {
    expect(normalizeDest('task')).toBe('task');
    expect(normalizeDest('neta')).toBe('neta');
    expect(normalizeDest('log')).toBe('log');
    expect(normalizeDest('minutes')).toBe('minutes');
  });

  it('知らない値・空・未設定はタスク（一番取り消しやすく、必ず人の目に触れる）', () => {
    expect(normalizeDest('project')).toBe('task');
    expect(normalizeDest('')).toBe('task');
    expect(normalizeDest(undefined)).toBe('task');
    expect(normalizeDest(null)).toBe('task');
    expect(normalizeDest(3)).toBe('task');
  });
});

describe('parseDue — 「いま」は JST の壁時計で渡す', () => {
  // コンテナは UTC で動くので、素の new Date() を渡すと JST 朝は「今日」が前日になる。
  // 呼ぶ側（tasks.routes.ts）は jstNaive() を渡す決まり — ここではその組で固定する
  const utc = (iso: string) => new Date(`${iso}Z`);

  it('JST 朝 8 時の「明日」は JST の翌日（UTC の日付で数えると1日早くなる）', () => {
    // UTC 2026-08-31 23:00 = JST 2026-09-01 08:00
    const r = parseDue('A社見積を明日までに送付', jstNaive(utc('2026-08-31T23:00:00')));
    expect(r.dueAt).toBe('2026-09-02 18:00');
  });

  it('JST 夕方に過ぎた時刻だけの指定は翌日に送る（UTC の時計だと過去のまま残る）', () => {
    // UTC 2026-09-01 10:00 = JST 2026-09-01 19:00 → 17時は過ぎているので明日
    const r = parseDue('17時までに提出', jstNaive(utc('2026-09-01T10:00:00')));
    expect(r.dueAt).toBe('2026-09-02 17:00');
  });
});

describe('rowBlockers — 登録の前に決めてもらうこと', () => {
  const base = (over: Partial<Row>): Row => ({
    draft_key: 'd1', title: 'なにかする', checked: true, ...over,
  });

  it('行き先が無い行はタスクとして見る', () => {
    expect(destOf(base({}))).toBe('task');
  });

  it('タスク: 担当者が無いと止める', () => {
    expect(rowBlockers(base({ dest: 'task' }))).toContain('「なにかする」の担当者を選んでください');
  });

  it('タスク: 担当者があれば通る（期限は依頼のときだけ必須）', () => {
    expect(rowBlockers(base({ dest: 'task', assigned_to: 'u1' }))).toEqual([]);
  });

  it('タスク: 依頼（requester_id あり）は期限が要る', () => {
    const r = base({ dest: 'task', assigned_to: 'u1', requester_id: 'u2' });
    expect(rowBlockers(r).some((m) => m.includes('依頼なので期限が必要'))).toBe(true);
  });

  it('ネタ案件: お客様と分類の両方が要る', () => {
    expect(rowBlockers(base({ dest: 'neta' })).length).toBe(2);
    expect(rowBlockers(base({ dest: 'neta', customer_name: 'GMO' })).length).toBe(1);
    expect(rowBlockers(base({ dest: 'neta', customer_name: 'GMO', gls_category: 'A' }))).toEqual([]);
  });

  it('ネタ案件: 空白だけのお客様は「入っていない」と見る', () => {
    const r = base({ dest: 'neta', customer_name: '  ', gls_category: 'B' });
    expect(rowBlockers(r).some((m) => m.includes('お客様'))).toBe(true);
  });

  it('活動記録: 件名だけで通る（相手が分からなくても記録として成立する）', () => {
    expect(rowBlockers(base({ dest: 'log' }))).toEqual([]);
  });

  it('議事録: 案件が要る（project_minutes.project_id は NOT NULL）', () => {
    expect(rowBlockers(base({ dest: 'minutes' })).length).toBe(1);
    expect(rowBlockers(base({ dest: 'minutes', project_id: 'p1' }))).toEqual([]);
  });

  it('内容が空なら、どの行き先でも止める', () => {
    expect(rowBlockers(base({ dest: 'log', title: '   ' }))).toContain('内容が空の行があります');
  });
});
