/**
 * **画面に書いてあることが、探して当たること**（機材の「探す」）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * 探して出てこないと、人は「**台帳に入っていない**」と思います。
 * 実際には入っているので、**もう1台登録される**か、**探すのをやめて人に訊く**
 * ことになります。どちらも画面には何も出ません。
 *
 * しかもこの画面は**自分で3つ約束していました**:
 *
 *   「名前・機材ID・型名・製造番号・メーカー・**保管場所**から探します」
 *   「**全角半角**・ハイフンは区別しません」
 *   「**付属品も一緒に出ます**」
 *
 * **3つとも当たっていませんでした**（レビューでの指摘 #70）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const SERVICE = read('server', 'src', 'contexts', 'equipment', 'services', 'item.service.ts');
const SEARCH = read('client-equipment', 'src', 'pages', 'SearchPage.tsx');

describe('機材を探す', () => {
  it('全角で打っても当たる', () => {
    // 画面は「全角半角・ハイフンは区別しません」と書いているのに、
    // サーバーは打たれた文字をそのまま `ILIKE` に渡していた
    expect(SERVICE).toMatch(/const term = raw\.normalize\('NFKC'\)/);
  });

  /**
   * ⚠️ **打った文字だけを寄せてはいけない**（レビューで指摘された）。
   * 台帳の値のほうが全角だったとき（Excel 取込で `ＦＸ９` と入っている等）、
   * 語だけ寄せると **今まで当たっていたものが当たらなくなります** —
   * 直したつもりで別の当たり方を壊す形でした。
   */
  it('台帳の値が全角でも当たる（両側を寄せる）', () => {
    expect(SERVICE).toMatch(/const norm = \(col: string\) => `normalize\(\$\{col\}, NFKC\)`/);
    // **素のままの比較も残す**（いままで当たっていたものを1つも失わない）
    expect(SERVICE).toMatch(/for \(const c of RAW_COLS\) \{ conds\.push\(`\$\{c\} ILIKE/);
    expect(SERVICE).toMatch(/for \(const c of NORM_COLS\) \{ conds\.push\(`\$\{norm\(c\)\} ILIKE/);
  });

  it('保管場所でも当たる', () => {
    expect(SERVICE).toMatch(/'el\.name', 'ei\.location_detail',/);
  });

  it('付属品（子機材）も出す — 探すのは「その1点を当てる」画面', () => {
    /*
     * 台帳は木で見せるので既定は親だけ。**探すは別の目的**です。
     * 渡さないと、**シールに書いてある機材IDを打っても 0 件**になります
     * （実測: `Y-C-000001` は 0 件 → `include_children=1` で 1 件）。
     */
    expect(SEARCH).toMatch(/params: \{ search: debounced, include_children: '1' \}/);
  });

  it('台帳の案内も「保管場所」を書く（当たる範囲と書いてあることを合わせる）', () => {
    const filters = read('client-equipment', 'src', 'pages', 'equipmentList', 'EquipmentFilters.tsx');
    expect(filters).toMatch(/placeholder="名前・ID・型名・保管場所で探す"/);
  });
});
