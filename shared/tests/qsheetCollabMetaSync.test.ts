/**
 * **共同編集(collab)中でも title/status/broadcast_date/episode_* の列が更新されること**
 * （制作資料 v4 段5 PR11・qsheet-v4-coding/impl/05-editor-impl.md §3-3 ★追加(重大)）。
 *
 * ── なぜこれが要るか ────────────────────────────────────────
 *
 * collab 有効時は `PUT /qsheet/documents/:id` が一度も飛ばない
 * (`EditorPage.tsx` の自動保存・手動保存が collab のとき early return するため)。
 * 台本の内容 (`data` 列) は Yjs 経由で保存されるが、`qsheet_documents` の
 * `title` / `status` / `broadcast_date` / `episode_id` / `episode_code` という
 * **メタ列だけ**は誰も更新しなくなり、一覧の検索 (`d.title ILIKE`) が
 * 編集後のタイトルに当たらなくなる。
 *
 * ここは型検査でも lint でも捕まらない (「保存しない」は型エラーにならない)。
 * ソースを直接読んで、
 *   1) サーバーに `data` 列を一切触らないメタ専用の軽量エンドポイントがあること
 *   2) クライアントが collab 有効時にそれを呼ぶ経路 (`useCollabMetaSync`) を持っていること
 *   3) `EditorPage.tsx` がその経路を実際に呼んでいること
 * を固定する。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

const SERVER_SOURCE = readFileSync(
  join(ROOT, 'server', 'src', 'contexts', 'qsheet', 'routes', 'documents.routes.ts'),
  'utf8',
);

const HOOK_SOURCE = readFileSync(
  join(ROOT, 'client-qsheet', 'src', 'hooks', 'useCollabMetaSync.ts'),
  'utf8',
);

const EDITOR_SOURCE = readFileSync(
  join(ROOT, 'client-qsheet', 'src', 'pages', 'EditorPage.tsx'),
  'utf8',
);

// サーバー側の `PATCH /documents/:id/meta` ハンドラ本体だけを取り出す
// (次の `router.` 呼び出しの手前まで)。
function extractMetaRouteBody(source: string): string {
  const start = source.indexOf("router.patch('/documents/:id/meta'");
  if (start === -1) throw new Error('PATCH /documents/:id/meta ルートが見つかりません');
  const rest = source.slice(start);
  const nextRouterCall = rest.indexOf('\nrouter.', 1);
  return nextRouterCall === -1 ? rest : rest.slice(0, nextRouterCall);
}

describe('サーバー: PATCH /documents/:id/meta はメタ列だけを更新し、data 列には触れない', () => {
  it('ルートが存在する (requirePermission 経由)', () => {
    expect(SERVER_SOURCE).toMatch(
      /router\.patch\('\/documents\/:id\/meta',\s*requirePermission\('qsheet',\s*'editor'\)/,
    );
  });

  const body = extractMetaRouteBody(SERVER_SOURCE);

  it('title / status / broadcast_date / episode_id / episode_code の5列だけを SET する', () => {
    expect(body).toMatch(/title = \$/);
    expect(body).toMatch(/status = \$/);
    expect(body).toMatch(/broadcast_date = \$/);
    expect(body).toMatch(/episode_id = \$/);
    expect(body).toMatch(/episode_code = \$/);
  });

  it('data 列には一切触れない (UPDATE文の SET 句に data が無い・req.body からも取り出していない)', () => {
    // `data = $n` という SET 句が無いこと (JSON レスポンスの `data:` ラッパーは別物なので対象外)
    expect(body).not.toMatch(/\bdata\s*=\s*\$/);
    // req.body の分割代入に data を含めていない
    expect(body).not.toMatch(/\{\s*title,\s*status,\s*broadcast_date,\s*episode_id,\s*episode_code,?\s*data\b/);
    expect(body).not.toMatch(/req\.body\.data\b/);
  });

  it('SQL は UPDATE qsheet_documents … であり、対象列のみを動的に組み立てる', () => {
    expect(body).toMatch(/UPDATE qsheet_documents SET \$\{setClauses\.join/);
  });
});

describe('クライアント: useCollabMetaSync が collab 有効時にメタ列だけを軽量 PATCH で反映する', () => {
  it('メタ専用の PATCH エンドポイントを呼ぶ mutation がある', () => {
    expect(HOOK_SOURCE).toMatch(/api\.patch\(`\/qsheet\/documents\/\$\{payload\.id\}\/meta`/);
  });

  it('PATCH の payload は data を含まない5フィールドだけ (DocMetaColumns)', () => {
    const typeMatch = HOOK_SOURCE.match(/export interface DocMetaColumns \{[\s\S]*?\}/);
    expect(typeMatch).not.toBeNull();
    const typeBody = typeMatch![0];
    expect(typeBody).toMatch(/title: string/);
    expect(typeBody).toMatch(/status: string/);
    expect(typeBody).toMatch(/broadcast_date: string \| null/);
    expect(typeBody).toMatch(/episode_id: string \| null/);
    expect(typeBody).toMatch(/episode_code: string \| null/);
    // data (台本本体) はここに含めない — 含めると data 列を別経路で書く事故につながる
    expect(typeBody).not.toMatch(/\bdata\b/);
  });

  it('collab 無効時・ドキュメント未読込み時は何もしない (先頭でガードする)', () => {
    expect(HOOK_SOURCE).toMatch(
      /useEffect\(\(\) => \{\s*if \(!collabEnabled \|\| !docId \|\| !meta\) return;/,
    );
  });

  it('EditorPage.tsx が useCollabMetaSync を実際に呼んでいる (配線されている)', () => {
    expect(EDITOR_SOURCE).toMatch(/import \{ useCollabMetaSync \} from "@\/hooks\/useCollabMetaSync";/);
    expect(EDITOR_SOURCE).toMatch(/useCollabMetaSync\(\{/);
    // EditorPage 側が渡す meta も data 列 (doc.data そのもの) は含めない
    const callMatch = EDITOR_SOURCE.match(/useCollabMetaSync\(\{[\s\S]*?\}\);/);
    expect(callMatch).not.toBeNull();
    expect(callMatch![0]).toMatch(/collabEnabled/);
    expect(callMatch![0]).toMatch(/broadcast_date: doc\.broadcast_date/);
  });

  it('collab 有効時、自動保存 (PUT) は引き続き飛ばさない (data の二重書き込みを作らない)', () => {
    expect(EDITOR_SOURCE).toMatch(
      /Auto-save[\s\S]*?useEffect\(\(\) => \{\s*if \(collabEnabled\) return;/,
    );
  });
});
