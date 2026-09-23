/**
 * Wiki の MCP ツール — **書く2本の中身**（段E・設計 `docs/design/v4/wiki.md` §7-6）。
 *
 * ツールの名前・説明文・引数の形は `wiki.tools.ts` にあります。分けている理由と、
 * **`server.registerTool(...)` をこちらへ移してはいけない**理由は
 * `wiki-read.tools.ts` の冒頭と同じです。
 *
 * ⚠️ **書き込みは必ず下書きです。公開する口はありません**（§7-6）。
 * 公開は人が画面で押します（メール取込の「AI は起票まで・確定は人」と同じ）。
 * だから `createWikiPage` は `status` を受け取らず、`updateWikiPage` は
 * **公開済みのページを触りません**。
 */
import { execute } from '../../../shared/db/connection';
import { ValidationError } from '../../qsheet/services/httpErrors';
import { recordAiOutput } from '../../../shared/services/ai-output.service';
import { assertReadablePage } from '../../wiki/services/wiki-access.service';
import { savePageInternal, selectPageRow } from '../../wiki/services/wiki-page.service';
import { createPage } from '../../wiki/services/wiki-write.service';
import {
  assertOnairTargetsExist,
  parentDatabaseItems,
  validateRowProps,
} from '../../wiki/services/wiki-row-props';
import type { WikiPropValue } from '../../wiki/wiki-props';
import { audit, currentActorId, ok, type ToolResult } from '../helpers';
import { requireWikiActor, resolveSpaceId } from './wiki.access';

/**
 * 下書きの契約の版（`ai_outputs.prompt_version`）。
 *
 * ⚠️ **`wiki.tools.ts` の説明文（`.describe()`）を直したら上げること。**
 * あの文面は外の AI にとってのプロンプトそのものなので（`activity_intake` で決めた作法）、
 * 版を上げないと**契約を直した効果を後から数字で言えません**。
 */
const WIKI_DRAFT_PROMPT_VERSION = 'wiki-mcp-draft-v1';

/** 本文の上限。**切り詰めずに断ります** — 途中で切れた本文を保存するほうが悪い */
export const MAX_BODY = 100_000;

export interface CreateWikiPageArgs {
  title: string;
  space?: string;
  parent_id?: string;
  body_md?: string;
  tags?: string[];
  props?: Record<string, unknown>;
  sources?: string[];
  requested_by?: string;
}

/** `create_wiki_page` の中身 */
export async function createWikiPage(args: CreateWikiPageArgs): Promise<ToolResult> {
  const user = await requireWikiActor('editor');

  // スペースは親から決められる（外の AI は親の id しか知らないことが多い）
  let spaceId: string;
  if (args.parent_id) {
    await assertReadablePage(user, args.parent_id);
    spaceId = String((await selectPageRow(args.parent_id)).space_id);
    if (args.space && (await resolveSpaceId(user, args.space)) !== spaceId) {
      throw new ValidationError('親ページと違うスペースは指定できません。`space` を外してください。');
    }
  } else {
    if (!args.space) throw new ValidationError('`space` か `parent_id` のどちらかを渡してください。');
    spaceId = await resolveSpaceId(user, args.space);
  }

  /*
   * データベースの行の値は**ここで検査する**。`createPage` はテンプレートから写した値を
   * 黙って落とす作りなので（利用者には直せないため）、そのまま通すと
   * **AI には「入れたつもりの値が消えた」ことが分からない**。
   */
  let props: Record<string, WikiPropValue> | undefined;
  if (args.props && Object.keys(args.props).length > 0) {
    const items = args.parent_id ? await parentDatabaseItems(args.parent_id) : null;
    if (!items) throw new ValidationError('`props` はデータベースの行にだけ入れられます。`parent_id` にデータベースのページを渡してください。');
    props = validateRowProps(items, args.props as Record<string, WikiPropValue>);
    await assertOnairTargetsExist(items, props);
  }

  const page = await createPage(user, {
    space_id: spaceId,
    parent_id: args.parent_id ?? null,
    title: args.title,
    body_md: args.body_md ?? '',
    tags: args.tags,
    props,
    status: 'draft',
    note: 'AI が下書きを作った',
  });

  const pageId = String(page.id);
  const outputId = await recordDraft(pageId, {
    space_id: spaceId,
    parent_id: args.parent_id ?? null,
    title: args.title,
    body_md: args.body_md ?? '',
    tags: args.tags ?? [],
    props: props ?? {},
    sources: args.sources ?? [],
  }, 'create_wiki_page', args.requested_by);

  audit(
    'create_wiki_page',
    { space: spaceId, parent_id: args.parent_id, title: args.title, length: (args.body_md ?? '').length },
    { page_id: pageId, status: 'draft' },
    args.requested_by,
  );
  return ok({
    created: true, id: pageId, status: 'draft', title: page.title,
    updated_at: new Date(page.updated_at as string).toISOString(),
    ai_output_id: outputId,
    next_step: '下書きです。Wiki の画面で内容を確かめ、人が「公開」を押してください。',
  });
}

