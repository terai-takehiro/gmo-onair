/**
 * **タブレットの幅で商品名が消えていないか**を見る検査（機材管理）
 *
 * ── なぜこれが要るか（実測した壊れ方）────────────────────────
 *
 * `RowSlot hideOnMobile` は **640px (`sm`) で列を出し始め**、同じ 640px で
 * `Row stackOnMobile` が**折り返しをやめます**（`sm:flex-nowrap`）。
 * つまり **640px ちょうどで、列が増えるのと1行に詰め込むのが同時に起きます**。
 *
 * 伸びるのは `RowMain`（商品名）だけ・`RowSlot` は `shrink-0` なので、
 * 足りないぶんは**全部 `RowMain` から引かれます**。実測（直す前）:
 *
 *   `equipmentList/RentalGroupRow.tsx`  640px で商品名 **0px**（指摘 #161・P2）
 *   `catalog/CatalogRows.tsx`           640px で **−156px**・768px で **−28px**（はみ出す）
 *   `settings/RentalRulesTab.tsx`       640px で **4px**
 *
 * ⚠️ **375px と 1280px では正常です。** 確かめる幅をその2つにしている限り
 * **一度も見えません**。エラーも警告も出ず、`RowSlot` の幅指定は正しく効いていて、
 * 使う人からは「レイアウトが崩れている」としか見えません
 * （機材台帳が `equipmentLedgerWidth.test.ts` で同じ理由を固定しているのと同じ壊れ方）。
 *
 * ── 何を見ているか ──────────────────────────────────────────
 *
 * `<Row … stackOnMobile>` の塊ごとに `RowSlot w={…}` を足し、
 * **640px と 768px で `RowMain` に何ピクセル残るか**を計算して下限と比べます。
 * 隙間（`gap-3` = 12px）と行の左右余白（`px-4` = 16px × 2）は
 * `shared/src/client/ui/row.tsx` の確定値です。
 *
 * ⚠️ **下限は「読める広さ」ではなく「消えない広さ」です**（下の `FLOOR_PX` 参照）。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { HIDE_UNTIL_EXTRA_WIDE, HIDE_UNTIL_WIDE } from '../../client-equipment/src/lib/rowVisibility';

const ROOT = join(__dirname, '..', '..');
const EQUIPMENT_SRC = join(ROOT, 'client-equipment', 'src');

/** `Row` の `gap-3` と `px-4`（`shared/src/client/ui/row.tsx` の確定値） */
const ROW_GAP = 12;
const ROW_PX = 16;

/** ページ側の左右余白（`p-3` = 12px × 2 が機材管理のいちばん狭い段） */
const PAGE_PX = 12;

/**
 * **商品名に最低これだけ残ること。**
 *
 * ⚠️ **「読みやすい広さ」ではありません。** 台帳が決めた読める下限は
 * `client-equipment/src/pages/equipmentList/types.ts` の `NAME_MIN_PX = 200` で、
 * ここはそこまで要求していません（要求すると、いま 128〜192px で
 * **壊れてはいない**表まで巻き込んで直すことになる）。
 *
 * この検査が止めたいのは「**名前が消える／行がはみ出す**」ほうです。
 * 128px は和文7字ぶんで、`truncate` が効いて**何の行かは読めます**。
 *
 * いま下限に近いのは 保守 136px ／ 拠点 164px ／ 貸出中 200px の3つで、
 * **どれも壊れてはいません**（狭いだけ）。**直した3つは 640px で
 * 256 / 284 / 516px** 残ります。
 */
const FLOOR_PX = 128;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

interface RowBlock {
  path: string;
  line: number;
  /** 幅にかかわらず出ている列 */
  always: number[];
  /** 640px から出る列（`hideOnMobile`） */
  fromSm: number[];
  /** 1024px 以上で出る列（`hideOnMobile` ＋ `HIDE_UNTIL_WIDE` / `HIDE_UNTIL_EXTRA_WIDE`） */
  fromLg: number[];
  hasMain: boolean;
}

/** `<Row … stackOnMobile>` の塊を集める（表頭 `RowHeader` は名前列が固定文字なので見ない） */
function rowBlocks(): RowBlock[] {
  const blocks: RowBlock[] = [];
  for (const p of walk(EQUIPMENT_SRC)) {
    const text = readFileSync(p, 'utf8');
    for (const m of text.matchAll(/<Row\b(.*?)<\/Row>/gs)) {
      const block = m[0];
      const openTag = block.slice(0, block.indexOf('>') + 1);
      if (!/\bstackOnMobile\b/.test(openTag)) continue;   // 折り返す行だけが対象

      const always: number[] = [], fromSm: number[] = [], fromLg: number[] = [];
      for (const s of block.matchAll(/<RowSlot\b([^>]*?)\/?>/gs)) {
        const attrs = s[1];
        const w = /w=\{(\d+)\}/.exec(attrs);
        if (!w) continue;                                  // 変数の幅（台帳）はここでは見ない
        const px = Number(w[1]);
        if (!/\bhideOnMobile\b/.test(attrs)) always.push(px);
        // `HIDE_UNTIL_WIDE`（1024px〜）と `HIDE_UNTIL_EXTRA_WIDE`（1536px〜）の
        // どちらも「640/768px では出ない」ので、この検査では同じ扱いでよい
        else if (/\bHIDE_UNTIL_\w+/.test(attrs)) fromLg.push(px);
        else fromSm.push(px);
      }
      if (always.length + fromSm.length + fromLg.length === 0) continue;

      blocks.push({
        path: relative(ROOT, p),
        line: text.slice(0, m.index).split('\n').length,
        always, fromSm, fromLg,
        hasMain: /<RowMain\b/.test(block),
      });
    }
  }
  return blocks;
}

