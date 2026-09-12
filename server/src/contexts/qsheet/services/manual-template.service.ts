/**
 * 運営マニュアル 段E — ひな形（`qsheet_manual_templates`）・前回の冊子からの複製。
 * 設計: docs/design/v4/production-manual.md §6①・§5-4・段Eの設計判断3。
 *
 * 今回実装するのは `scope = 'org'`（組織共通）だけ。「この案件の前の冊子から」複製する
 * 経路は、このテーブルを経由せず実在する `qsheet_manuals` を直接複製する別物
 * （`buildPagesForNewManual` の `copyFromManualId`）——設計が明言する2系統のうち
 * 「組織共通」はこのテーブル、「前の案件の前の冊子から」はテーブルを経由しないので、
 * `scope = 'project'`（列は残っている）というひな形は今回作らない。
 *
 * ⚠️ `manual.service.ts` からは呼ばれるが、ここから `manual.service.ts` は呼ばない
 * （循環 import を避ける）。ページ読み取りは queryAll を直接使う。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute, type Row } from '../../../shared/db/connection';
import { NotFoundError, ValidationError } from './httpErrors';

const MAX_NAME = 200;
const MAX_PAGE_TITLE = 200;
const MAX_CHAPTER = 200;
/** `manual.service.ts` の `updatePage` と同じ上限（§ 紙面の中身の大きさ） */
const MAX_BLOCKS_JSON_LENGTH = 300_000;

const TEMPLATE_SELECT = `
  SELECT t.id, t.name, t.scope, t.created_by, t.created_at,
         u.name AS creator_name,
         jsonb_array_length(t.pages)::int AS page_count
  FROM qsheet_manual_templates t
  LEFT JOIN users u ON t.created_by = u.id
`;

/** 組織共通ひな形の一覧（§6①「ひな形は『組織共通』と『前の冊子から』の2系統」の前者） */
export async function listOrgTemplates(): Promise<Row[]> {
  return queryAll(`${TEMPLATE_SELECT} WHERE t.scope = 'org' ORDER BY t.created_at DESC`);
}

/** 新しい冊子の1ページぶんの種。`id` を持たない——`createManual` が INSERT のたびに新しく発番する */
export interface NewManualPageSeed {
  chapter: string | null;
  title: string;
  blocks: unknown[];
}

function toSeed(page: Row): NewManualPageSeed {
  const chapter = page.chapter;
  const title = page.title;
  return {
    chapter: typeof chapter === 'string' ? chapter.slice(0, MAX_CHAPTER) : null,
    title: typeof title === 'string' ? title.slice(0, MAX_PAGE_TITLE) : '',
    blocks: Array.isArray(page.blocks) ? (page.blocks as unknown[]) : [],
  };
}

/**
 * `kind: 'linked'` ブロックの `link.frozen` / `link.reveal` を落とし、ブロック `id` を
 * 発番し直す（自由ブロックは `id` だけ発番し直し、中身はそのまま）。
 *
 * ⚠️ 確定済みの中身（frozen）や秘密の解除記録（reveal）をそのまま複製先へ持ち越すと、
 * 新しい冊子で「まだ誰も確認していないのに秘密（配信の鍵・WEB会議のパスコード）が
 * 出たまま」という事故になる（段Eの設計判断3）。ここは省略しない。
 */
function reissueBlock(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const block = raw as Record<string, unknown>;
  const next: Record<string, unknown> = { ...block, id: uuid() };
  if (block.kind === 'linked' && block.link && typeof block.link === 'object') {
    const link = { ...(block.link as Record<string, unknown>) };
    link.frozen = null;
    delete link.reveal;
    next.link = link;
  }
  return next;
}

function reissuePages(seeds: NewManualPageSeed[]): NewManualPageSeed[] {
  if (seeds.length === 0) return [{ chapter: null, title: '', blocks: [] }];
  return seeds.map((p) => {
    const blocks = p.blocks.map(reissueBlock);
    if (JSON.stringify(blocks).length > MAX_BLOCKS_JSON_LENGTH) {
      throw new ValidationError('紙面の中身が大きすぎます');
    }
    return { chapter: p.chapter, title: p.title, blocks };
  });
}

