/**
 * 制作技術支援トップ（`/techops/top`）の一覧の組み立てを固定する。
 *
 * **画面を見ても間違いに気づけない部分です。** 実際に本番で起きていたのは:
 *   ・工事・構築のプロジェクト（`GLS-B009`「ようが夏まつり」・`GMO-0001`「第3本社
 *     プロジェクト」など）が、番組・イベントを選ぶ一覧に混ざっていた
 *   ・日付を1つも持たない案件は**完了しても永久に本体の一覧へ残っていた**
 *     （`last_date` が無いものを「終了しない扱い」にしていたため）
 *   ・並びが放送順なのに**日付を画面に1つも出していなかった**ので、
 *     なぜその順なのか・いつやるのかが読めなかった
 *
 * 出す／出さないの絞り込み自体はサーバー（`top.routes.ts`）が行うので、
 * ここではその SQL の条件が消えていないことも本文で見る。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isArchived, topItemSchedule, sortMainList, upcomingItems, sortArchive, matchesSearch,
  eligibleRecents,
} from '../../client-techops/src/pages/top/topHelpers';
import { countdownLabel } from '../../client-techops/src/lib/dateFmt';
import type { TopItem } from '../../client-techops/src/lib/topApi';

const TODAY = '2026-09-08';

const item = (over: Partial<TopItem> & { name: string }): TopItem => ({
  kind: 'gls',
  id: over.name,
  gls_number: null,
  customer_name: null,
  next_date: null,
  last_date: null,
  stage: null,
  retired_numbers: [],
  ...over,
});

describe('topItemSchedule — その項目の「いつ」を1つに決める', () => {
  it('これからの本番は next', () => {
    const s = topItemSchedule(item({ name: 'A', next_date: '2026-09-16', last_date: '2026-09-16' }), TODAY);
    expect(s).toEqual({ kind: 'next', date: '2026-09-16' });
  });

  it('始まっているが最終日がまだ先なら ongoing（複数日のイベント）', () => {
    // 10/22〜10/24 の生放送を 10/23 に開いた形。next_date は無く last_date だけ先にある
    const s = topItemSchedule(item({ name: 'B', last_date: '2026-10-24' }), '2026-10-23');
    expect(s).toEqual({ kind: 'ongoing', date: '2026-10-24' });
  });

  it('最後の回が過ぎていれば done', () => {
    const s = topItemSchedule(item({ name: 'C', last_date: '2026-09-03' }), TODAY);
    expect(s).toEqual({ kind: 'done', date: '2026-09-03' });
  });

  it('日付を1つも持たなければ none', () => {
    expect(topItemSchedule(item({ name: 'D' }), TODAY)).toEqual({ kind: 'none' });
  });
});

describe('「最近開いた項目」は一覧に出ないものを出さない（Codex P2・PR #646）', () => {
  // 履歴は端末の localStorage で一覧とは別の入れ物なので、サーバーで外した案件が
  // 前に開かれていれば履歴にだけ残り続ける（直接URLで開いても足される）
  const recents = [
    { kind: 'project' as const, id: 'p-gmo', name: 'GMO第3本社プロジェクト', at: '2026-09-08T00:00:00Z' },
    { kind: 'project' as const, id: 'p-ok', name: '第20期 事業計画発表会', at: '2026-09-07T00:00:00Z' },
    { kind: 'program' as const, id: 'prog-1', name: 'ここだけの番組', at: '2026-09-06T00:00:00Z' },
  ];

  it('一覧に居る案件・番組だけ通す', () => {
    const items = [
      item({ name: '第20期 事業計画発表会', id: 'p-ok' }),
      item({ name: 'ここだけの番組', id: 'prog-1', kind: 'own' }),
    ];
    expect(eligibleRecents(recents, items).map((e) => e.id)).toEqual(['p-ok', 'prog-1']);
  });

  it('履歴の project/program と一覧の gls/own を取り違えない', () => {
    // 同じ id の「案件」と「番組」が居ても、種類が違えば別物
    const items = [item({ name: 'まぎらわしい', id: 'prog-1', kind: 'gls' })];
    expect(eligibleRecents(recents, items)).toEqual([]);
  });

  it('一覧がまだ空（読み込み中・失敗）なら何も出さない', () => {
    expect(eligibleRecents(recents, [])).toEqual([]);
  });
});

describe('isArchived — 終わったものだけ畳む', () => {
  it('これから本番があるものは、どのステージでも畳まない', () => {
    const it1 = item({ name: 'A', next_date: '2026-09-16', stage: 's_completed' });
    expect(isArchived(it1, TODAY)).toBe(false);
  });

  it('最後の回の翌日から畳む', () => {
    const done = item({ name: 'B', last_date: '2026-09-07' });
    expect(isArchived(done, TODAY)).toBe(true);
    // 当日はまだ本体に残す（当日の朝に一覧から消えると現場が探せない）
    expect(isArchived(item({ name: 'C', last_date: TODAY }), TODAY)).toBe(false);
  });

  it('⚠️ 日付が1つも無くても、実施済・完了なら畳む（永久に残らないようにする）', () => {
    expect(isArchived(item({ name: 'D', stage: 's_completed' }), TODAY)).toBe(true);
    expect(isArchived(item({ name: 'E', stage: 'r_delivered' }), TODAY)).toBe(true);
  });

  it('日付が無いだけで、まだ動いている案件は本体に残す', () => {
    // 実施日調整中の口頭決定（GLS-A025「新サービス発表記者会見」がこの形だった）
    expect(isArchived(item({ name: 'F', stage: 'b_verbal' }), TODAY)).toBe(false);
    // ここだけの番組（ステージを持たない）で実施日未定のもの
    expect(isArchived(item({ name: 'G', kind: 'own' }), TODAY)).toBe(false);
  });
});

describe('sortMainList — 放送順（本番日の昇順）・日程未定は最後', () => {
  it('日付の早い順に並び、未定は後ろへ回る', () => {
    const list = sortMainList([
      item({ name: '未定', stage: 'b_verbal' }),
      item({ name: '12月', next_date: '2026-12-04' }),
      item({ name: '9月', next_date: '2026-09-16' }),
      item({ name: '10月', next_date: '2026-10-08' }),
    ], TODAY);
    expect(list.map((i) => i.name)).toEqual(['9月', '10月', '12月', '未定']);
  });

  it('同じ日は名前で決める（引くたびに入れ替わって見えないように）', () => {
    const list = sortMainList([
      item({ name: 'い', next_date: '2026-10-06' }),
      item({ name: 'あ', next_date: '2026-10-06' }),
    ], TODAY);
    expect(list.map((i) => i.name)).toEqual(['あ', 'い']);
  });

  it('開催中（複数日イベントの途中）も日付の軸に乗る', () => {
    const list = sortMainList([
      item({ name: '来月', next_date: '2026-11-20' }),
      item({ name: '開催中', last_date: '2026-09-10' }),
    ], TODAY);
    expect(list.map((i) => i.name)).toEqual(['開催中', '来月']);
  });
});

describe('countdownLabel — 行に添える残り日数', () => {
  it('本日・明日・残りN日（✕「今日」「あとN日」・docs/wording.md ルール8・9）', () => {
    expect(countdownLabel('2026-09-08', TODAY)).toBe('本日');
    expect(countdownLabel('2026-09-09', TODAY)).toBe('明日');
    expect(countdownLabel('2026-09-16', TODAY)).toBe('残り8日');
  });

  it('遠い先と過ぎた日は空（日付そのものを出しているので数字は足さない）', () => {
    expect(countdownLabel('2026-12-04', TODAY)).toBe('');
    expect(countdownLabel('2026-09-03', TODAY)).toBe('');
  });
});

describe('そのほかの並び・検索は今までどおり', () => {
  it('「直近の本番・収録」は next_date 昇順の先頭3件', () => {
    const up = upcomingItems([
      item({ name: 'c', next_date: '2026-11-20' }),
      item({ name: 'a', next_date: '2026-09-16' }),
      item({ name: 'd', next_date: '2026-12-04' }),
      item({ name: 'b', next_date: '2026-10-08' }),
      item({ name: '未定' }),
    ]);
    expect(up.map((i) => i.name)).toEqual(['a', 'b', 'c']);
  });

  it('アーカイブは最後の回が新しい順', () => {
    const list = sortArchive([
      item({ name: '古', last_date: '2026-06-05' }),
      item({ name: '新', last_date: '2026-09-03' }),
    ]);
    expect(list.map((i) => i.name)).toEqual(['新', '古']);
  });

  it('改番で退役した旧番号でも検索に当たる（§4.10）', () => {
    const renamed = item({ name: 'COMPASS', gls_number: 'SCS-0001', retired_numbers: ['GLS-A012'] });
    expect(matchesSearch(renamed, 'GLS-A012')).toBe(true);
    expect(matchesSearch(renamed, 'SCS-0001')).toBe(true);
  });
});

describe('サーバー（top.routes.ts）が制作物にならない案件を外している', () => {
  const sql = readFileSync(
    join(__dirname, '../../server/src/contexts/qsheet/routes/top.routes.ts'),
    'utf8',
  );

  it('工事・構築のプロジェクト（案件分類 B）を出さない', () => {
    // 分類が未設定の古い案件は A 扱い（「案件を編集」・missingOf と同じ基準・v4.6.6）
    expect(sql).toMatch(/COALESCE\(p\.gls_category, 'A'\) <> 'B'/);
  });

  it('失注を出さない', () => {
    expect(sql).toMatch(/p\.stage <> 'e_lost'/);
  });

  it('日付の列は空文字を通さない（`nextDayStr("")` で落ちないように）', () => {
    expect(sql).toMatch(/NULLIF\(p\.event_start, ''\)/);
    expect(sql).toMatch(/NULLIF\(p\.event_end, ''\)/);
  });

  it('開始日が無く終了日だけ未来なら、その終了日を next_date に入れる（Codex P2）', () => {
    // 入れないと `last_date` だけ未来になり、画面が「開催中」と誤って読む
    expect(sql).toMatch(/NULLIF\(p\.event_start, ''\) IS NULL\s*\n?\s*AND NULLIF\(p\.event_end, ''\) >=/);
  });
});