/** その幅で `RowMain` に残るピクセル（負なら**行が横にはみ出す**） */
function nameWidthAt(viewport: number, b: RowBlock): number {
  const slots = [...b.always, ...b.fromSm, ...(viewport >= 1024 ? b.fromLg : [])];
  const children = slots.length + (b.hasMain ? 1 : 0);
  const fixed = slots.reduce((a, n) => a + n, 0)
    + Math.max(children - 1, 0) * ROW_GAP
    + ROW_PX * 2;
  return viewport - PAGE_PX * 2 - fixed;
}

describe('機材管理の行 — 640px で商品名が消えない', () => {
  const blocks = rowBlocks().filter((b) => b.hasMain);

  it('折り返す行が集まっている（正規表現が腐っていないこと）', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(8);
  });

  it.each(blocks.map((b) => [`${b.path}:${b.line}`, b] as const))(
    '%s — 640px と 768px で商品名が残る',
    (_label, b) => {
      expect(nameWidthAt(640, b)).toBeGreaterThanOrEqual(FLOOR_PX);
      expect(nameWidthAt(768, b)).toBeGreaterThanOrEqual(FLOOR_PX);
    },
  );

  it('直した3つは 640px で 200px 以上残る（台帳の下限 `NAME_MIN_PX`）', () => {
    const fixed = ['RentalGroupRow.tsx', 'CatalogRows.tsx', 'RentalRulesTab.tsx'];
    const targets = blocks.filter((b) => fixed.some((f) => b.path.endsWith(f)) && b.fromLg.length > 0);
    expect(targets.length).toBe(3);
    for (const b of targets) expect(nameWidthAt(640, b)).toBeGreaterThanOrEqual(200);
  });

  /**
   * ⚠️ **狭いところを直すのに列を消してはいけません。**
   * `HIDE_UNTIL_WIDE` は「出てくる幅をずらす」だけで、**PC で見える情報は同じ**です。
   * 列を1つ削れば計算上は通ってしまうので、直した3つの**幅の合計**を固定しておきます
   * （合計が変わる＝列が消えたか幅が変わった）。
   */
  it('直した3つは列を1つも減らしていない（幅の合計が変わらない）', () => {
    const expected: Record<string, number> = {
      'RentalGroupRow.tsx': 504,   // 56 + 128 + 96 + 72 + 96 + 56
      'CatalogRows.tsx': 648,      // 72 + 56 + 72 + 160 + 96 + 96 + 96
      // 種別は 72 → 96（「ネットワーク」が枠を 17px はみ出して隣に乗っていた）
      'RentalRulesTab.tsx': 536,   // 56 + 128 + 96 + 96 + 160
    };
    for (const [file, sum] of Object.entries(expected)) {
      const b = blocks.find((x) => x.path.endsWith(file) && x.fromLg.length > 0);
      expect(b, `${file} の行が見つからない`).toBeTruthy();
      const total = [...b!.always, ...b!.fromSm, ...b!.fromLg].reduce((a, n) => a + n, 0);
      expect(total, file).toBe(sum);
    }
  });
});

describe('HIDE_UNTIL_WIDE — 後から渡して `sm:flex` を打ち消す形になっている', () => {
  it('`sm:hidden` と `lg:flex` の2つを持つ', () => {
    // `sm:hidden` が無いと 640px で `hideOnMobile` の `sm:flex` が生き残り、
    // `lg:flex` が無いと PC でも列が出てこない（どちらも画面を見るまで気づけない）
    expect(HIDE_UNTIL_WIDE).toContain('sm:hidden');
    expect(HIDE_UNTIL_WIDE).toContain('lg:flex');
  });

  it('もう1段（`HIDE_UNTIL_EXTRA_WIDE`）も同じ形で、出す幅だけが違う', () => {
    expect(HIDE_UNTIL_EXTRA_WIDE).toContain('sm:hidden');
    expect(HIDE_UNTIL_EXTRA_WIDE).toContain('2xl:flex');
    expect(HIDE_UNTIL_EXTRA_WIDE).not.toContain('lg:flex');
  });
});
