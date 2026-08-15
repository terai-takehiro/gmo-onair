/**
 * **GLS-B（工事・構築）に放送の分類を付けない**
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * `project-classification.ts` は「GLS-B は2段分類（客入れの有無 × 案件分類）を
 * 持たない・**NULL のままにする**」と決めていますが、**書く側で守っていません**でした。
 *
 * ・直す画面（`RequiredFields`）は GLS-B でも**欄を出したまま**で、押せば保存される
 * ・サーバーは受け取った2段から `project_type` を導くので、
 *   **工事のプロジェクトが `hybrid_event`（ハイブリッド）になります**
 * ・そうなると標準工程の型・Excel・集計が**放送の案件として扱います**
 * ・**押した人には何も出ません** — 選べたのだから正しいと思います
 *
 * **実測**（実 Postgres ＋ 実サーバー・コンサルの案件 GLS-B002）:
 *
 * | | `gls_category` / `project_type` / `audience` / `project_category` |
 * | --- | --- |
 * | 守りあり（この版） | `B / consulting / — / —`（送っても変わらない） |
 * | 守りなし（前の版） | `B / hybrid_event / with_audience / broadcast` |
 *
 * v4 の PR で指摘された形です（#99）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

/** 説明文を外してから探す（前の版の形が注釈に書いてあるため） */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const FIELDS = code(read('client', 'src', 'contexts', 'sales', 'pages', 'projectNew', 'RequiredFields.tsx'));
const MISSING = code(read('client', 'src', 'contexts', 'sales', 'pages', 'projectNew', 'fields.ts'));
const SERVICE = code(read('server', 'src', 'contexts', 'sales', 'services', 'project.service.ts'));
const CLASSIFY = code(read('server', 'src', 'contexts', 'sales', 'services', 'project-classification.ts'));

describe('直す画面は GLS-B に2段分類の欄を出さない', () => {
  it('GLS-B かどうかで欄を出し分ける', () => {
    expect(FIELDS).toMatch(/const isGlsB = v\.gls_category === 'B';/);
    // 2つとも同じ条件で外す（片方だけ残すと、片方だけ入った行ができる）
    expect((FIELDS.match(/\{!isGlsB && \(/g) ?? []).length).toBe(2);
  });

  it('⚠️ 欄を消すだけにしない（なぜ無いのかを書く）', () => {
    // 消しただけだと「案件分類が無い画面」に見えて、壊れていると読まれる
    expect(FIELDS).toMatch(/\{isGlsB && \(/);
    expect(FIELDS).toMatch(/このプロジェクト（GLS-B）には/);
  });

  it('必須の判定は前から GLS-B を訊かない（食い違わせない）', () => {
    expect(MISSING).toMatch(/const asksClassification = v\.gls_category !== 'B';/);
  });
});

describe('サーバーが GLS-B の2段分類を落とす', () => {
  /**
   * ⚠️ **この PR のレビューで指摘された P2**。呼ぶ側で「2段に null を渡す」だけでは
   * 足りません — `resolveClassification` の中で `classificationOf(旧種類)` が
   * **2段を組み立て直す**ので、発番前の案件を A から B に切り替えると
   * `project_type` は `recording` のまま残り、**B の行に `no_audience` / `recording`**
   * が入ります（**実測: `A / recording / — / —` → `B / recording / no_audience / recording`**）。
   * **決めごとを書いてあるファイルの中で守ります。**
   */
  it('⚠️ 守るのは対応表の中（呼ぶ側で null を渡すだけにしない）', () => {
    expect(CLASSIFY).toMatch(/glsCategory\?: string \| null,/);
    expect(CLASSIFY).toMatch(/if \(glsCategory === 'B'\) \{\s*\n\s*return \{ audience: null, project_category: null, project_type: type \};/);
    // 旧種類は残す（`gmo_project` / `consulting` / `other` は GLS-B の正しい値）
    expect(CLASSIFY).toMatch(/const type = typeof fallbackProjectType === 'string' && fallbackProjectType \? fallbackProjectType : 'other';/);
  });

  it('⚠️ 画面で消すだけにしない（MCP・古いタブ・直接叩きから通る）', () => {
    // 作る側も直す側も、GLS 区分を対応表に渡す
    expect(SERVICE).toMatch(/resolveClassification\(audience, project_category, project_type, glsCategory\)/);
    expect(SERVICE).toMatch(/askedAudience, askedCategory,[\s\S]{0,200}effectiveGls,/);
  });

  it('判定はこの保存で変わる値も見る（発番前は A↔B を切り替えられる）', () => {
    // `reqCategory` を無視して既存の値だけを見ると、
    // **同じ保存で A から B にした案件に2段が入ります**
    expect(SERVICE).toMatch(/const effectiveGls = \(allowCategoryUpdate \? reqCategory : null\)/);
  });

  it('旧「案件種類」は落とさない（GLS-B の正しい値なので）', () => {
    // `gmo_project` / `consulting` / `other` はここで消すと**分類そのものを失う**
    expect(SERVICE).toMatch(/project_type === undefined \? existing\.project_type : project_type,/);
  });

  it('GLS-A の道は変えていない（旧種類から2段を埋め戻す）', () => {
    // GLS-B の早期 return より**あと**に残っていること
    const at = CLASSIFY.indexOf("if (glsCategory === 'B')");
    expect(at).toBeGreaterThan(0);
    expect(CLASSIFY.slice(at)).toMatch(/const back = classificationOf\(type\);/);
  });
});
