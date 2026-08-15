/**
 * **「直りました」と言いながら、何も入っていない**のを止める
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * この2つは**成功して見える**のがいちばんの問題です:
 *
 * ・MCP の `update_project` は、受け取った項目を捨てても `updated: true` を返し、
 *   **捨てた項目まで `changed_fields` に並べて**いました。
 *   AI はそれを見て次に進むので、**間違いが下流へ流れます**
 * ・日常業務から「案件の受付へ送る」で来ると、**フォームは空**でした。
 *   送った人は「向こうで案件になる」と思っているので、
 *   **受け取った側が打ち直していること自体が誰にも見えません**
 *
 * v4 の PR で指摘された形です（#81 / #80）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const TOOLS = read('server', 'src', 'contexts', 'mcp', 'tools', 'projects.tools.ts');
const FORM = read('client', 'src', 'contexts', 'sales', 'pages', 'projectNew', 'useNewProjectForm.ts');

describe('MCP の update_project が黙って捨てない', () => {
  it('分類と登録の項目を実際に書き換える', () => {
    // `create_project` では受けているのに、直すと入らなかった（#81）
    const at = TOOLS.indexOf('const UPDATE_FIELDS = [');
    const list = TOOLS.slice(at, TOOLS.indexOf('] as const;', at));
    for (const f of [
      'audience', 'project_category',
      'intake_channel', 'contact_name', 'recurrence', 'attendee_count', 'goal', 'wants',
    ]) {
      expect(list).toContain(`'${f}'`);
    }
  });

  it('返すのは「渡した項目」ではなく「書き換えた項目」', () => {
    // 前の版は `Object.keys(args)` をそのまま並べ、**捨てた項目まで**報告していた
    expect(TOOLS).toMatch(/const applied = new Set<string>\(UPDATE_FIELDS\)/);
    expect(TOOLS).toMatch(/\.filter\(\(k\) => applied\.has\(k\) \|\| k === 'dates'\)/);
    // 捨てた項目は黙らない（次に何を直せばよいかが分かる）
    expect(TOOLS).toMatch(/ignored_fields: ignored/);
  });
});

describe('引き合いから開いたら中身が写る', () => {
  it('`?inquiry=` で開くと、その引き合いを選んだ状態にする', () => {
    // これまでは id を書き戻しに使うだけで、**フォームは空**だった（#80）
    expect(FORM).toMatch(/const hit = items\.find\(\(i\) => i\.key === `inquiry:\$\{inquiryParam\}`\)/);
    expect(FORM).toMatch(/setSelected\(hit\)/);
    // **写す処理を増やさない** — レールで選んだときと同じ道（`useIntakeSeed`）を通す
    expect(FORM).toMatch(/const selection = useIntakeSeed\(selected, replace\)/);
    // 同じ引き合いで何度も走らせない（打った文字が消える）
    expect(FORM).toMatch(/seededFrom\.current === inquiryParam/);
  });
});
