/**
 * 予約を書き換えたあと、**案件側も読み直しているか**を見る検査
 *
 * ── なぜこれが要るか（実際に起きたこと）────────────────────────
 *
 * v4.1.1 で「カレンダーの予約 → 案件の実施日」の書き戻しを足しました
 * （`server/.../project-event-dates.service.ts`）。**サーバーは直すのに、
 * 画面が読み直していませんでした**（レビューでの指摘 #164・P1）。
 *
 * 共通の `QueryClient` は `staleTime: 60_000` ＋ `refetchOnWindowFocus: false` なので、
 * 予約を動かして案件詳細に戻ると**最大60秒は古い実施日が出ます**。
 * つまり**書き戻しを足した回に、利用者から見た症状はそのまま残っていました**。
 *
 * ⚠️ **書き忘れてもエラーは出ません。** 60秒待てば直るので、
 * 「たまたま古かった」で終わり、**誰も報告しません**。
 * 型検査にも lint にも出ない（鍵の文字列が1つ足りないだけ）ので、
 * **ソースを読んで固定する以外に気づく方法がありません**。
 *
 * ── 何を見ているか ──────────────────────────────────────────
 *
 * ① `client/src` のうち **`/studios/bookings` を書き換えている**ファイルを集める
 *    （`api.post` / `api.put` / `api.patch` / `api.delete`。`api.get` は読むだけ）
 * ② そのファイルが `invalidateBookingQueries` を呼んでいることを見る
 * ③ 鍵の一覧に**案件の2つ**（`project` / `projects`）が入っていることを見る
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BOOKING_AFFECTED_KEYS, invalidateBookingQueries } from '../../client/src/lib/bookingQueries';

const ROOT = join(__dirname, '..', '..');
const CLIENT_SRC = join(ROOT, 'client', 'src');

/** 予約の口を**書き換える**呼び出し。`api.get('/studios/bookings')` は読むだけなので数えない */
const MUTATING_CALL = /api\.(post|put|patch|delete)\(\s*[`'"][^`'"]*\/studios\/bookings/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** `/studios/bookings` を書き換えているファイル（リポジトリからの相対パス） */
function mutatingFiles(): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  for (const p of walk(CLIENT_SRC)) {
    const text = readFileSync(p, 'utf8');
    if (MUTATING_CALL.test(text)) found.push({ path: relative(ROOT, p), text });
  }
  return found;
}

describe('BOOKING_AFFECTED_KEYS — 予約を触ると古くなるもの', () => {
  const keys = BOOKING_AFFECTED_KEYS.map((k) => k[0]);

  it('カレンダーと案件詳細の予約一覧が入っている', () => {
    expect(keys).toContain('studio-bookings');
    expect(keys).toContain('project-studio-bookings');
  });

  it('**案件詳細**が入っている（実施日を出しているのはここ）', () => {
    expect(keys).toContain('project');
  });

  it('**案件一覧・案件台帳**が入っている（実施日で並ぶ）', () => {
    expect(keys).toContain('projects');
  });

  it('鍵は重複しない（同じものを2回落とさない）', () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('`project` は `project-studio-bookings` に当たらない（要素ごとの比較なので別物）', () => {
    // react-query の前方一致は**配列の要素ごと**。文字列の前方一致だと思って
    // `['project']` だけ落とすと、予約一覧まで落ちていると誤解する
    expect(keys).toContain('project-studio-bookings');
    expect('project-studio-bookings'.startsWith('project')).toBe(true); // 文字列としては前方一致するが
    expect(keys.includes('project-studio-bookings')).toBe(true);        // 別の鍵として持つ必要がある
  });

  it('呼ぶと一覧のぶんだけ落とす', () => {
    const called: unknown[][] = [];
    invalidateBookingQueries({
      invalidateQueries: ({ queryKey }) => called.push([...queryKey]),
    });
    expect(called).toEqual(BOOKING_AFFECTED_KEYS.map((k) => [...k]));
  });
});

describe('予約を書き換える画面は、案件側も読み直す', () => {
  const files = mutatingFiles();

  it('書き換えている画面が見つかる（正規表現が腐っていないこと）', () => {
    // 着手時点で6か所。**減ったら検査が空振りしている**ので気づけるようにする
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it.each(files.map((f) => f.path))('%s が invalidateBookingQueries を呼ぶ', (path) => {
    const file = files.find((f) => f.path === path)!;
    expect(file.text).toMatch(/invalidateBookingQueries\s*\(/);
  });

  it('予約の鍵を素で落としている画面が残っていない（写すとまた案件側を書き忘れる）', () => {
    const raw = files.filter((f) =>
      /invalidateQueries\(\{\s*queryKey:\s*\[\s*['"]studio-bookings['"]/.test(f.text)
      || /invalidateQueries\(\{\s*queryKey:\s*\[\s*['"]project-studio-bookings['"]/.test(f.text));
    expect(raw.map((f) => f.path)).toEqual([]);
  });
});
