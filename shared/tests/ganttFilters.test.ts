/**
 * **ガントに絞り込みが効かない／「ぜんぶ外す」で外れないものがある**
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * **①ガント。** チップ（すべて / 未完了 / 期限切れ）は光ったままなのに、
 * ガントは**いつも同じ**でした。原因は2つ重なっています:
 *
 *   1. ガントに渡していたのが `scoped`（「自分の／すべて」だけを掛けたもの）で、
 *      **チップを掛けた `rows` ではなかった**
 *   2. 見え方の切り替えは `navigate('/sales/tasks/gantt')` = **道を変える操作**なので、
 *      `useState` で持っていた絞り込みが**画面ごと作り直されて既定に戻る**
 *
 * 2 のほうが厄介で、**チップは光ったまま**なので「選んだとおりに見えている」と
 * 思わされます。ガントは件数を出さないので、数が合わないことにも気づけません。
 *
 * **実測**（実 Postgres ＋ 実ブラウザ・各案件の「N件」を足したもの）:
 *
 * | チップ | 前の版 | この版 |
 * | --- | --- | --- |
 * | 未完了（既定） | 33 | **33** |
 * | すべて | **33** | **39** |
 * | 期限切れ | **33** | **3** |
 *
 * **②機材の「ぜんぶ外す」。** 数える側は「付属品も出す」も1つとして数えるのに、
 * 外す側が消していなかったので、**押しても札の数字が 1 のまま・付属品も出たまま**でした。
 *
 * v4 の PR で指摘された形です（#50 / #69）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DASH = code(read('client', 'src', 'contexts', 'tasks', 'pages', 'TaskDashboardPage.tsx'));
const EQ_STATE = code(read('client-equipment', 'src', 'pages', 'equipmentList', 'useEquipmentListState.ts'));
const EQ_FILTERS = code(read('client-equipment', 'src', 'pages', 'equipmentList', 'MobileFilters.tsx'));

describe('ガントにも絞り込みが効く', () => {
  it('チップを掛けたものを渡す（`scoped` ではない）', () => {
    expect(DASH).toMatch(/<DashboardGanttView\s+projects=\{data\?\.projects \?\? \[\]\}\s+columns=\{data\?\.columns \?\? \[\]\}\s+tasks=\{rows\}/);
    expect(DASH).not.toMatch(/tasks=\{scoped\}/);
  });

  it('⚠️ 絞り込みは URL で持つ（道が変わると `useState` は消える）', () => {
    // 見え方の切り替えは navigate = 道を変える操作。useState だと画面ごと作り直される
    expect(DASH).toMatch(/const \[params, setParams\] = useSearchParams\(\);/);
    expect(DASH).toMatch(/params\.get\('state'\)/);
    expect(DASH).toMatch(/params\.get\('scope'\)/);
    expect(DASH).not.toMatch(/useState<Filter>\('open'\)/);
    expect(DASH).not.toMatch(/useState<Scope>\('all'\)/);
  });

  it('見え方を切り替えても絞り込みを引き継ぐ', () => {
    expect(DASH).toMatch(/navigate\(\{ pathname: `\/sales\/tasks\/\$\{v\}`, search: params\.toString\(\) \}\)/);
  });

  it('既定は URL に書かない（`?state=open` を毎回付けて回らない）', () => {
    expect(DASH).toMatch(/if \(value === dflt\) n\.delete\(key\); else n\.set\(key, value\);/);
  });

  it('知らない値は既定に落とす（URL は人が書き替えられる）', () => {
    expect(DASH).toMatch(/\(\['all', 'open', 'over'\] as const\)\.find/);
  });
});

describe('機材の「ぜんぶ外す」は付属品も外す', () => {
  it('数える側と外す側が同じものを見る', () => {
    // 数える側は `includeChildren` を1つとして数える
    expect(EQ_FILTERS).toMatch(/\(s\.includeChildren \? 1 : 0\)/);
    // 外す側も消す（前の版は消していなかったので札の数字が 1 のまま残った）
    expect(EQ_STATE).toMatch(/n\.delete\('children'\);/);
  });
});