export interface BuildPagesInput {
  templateId?: string | null;
  copyFromManualId?: string | null;
  projectId?: string | null;
  programId?: string | null;
}

/**
 * 新しい冊子の初期ページを組み立てる。`templateId` を優先し、無ければ `copyFromManualId`、
 * どちらも無ければ空ページ1枚（今までどおり）。
 *
 * `copyFromManualId` は**同じ project_id（または program_id）の冊子のときだけ**許可する
 * （他案件の冊子を勝手に複製できないように——`sheet.resolver.ts` の
 * 「同じ案件/番組か」の検査と同じ考え方。必須のガード）。
 */
export async function buildPagesForNewManual(input: BuildPagesInput): Promise<NewManualPageSeed[]> {
  if (input.templateId) {
    const tpl = await queryOne(
      `SELECT pages FROM qsheet_manual_templates WHERE id = $1 AND scope = 'org'`,
      [input.templateId],
    );
    if (!tpl) throw new NotFoundError('ひな形が見つかりません');
    const pages = Array.isArray(tpl.pages) ? (tpl.pages as Row[]) : [];
    return reissuePages(pages.map(toSeed));
  }

  if (input.copyFromManualId) {
    const source = await queryOne(
      'SELECT project_id, program_id FROM qsheet_manuals WHERE id = $1 AND deleted_at IS NULL',
      [input.copyFromManualId],
    );
    if (!source) throw new NotFoundError('複製元の冊子が見つかりません');
    const sameProject = !!input.projectId && source.project_id === input.projectId;
    const sameProgram = !!input.programId && source.program_id === input.programId;
    if (!sameProject && !sameProgram) {
      throw new ValidationError('複製元は同じ案件/番組の冊子だけ指定できます');
    }
    const pages = await queryAll(
      'SELECT chapter, title, blocks FROM qsheet_manual_pages WHERE manual_id = $1 ORDER BY sort_order',
      [input.copyFromManualId],
    );
    return reissuePages(pages.map(toSeed));
  }

  return [{ chapter: null, title: '', blocks: [] }];
}

/**
 * `sourceManualId` の全ページを読み、`pages` 列（jsonb 配列）としてテンプレート行を1件作る
 * ＝「この冊子をひな形として登録」。中身（`frozen`・`reveal` 含む）はそのまま持つ——
 * 持ち越しを断つのは「テンプレートから新しい冊子を作るとき」（`buildPagesForNewManual`）の
 * 役目にする（このテーブル自体は「ある時点の写し」を持つだけ・下書き/確定の区別を持たない）。
 *
 * ⚠️ 呼び出し元（route）が先に「呼んだ本人がこの `sourceManualId` にアクセスできるか」
 * （`canAccessManual`）を確認していることが前提——ここでは確認しない
 * （`manual-resolve.service.ts` の「共通ポリシー」と同じ役割分担）。
 */
export async function createTemplateFromManual(name: string, sourceManualId: string, userId: string): Promise<Row> {
  const trimmedName = (name || '').trim().slice(0, MAX_NAME);
  if (!trimmedName) throw new ValidationError('ひな形の名前を入力してください');

  const source = await queryOne('SELECT id FROM qsheet_manuals WHERE id = $1 AND deleted_at IS NULL', [sourceManualId]);
  if (!source) throw new NotFoundError('複製元の冊子が見つかりません');

  const pages = await queryAll(
    'SELECT chapter, title, blocks FROM qsheet_manual_pages WHERE manual_id = $1 ORDER BY sort_order',
    [sourceManualId],
  );
  const seeds = pages.map(toSeed);

  const id = uuid();
  await execute(
    `INSERT INTO qsheet_manual_templates (id, name, scope, project_id, pages, created_by)
     VALUES (?, ?, 'org', NULL, ?, ?)`,
    [id, trimmedName, JSON.stringify(seeds), userId],
  );

  const row = await queryOne(`${TEMPLATE_SELECT} WHERE t.id = $1`, [id]);
  if (!row) throw new Error('createTemplateFromManual: INSERT 直後の SELECT が空でした');
  return row;
}