export interface UpdateWikiPageArgs {
  page_id: string;
  mode: 'replace' | 'append';
  body_md: string;
  expected_updated_at: string;
  note?: string;
  requested_by?: string;
}

/** `update_wiki_page` の中身 */
export async function updateWikiPage(args: UpdateWikiPageArgs): Promise<ToolResult> {
  const user = await requireWikiActor('editor');
  await assertReadablePage(user, args.page_id);
  const cur = await selectPageRow(args.page_id);
  if (String(cur.status) !== 'draft') {
    throw new ValidationError('公開済みのページは MCP からは直せません。Wiki の画面で直してください。');
  }

  const before = String(cur.body_md ?? '');
  const body = args.mode === 'append'
    ? `${before.replace(/\s+$/, '')}\n\n${args.body_md}`.replace(/^\n+/, '')
    : args.body_md;
  if (body.length > MAX_BODY) {
    throw new ValidationError(`本文が ${MAX_BODY} 文字を超えます。分けて足してください。`);
  }

  /*
   * ⚠️ **`skipAiFeedback` を立てるのは、これが AI 自身の書き込みだからです**
   * （`SavePageOptions` の注意書き・`wiki-draft.service.ts` と同じ扱い）。
   * 立てないと、この保存が**直前の（あるいは前回の）下書きに対する「人の修正」**として
   * `ai_corrections` に積まれます — `append` で3回足しただけで、人が1文字も触っていない
   * ページに修正が3件並び、無修正採用率が嘘になります。
   * 人が直した分は、Wiki の画面から保存したときに記録されます。
   */
  const saved = await savePageInternal(args.page_id, {
    body_md: body,
    expected_updated_at: args.expected_updated_at,
    note: args.note ?? (args.mode === 'append' ? 'AI が本文を足した' : 'AI が本文を書き直した'),
  }, user, { skipAiFeedback: true });

  const outputId = await recordDraft(args.page_id, {
    mode: args.mode, title: String(saved.title ?? ''), body_md: body, added: args.body_md,
  }, 'update_wiki_page', args.requested_by);

  audit(
    'update_wiki_page',
    { page_id: args.page_id, mode: args.mode, length: args.body_md.length },
    { rev: saved.rev },
    args.requested_by,
  );
  return ok({
    updated: true, id: args.page_id, status: 'draft', rev: saved.rev,
    updated_at: new Date(saved.updated_at as string).toISOString(),
    ai_output_id: outputId,
    next_step: '下書きのままです。Wiki の画面で人が「公開」を押してください。',
  });
}

/**
 * 下書きを `ai_outputs` に**全文で**残し、ページから引けるようにする（§7-3 条件1）。
 *
 * ⚠️ **直すたびに記録し直します。** 作ったときの1回だけにすると、AI が
 * `append` で3回足した後の本文と最初の記録が食い違い、**人が直していないのに
 * 大量の「修正」が出ます**（議事録で踏んだ「差分の before が古い」と同じ形）。
 * `wiki_pages.ai_output_id` はいつも**最後の出力**を指します。
 *
 * ⚠️ 記録に失敗しても書き込みは成功させます（`recordAiOutput` は best-effort）。
 * 記録のために業務を止めません。
 */
async function recordDraft(
  pageId: string,
  payload: Record<string, unknown>,
  toolName: string,
  requestedBy?: string,
): Promise<string | null> {
  const outputId = await recordAiOutput({
    kind: 'wiki_draft',
    targetTable: 'wiki_pages',
    targetId: pageId,
    payload,
    toolName,
    promptVersion: WIKI_DRAFT_PROMPT_VERSION,
    actorId: currentActorId(),
    requestedBy: requestedBy ?? null,
  });
  if (!outputId) return null;
  await execute('UPDATE wiki_pages SET ai_output_id = ? WHERE id = ?', [outputId, pageId])
    .catch((e) => console.warn('[wiki mcp] ai_output_id の紐づけに失敗しました:', (e as Error).message));
  return outputId;
}
