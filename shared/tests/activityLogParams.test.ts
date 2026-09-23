/**
 * 営業活動記録（記録タブ）の URL 引数と担当者の選択肢を固定する（PR #727 の宿題②）
 *
 * ── なぜ試験で固定するか（実際に起きること）────────────────
 *
 * PR #727 では期限の区分をローカル state に持っていたため、`?due=overdue` を付けた
 * リンクを開いても**区分が効きませんでした**。URL の読み書きは画面を開いても
 * 「効いていない」ことに気づきにくい（チップの見た目は既定の「すべて」のまま
 * 自然に見える）ので、ここで往復を固定します。
 *
 * もう1つ守りたいのは**他の引数を壊さないこと**です。営業ダッシュボードの
 * 「期限超過のやること」（`OverduePanel.tsx`）は `?sort=next_action` で入ってくるので、
 * 区分や担当者を書き換えたとき・「すべて解除」したときに `sort` / `view` / `tab` が
 * 消えると、並びが案件別へ飛びます。
 */
import { describe, it, expect } from 'vitest';
import {
  readDue, readUser, readOwner, withDue, withUser, withOwner, withoutFilters, withParam,
  assigneeOptions, ALL_ASSIGNEES, DUE_PARAM, USER_PARAM, OWNER_PARAM,
} from '../../client/src/contexts/sales/pages/activityLog/logParams';

const sp = (s: string) => new URLSearchParams(s);

describe('期限の区分（?due=）', () => {
  it('無いときは既定の `all`', () => {
    expect(readDue(sp(''))).toBe('all');
  });

  it('契約にある4区分はそのまま読む', () => {
    for (const k of ['overdue', 'today', 'week', 'none'] as const) {
      expect(readDue(sp(`due=${k}`))).toBe(k);
    }
  });

  it('契約に無い綴り（`later` など）は `all` に倒す — サーバーの `parseDueBucket` と同じ', () => {
    expect(readDue(sp('due=later'))).toBe('all');
    expect(readDue(sp('due=OVERDUE'))).toBe('all');
    expect(readDue(sp('due='))).toBe('all');
  });

  it('`all` を書くと引数ごと消える（同じ画面に2通りの URL を作らない）', () => {
    expect(withDue(sp('due=overdue'), 'all').has(DUE_PARAM)).toBe(false);
  });

  it('書いて読むと同じ値に戻る（往復）', () => {
    for (const k of ['all', 'overdue', 'today', 'week', 'none'] as const) {
      expect(readDue(withDue(sp(''), k))).toBe(k);
    }
  });

  it('`sort` / `view` / `tab` / `user` を壊さない', () => {
    const next = withDue(sp('tab=log&view=timeline&sort=next_action&user=u1'), 'today');
    expect(next.get('due')).toBe('today');
    expect(next.get('sort')).toBe('next_action');
    expect(next.get('view')).toBe('timeline');
    expect(next.get('tab')).toBe('log');
    expect(next.get('user')).toBe('u1');
  });

  it('受け取った引数を書き換えない（新しい実体を返す）', () => {
    const before = sp('due=overdue');
    withDue(before, 'week');
    expect(before.get('due')).toBe('overdue');
  });
});

describe('記録者（?user=）', () => {
  it('無いときは空文字＝すべて', () => {
    expect(readUser(sp(''))).toBe('');
  });

  it('前後の空白は落とす', () => {
    expect(readUser(sp('user=%20u1%20'))).toBe('u1');
  });

  it('空文字を書くと引数ごと消える', () => {
    expect(withUser(sp('user=u1'), '').has(USER_PARAM)).toBe(false);
    expect(withUser(sp('user=u1'), '   ').has(USER_PARAM)).toBe(false);
  });

  it('書いて読むと同じ id に戻る', () => {
    expect(readUser(withUser(sp('due=week'), 'user-123'))).toBe('user-123');
  });
});

describe('案件の担当者（?owner=）', () => {
  it('無いときは空文字＝すべて', () => {
    expect(readOwner(sp(''))).toBe('');
  });

  it('空文字を書くと引数ごと消える', () => {
    expect(withOwner(sp('owner=u1'), ' ').has(OWNER_PARAM)).toBe(false);
  });

  it('記録者（?user=）とは別の引数として持つ（片方を書き換えても他方は残る）', () => {
    const next = withOwner(sp('user=u1'), 'u2');
    expect(readOwner(next)).toBe('u2');
    expect(readUser(next)).toBe('u1');
  });
});

describe('すべて解除', () => {
  it('`due` と `user` と `owner` だけを消し、`sort` / `view` / `tab` は残す', () => {
    const next = withoutFilters(sp('tab=log&sort=next_action&due=overdue&user=u1&owner=u2'));
    expect(next.has('due')).toBe(false);
    expect(next.has('user')).toBe(false);
    expect(next.has('owner')).toBe(false);
    // ⚠️ `sort` を消すと `?sort=next_action` だけで来た入口が案件別へ飛ぶ
    expect(next.get('sort')).toBe('next_action');
    expect(next.get('tab')).toBe('log');
  });

  it('withParam は null / 空文字で消し、値があれば置き換える', () => {
    expect(withParam(sp('a=1'), 'a', null).has('a')).toBe(false);
    expect(withParam(sp('a=1'), 'a', '').has('a')).toBe(false);
    expect(withParam(sp('a=1'), 'a', '2').get('a')).toBe('2');
  });
});

describe('担当者の選択肢', () => {
  const users = [
    { id: 'u1', name: '青木' },
    { id: 'u2', name: '佐藤' },
    { id: 'u3', name: '山田' },
  ];

  it('先頭が「すべて」、次が「自分（名前）」、自分は一覧から外して二重に出さない', () => {
    const opts = assigneeOptions(users, 'u2', '');
    expect(opts.map((o) => o.value)).toEqual([ALL_ASSIGNEES, 'u2', 'u1', 'u3']);
    expect(opts[0].label).toBe('すべて');
    expect(opts[1].label).toBe('自分（佐藤）');
  });

  it('一覧を読む前でも「自分」は出る（名前は付けない）', () => {
    const opts = assigneeOptions([], 'u2', '');
    expect(opts.map((o) => o.label)).toEqual(['すべて', '自分']);
  });

  it('自分が分からない（未ログイン）ときは「自分」を出さない', () => {
    const opts = assigneeOptions(users, null, '');
    expect(opts.map((o) => o.value)).toEqual([ALL_ASSIGNEES, 'u1', 'u2', 'u3']);
  });

  it('URL で指定された id が一覧に無くても選択肢に残す（何で絞っているか画面から消さない）', () => {
    const opts = assigneeOptions(users, 'u2', 'gone');
    expect(opts.at(-1)).toEqual({ value: 'gone', label: '指定の記録者' });
  });

  it('指定の id が一覧にあるときは足さない', () => {
    const opts = assigneeOptions(users, 'u2', 'u3');
    expect(opts.filter((o) => o.value === 'u3')).toHaveLength(1);
  });
});
