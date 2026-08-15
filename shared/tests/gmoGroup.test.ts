/**
 * グループ会社の見立て（GMO とついているか）と、印を落とさない登録の道
 *
 * ── ①②: 2つの写しが同じ答えを出すこと ─────────────────────
 *
 * この製品は **server が `shared/` を import しない構成**（`rootDir` が
 * `server/src`）なので、同じ関数が2か所にあります:
 *
 *   server … `server/src/shared/services/gmo-group.ts`（保存する値を決める）
 *   画面   … `shared/src/utils/gmoGroup.ts`（打ったその場でチェックを入れて見せる）
 *
 * **食い違うと、チェックが入って見えるのに保存すると外れます**（逆も）。
 * 押した人には「押したのに入っていない」としか見えず、しかも**型検査にも
 * lint にも出ません**（どちらも正しい関数です）。ここで両方を読んで固定します。
 *
 * ── ③: 顧客・取引先を作る道が印を落としていないか ────────────
 *
 * 顧客は**マスターの画面以外からも増えます**（MCP・メール取込・Excel 取込・
 * 決算取込・内覧会）。そこで印を入れ忘れると、その会社の案件だけ
 * **グループ外のまま**になり、見積に定価が並びます。**空のまま残るだけなので
 * 誰も報告しません**（v4.0.27 の「移行の取りこぼし」と同じ壊れ方）。
 *
 * → 登録の SQL を集めて、`is_gmo_group` を書いているかを見ます。
 *   わざと書かないものは `ALLOW` に**理由付きで**足してください。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { looksLikeGmoGroup as serverImpl } from '../../server/src/shared/services/gmo-group';
import { looksLikeGmoGroup as clientImpl } from '../src/utils/gmoGroup';

const ROOT = join(__dirname, '..', '..');
const SERVER_SRC = join(ROOT, 'server', 'src');

/** 見立ての表。**両方の写しをこの表で突き合わせます** */
const CASES: { name: string; group: boolean; why: string }[] = [
  { name: 'GMOインターネットグループ株式会社', group: true, why: '素直な一致' },
  { name: '株式会社GMOペパボ', group: true, why: '前株でも拾う' },
  { name: 'ＧＭＯペパボ株式会社', group: true, why: '全角の GMO（これを落とすとその会社だけ漏れる）' },
  { name: 'ｇｍｏあおぞらネット銀行', group: true, why: '全角の小文字' },
  { name: 'gmoグローバルサイン', group: true, why: '半角の小文字' },
  { name: '自社（GMOグローバルスタジオ）', group: true, why: 'GPM の自社行（内部の工事は internal のまま）' },
  { name: '株式会社サイバーエージェント', group: false, why: 'グループ外' },
  { name: '日本放送協会', group: false, why: '英字が無い' },
  { name: '', group: false, why: '空は分からない（分からないものをグループにしない）' },
  { name: '   ', group: false, why: '空白だけも同じ' },
];

describe('looksLikeGmoGroup（社名の見立て）', () => {
  for (const c of CASES) {
    it(`${c.name || '(空)'} → ${c.group ? 'グループ' : 'グループ外'}（${c.why}）`, () => {
      expect(serverImpl(c.name)).toBe(c.group);
    });
  }

  it('null / undefined は false（推測でグループにしない）', () => {
    expect(serverImpl(null)).toBe(false);
    expect(serverImpl(undefined)).toBe(false);
  });
});

describe('server と画面の写しが食い違っていない', () => {
  it('表のすべてで同じ答えになる', () => {
    for (const c of CASES) {
      expect(clientImpl(c.name), `${c.name} で食い違い`).toBe(serverImpl(c.name));
    }
  });

  it('null / undefined でも同じ', () => {
    expect(clientImpl(null)).toBe(serverImpl(null));
    expect(clientImpl(undefined)).toBe(serverImpl(undefined));
  });
});

// ── ③ 登録の道が印を落としていないか ────────────────────────

/** わざと書かないもの。**理由を必ず添える**（いまは1つもありません） */
const ALLOW: { file: string; table: string; why: string }[] = [];

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** `//` の行注釈を落とす（説明文に書いた SQL で落ちないように） */
function stripLineComments(source: string): string {
  return source.replace(/^\s*(\/\/|\*).*$/gm, '');
}

describe('顧客・取引先を作る SQL がグループの印を書いている', () => {
  it('INSERT のすべてに is_gmo_group がある', () => {
    const missing: string[] = [];
    for (const file of tsFiles(SERVER_SRC)) {
      if (file.includes(`${'db'}/migrations`)) continue;
      const source = stripLineComments(readFileSync(file, 'utf8'));
      for (const m of source.matchAll(/INSERT\s+INTO\s+(customers|companies)\s*\(([^)]*)\)/gi)) {
        const table = m[1].toLowerCase();
        const columns = m[2].toLowerCase();
        if (columns.includes('is_gmo_group')) continue;
        const rel = file.slice(SERVER_SRC.length + 1).replace(/\\/g, '/');
        if (ALLOW.some((a) => rel.endsWith(a.file) && a.table === table)) continue;
        missing.push(`${rel} … INSERT INTO ${table}`);
      }
    }
    expect(missing, `グループの印を書いていない登録があります:\n${missing.join('\n')}`).toEqual([]);
  });
});
