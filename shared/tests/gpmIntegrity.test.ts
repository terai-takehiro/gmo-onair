/**
 * **プロジェクト管理が「開けるのに使えない」を作らない**
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * この一群は**その権限の人でしか踏めません**。作った側は system_admin で
 * 見ているので、画面を開いても最後まで気づけません:
 *
 * ・`gpm` だけの人は依頼元の一覧が 403 で空 ＝ **プロジェクトを作れない**
 *   （「読み込み中」も出ないので、理由が画面のどこにも出ません）
 * ・同じ人が請求タブを開くと**開いた瞬間に真っ白**
 * ・受注にしても **GLS-B が採られない**（番号が無いと月次にも上がらない）。
 *   採る口は案件側にしかなく `sales` を要求するので、**採る手段がありません**
 *
 * v4 の PR で指摘された形です（#67）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const GPM = read('server', 'src', 'contexts', 'gpm', 'services', 'gpm.service.ts');
const GPM_ROUTES = read('server', 'src', 'contexts', 'gpm', 'index.ts');
const BILLING = read('client', 'src', 'contexts', 'gpm', 'pages', 'projectDetail', 'BillingTab.tsx');

describe('プロジェクト管理が使える', () => {
  it('受注にすると GLS を採り、段の履歴を残す', () => {
    // 案件管理の `changeStage` と同じことをする（#67）
    expect(GPM).toMatch(/INSERT INTO project_stage_changes/);
    expect(GPM).toMatch(/if \(nextStage === 'a_won' && !before\.gls_number\)/);
    expect(GPM).toMatch(/await salesProjectService\.issueGls\(id, \{\}, userId\)/);
    // 採れなくても受注そのものは止めない（分類が無い古い行を開けなくしない）
    expect(GPM).toMatch(/glsError = err instanceof AppError/);
  });

  it('⚠️ 案件管理の service を別名で受ける', () => {
    // このファイルも `projectService` を export しているので、
    // 同じ名前で受けると**発番が自分自身を呼びに行く**
    expect(GPM).toMatch(/projectService as salesProjectService/);
  });

  it('依頼元の一覧は gpm の口から引く', () => {
    // `/customers` は `sales` を要求する（#67）
    expect(GPM_ROUTES).toMatch(/router\.get\('\/customers', \.\.\.canRead/);
    // **返すのは名前だけ** — 連絡先・備考まで広げない
    // Phase 3-2a: gpm_projects.customer_id は companies.id を直接指すので、
    // customers ではなく companies（is_customer=TRUE）から返す
    expect(GPM_ROUTES).toMatch(/SELECT id, name, short_name FROM companies WHERE is_customer = TRUE/);
    const q = read('client', 'src', 'contexts', 'gpm', 'queries.ts');
    expect(q).toMatch(/api\.get\('\/gpm\/customers'\)/);
    expect(q).not.toMatch(/api\.get\('\/customers'/);
  });

  it('請求タブは月次で開き、権限が無ければ理由を出して止める', () => {
    // `isEstimateMode` を渡すと `monthlyMode` が必ず false になる（#67）。
    // **説明として名前が出るのは可**・**渡すのは不可**
    expect(BILLING).toMatch(/<BusinessProjectView project=\{data\} projectId=\{projectId\} \/>/);
    expect(BILLING).not.toMatch(/projectId=\{projectId\}\s+isEstimateMode/);
    // 開いた瞬間 403 で真っ白にしない（何の権限が要るかを名前で出す）
    expect(BILLING).toMatch(/const canRead = hasPermission\('sales'\) && hasPermission\('budget'\)/);
    expect(BILLING).toMatch(/<NoPermissionPanel\s+modules=\{\['sales', 'budget'\]\}/);
    // ⚠️ **両方要る**と書く（既定の「いずれか」だと片方だけ足されてまた止まる）
    expect(BILLING).toMatch(/requireAll/);
    expect(read('shared', 'src', 'client', 'states', 'NoPermissionPanel.tsx'))
      .toMatch(/requireAll \? `\$\{names\.join\(' と '\)\} の両方`/);
    // 権限が無いときは**引きに行かない**（403 をログに積まない）
    expect(BILLING).toMatch(/enabled: !!projectId && canRead/);
  });
});
