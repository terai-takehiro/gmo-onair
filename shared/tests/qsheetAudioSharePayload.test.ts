/**
 * **公開音声サポート API が `masters.persons` / `micTypes` を素通しで返していないか**
 *
 * ── なぜこれが要るか ────────────────────────────────────────
 *
 * `public-audio.routes.ts` は認証なしで叩ける公開エンドポイント。
 * `masters.persons` / `masters.micTypes` はその資料に登録された人名・マイク種別を
 * **そのまま全件返すと個人情報の漏洩になる**ため、実装設計 02 §6-1 の決めどおり
 * 「その台本のマイク香盤に実際に出てくる名前だけ」に絞ってある
 * （`server/src/contexts/qsheet/routes/public-audio.routes.ts` の `usedPersons` /
 * `usedMicTypes` フィルタ）。
 *
 * ここは**型が `string[]` のままなので型検査では捕まらない**（将来また
 * 「とりあえず動くように」で素通しに戻しやすい場所）。ソースを直接読んで、
 * 素通しの書き方（`Array.isArray(masters.persons) ? masters.persons :`）が
 * 戻っていないこと・絞り込みのロジックが残っていることを検査する。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SOURCE = readFileSync(
  join(ROOT, 'server', 'src', 'contexts', 'qsheet', 'routes', 'public-audio.routes.ts'),
  'utf8',
);

describe('公開音声サポート API は masters.persons / micTypes を絞って返す', () => {
  it('素通しの書き方 (フィルタなしでそのまま代入) が戻っていない', () => {
    // 旧実装: `persons: Array.isArray(masters.persons) ? masters.persons : []`
    // (フィルタが挟まっていない = 全件そのまま返す書き方)
    expect(SOURCE).not.toMatch(/persons:\s*Array\.isArray\(masters\.persons\)\s*\?\s*masters\.persons\s*:/);
    expect(SOURCE).not.toMatch(/micTypes:\s*Array\.isArray\(masters\.micTypes\)\s*\?\s*masters\.micTypes\s*:/);
  });

  it('香盤に実際に出てくる名前だけに絞るロジックが存在する', () => {
    expect(SOURCE).toMatch(/usedPersons/);
    expect(SOURCE).toMatch(/usedMicTypes/);
    // persons/micTypes の代入が usedPersons/usedMicTypes の has() でフィルタされていること
    expect(SOURCE).toMatch(/masters\.persons\.filter\([\s\S]{0,40}usedPersons\.has/);
    expect(SOURCE).toMatch(/masters\.micTypes\.filter\([\s\S]{0,40}usedMicTypes\.has/);
  });

  it('micChannels は絞らない（公開画面がそのまま使うため）', () => {
    expect(SOURCE).toMatch(/micChannels:\s*Array\.isArray\(masters\.micChannels\)\s*\?\s*masters\.micChannels\s*:/);
  });
});
