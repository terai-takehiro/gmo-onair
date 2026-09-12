/**
 * 運営マニュアル 段C — 差し込みブロックの解決 API（production-manual.md §5-4）。
 *
 * `resolve`（冊子の全ページを走査して kind:'linked' の全ブロックをまとめて解決）・
 * `link-catalog`（この冊子に実在する差し込みブロック種別）・
 * `link-sources`（sourceId が要る種別だけの候補一覧）の3本。
 *
 * 冊子自体のアクセス確認は `manuals.routes.ts` の `requireAccessible(req)` と同じパターン
 * （`getManualRaw` → `canAccessManual` → 無ければ NotFoundError＝存在秘匿）。
 * 中身（差し込み元）の権限は再チェックしない — 「共通ポリシー」節（SHARED_CONTEXT）どおり、
 * 冊子自体が見えていれば差し込みも見せる、という設計判断。sheet.* の3種だけは
 * resolver 側（`sheet.resolver.ts`）が sourceId の project_id/program_id 一致を別途検査する。
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canAccessManual } from '../access';
import { wrap, p1 } from './wrap';
import { NotFoundError } from '../services/httpErrors';
import { getManualRaw, getManualWithMeta, getManualPages } from '../services/manual.service';
import {
  resolveLinkedBlock,
  listAvailableLinkedBlocks,
  listLinkSourcesFor,
  type ResolveResult,
} from '../services/manual-resolve.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

async function requireAccessible(req: Request) {
  const raw = await getManualRaw(p1(req.params.id));
  if (!raw) throw new NotFoundError('冊子が見つかりません');
  const ok = await canAccessManual(req.user!, raw.id as string, (raw.created_by as string) ?? null);
  if (!ok) throw new NotFoundError('冊子が見つかりません'); // 存在秘匿
  return raw;
}

/** ページの `blocks`（JSONB。中身は untyped）から kind:'linked' のブロックだけを緩く読む形 */
interface LinkedBlockLike {
  id?: unknown;
  kind?: unknown;
  link?: {
    block?: unknown;
    sourceId?: unknown;
    reveal?: { fields?: unknown };
  };
}

interface LinkedBlockRef {
  blockId: string;
  key: string;
  sourceId: string | null;
  revealFields: string[];
}

/** 冊子の全ページを走査し、kind:'linked' の全ブロックを集める */
async function collectLinkedBlocks(manualId: string): Promise<LinkedBlockRef[]> {
  const pages = await getManualPages(manualId);
  const refs: LinkedBlockRef[] = [];
  for (const page of pages) {
    const blocks = Array.isArray(page.blocks) ? (page.blocks as LinkedBlockLike[]) : [];
    for (const block of blocks) {
      if (block?.kind !== 'linked' || typeof block.id !== 'string' || typeof block.link?.block !== 'string') continue;
      const fields = block.link.reveal?.fields;
      refs.push({
        blockId: block.id,
        key: block.link.block,
        sourceId: typeof block.link.sourceId === 'string' ? block.link.sourceId : null,
        revealFields: Array.isArray(fields) ? fields.filter((f): f is string => typeof f === 'string') : [],
      });
    }
  }
  return refs;
}

/** (key, sourceId, revealFields) が同じ差し込みは1回だけ解決する */
function dedupeKey(ref: LinkedBlockRef): string {
  return `${ref.key}::${ref.sourceId ?? ''}::${[...ref.revealFields].sort().join(',')}`;
}

router.get('/manuals/:id/resolve', wrap(async (req: Request, res: Response) => {
  const raw = await requireAccessible(req);
  const manualId = p1(req.params.id);
  const projectId = (raw.project_id as string | null) ?? null;
  const programId = (raw.program_id as string | null) ?? null;
  const meta = await getManualWithMeta(manualId);
  const manualServiceDate = (meta?.service_date as string | null) ?? null;

  const refs = await collectLinkedBlocks(manualId);

  // 同じ入力を2回解決しない: 重複を除いた分だけ並行して解決する
  const uniqueByKey = new Map<string, LinkedBlockRef>();
  for (const ref of refs) {
    const dk = dedupeKey(ref);
    if (!uniqueByKey.has(dk)) uniqueByKey.set(dk, ref);
  }

  const resolvedByDedupeKey = new Map<string, ResolveResult>();
  await Promise.all(
    [...uniqueByKey.entries()].map(async ([dk, ref]) => {
      let result: ResolveResult;
      try {
        result = await resolveLinkedBlock(ref.key, {
          projectId,
          programId,
          sourceId: ref.sourceId,
          revealFields: ref.revealFields,
          manualServiceDate,
        });
      } catch {
        // 個々の差し込みの解決失敗で resolve 全体を落とさない（§5-4「共通ポリシー3」）
        result = { data: null, updatedAt: null, error: 'resolve_failed' };
      }
      resolvedByDedupeKey.set(dk, result);
    }),
  );

  const results: Record<string, ResolveResult> = {};
  for (const ref of refs) {
    results[ref.blockId] = resolvedByDedupeKey.get(dedupeKey(ref)) ?? { data: null, updatedAt: null, error: 'resolve_failed' };
  }

  res.json({ success: true, data: { results } });
}));

router.get('/manuals/:id/link-catalog', wrap(async (req: Request, res: Response) => {
  const raw = await requireAccessible(req);
  const available = await listAvailableLinkedBlocks({
    projectId: (raw.project_id as string | null) ?? null,
    programId: (raw.program_id as string | null) ?? null,
  });
  res.json({ success: true, data: { available } });
}));

router.get('/manuals/:id/link-sources', wrap(async (req: Request, res: Response) => {
  const raw = await requireAccessible(req);
  const block = typeof req.query.block === 'string' ? req.query.block : '';
  const sources = await listLinkSourcesFor(block, {
    projectId: (raw.project_id as string | null) ?? null,
    programId: (raw.program_id as string | null) ?? null,
  });
  res.json({ success: true, data: { sources } });
}));

export default router;
