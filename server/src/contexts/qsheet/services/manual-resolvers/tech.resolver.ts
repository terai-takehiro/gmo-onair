/**
 * 運営マニュアル — 差し込みブロックの resolver: 技術資料（`tech.patch`・`tech.staff`）。
 * 設計: docs/design/v4/tech-docs.md §8-2（ブロック2種）・§8-3（触る11か所）・§8-4（決めごと）。
 *
 * ── 共通ポリシー（`venue.resolver.ts` をそのまま写す） ────────────────────────
 * resolve はマニュアル自身の `canAccessManual` が通っていることをゲートにする。その上で、
 * `venue.resolver.ts` と同じ理由で追加の検査を2つ行う:
 *   ① `sourceId` の資料が冊子と**同じ案件/番組**か（`ownerMatchesCtx`。§8-4 の1点目）
 *   ② その資料自体に呼び出し本人が `canAccessTechDoc` を通るか
 * ①だけでは足りない理由は `venue.resolver.ts` の頭注と同じ（`program_id` は行単位の権限を
 * 持たない「弱い」識別子で、同じ番組 id の冊子を自分で作れば①は突破できる）。
 *
 * ── data の形（§8-4。自己完結＝外部URL・画像 id を持たず、矢印表記まで組み立てて渡す） ──
 * `tech.patch`:
 *   { techDocId, docNo, rev, title, status, groups: [{ label, lines: [{ no, text, note }] }],
 *     rowCount, extraCount, updatedAt }
 * `tech.staff`:
 *   { techDocId, docNo, rev, title, status,
 *     days: [{ date, label, count, roles: [{ role, people: [{ name, company, note }] }] }],
 *     count, updatedAt }
 *
 * 矢印表記（`機材 out [101A] → 機材 in [136B]`）は `shared/src/tech/patchExport.ts` の
 * 複製（`server/src/shared/tech/patchExport.ts`）を使う。紙面（④）・差し込み・スマホの
 * 1行目が**同じ関数**を通る（§8-1）。
 */
import { queryAll, queryOne } from '../../../../shared/db/connection';
import { patchRowLine } from '../../../../shared/tech/patchExport';
import { roleOrder } from '../../../../shared/tech/roles';
import type { TechPatchRow, TechStaffRow } from '../../../../shared/tech/types';
import { canAccessTechDoc, type AccessUser } from '../../access';

/** resolver へ渡す文脈。マニュアル（`qsheet_manuals`）の project_id/program_id をそのまま渡す */
export interface ManualTechResolveScope {
  projectId: string | null;
  programId: string | null;
}

/** tech.* の2種は `sourceId`（`qsheet_tech_docs.id`）が必須（§8-2「sourceId 必須」） */
export interface ManualTechResolveCtx extends ManualTechResolveScope {
  sourceId: string | null;
  /** 呼び出し本人。`canAccessTechDoc` の判定に使う */
  user: AccessUser;
}

/** resolver 全員の統一シグネチャ（`manual-resolve.service.ts` の `ResolveResult` と同じ形） */
export interface ManualTechResolveResult {
  data: unknown;
  updatedAt: string | null;
  error?: string;
}

interface TechDocHead {
  id: string;
  docNo: string | null;
  title: string;
  status: string;
  rev: number;
  projectId: string | null;
  programId: string | null;
  createdBy: string | null;
  updatedAt: string;
}

async function fetchTechDocHead(sourceId: string): Promise<TechDocHead | null> {
  const row = await queryOne(
    `SELECT id, doc_no, title, status, rev, project_id, program_id, created_by, updated_at
       FROM qsheet_tech_docs WHERE id = $1 AND deleted_at IS NULL`,
    [sourceId],
  );
  if (!row) return null;
  return {
    id: row.id as string,
    docNo: (row.doc_no as string | null) ?? null,
    title: (row.title as string) ?? '',
    status: (row.status as string) ?? 'draft',
    rev: (row.rev as number) ?? 0,
    projectId: (row.project_id as string) ?? null,
    programId: (row.program_id as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

/** 冊子と同じ project_id、または同じ program_id を持つ資料だけを true にする（null 同士は一致させない） */
function ownerMatchesCtx(ctx: ManualTechResolveScope, doc: TechDocHead): boolean {
  if (ctx.projectId && doc.projectId === ctx.projectId) return true;
  if (ctx.programId && doc.programId === ctx.programId) return true;
  return false;
}

type AccessibleTechDoc =
  | { ok: true; doc: TechDocHead }
  | { ok: false; result: ManualTechResolveResult };

/** sourceId を検査してから中身を読む共通の入口（`venue.resolver.ts` の同名の関数と同じ形） */
async function resolveAccessibleTechDoc(ctx: ManualTechResolveCtx): Promise<AccessibleTechDoc> {
  if (!ctx.sourceId) {
    return { ok: false, result: { data: null, updatedAt: null, error: 'source_id_required' } };
  }
  const doc = await fetchTechDocHead(ctx.sourceId);
  if (!doc) {
    return { ok: false, result: { data: null, updatedAt: null, error: 'source_missing' } };
  }
  if (!ownerMatchesCtx(ctx, doc)) {
    return { ok: false, result: { data: null, updatedAt: null, error: 'access_denied' } };
  }
  if (!(await canAccessTechDoc(ctx.user, doc.id, doc.createdBy))) {
    return { ok: false, result: { data: null, updatedAt: null, error: 'access_denied' } };
  }
  return { ok: true, doc };
}

/** 資料の見出し（3つのブロックで共通に載せる札。§8-2「札 TD-202610-0001 rev.1」） */
function headOf(doc: TechDocHead): Record<string, unknown> {
  return { techDocId: doc.id, docNo: doc.docNo, rev: doc.rev, title: doc.title, status: doc.status };
}

// ============================================================
// tech.patch（映像パッチ: 系統の見出し＋矢印の行。§8-1）
// ============================================================
export async function resolveTechPatch(ctx: ManualTechResolveCtx): Promise<ManualTechResolveResult> {
  const resolved = await resolveAccessibleTechDoc(ctx);
  if (!resolved.ok) return resolved.result;
  const doc = resolved.doc;

  const rows = (await queryAll(
    `SELECT group_label, sort_order, from_device_text, from_jack_text, from_is_extra,
            to_device_text, to_jack_text, to_is_extra, note
       FROM qsheet_tech_patch_rows WHERE tech_doc_id = $1 ORDER BY sort_order, created_at`,
    [doc.id],
  )) as unknown as TechPatchRow[];

  const groups: { label: string; lines: { no: number; text: string; note: string }[] }[] = [];
  for (const r of rows) {
    const label = (r.group_label as string) ?? '';
    let g = groups.find((x) => x.label === label);
    if (!g) {
      g = { label, lines: [] };
      groups.push(g);
    }
    g.lines.push({ no: g.lines.length + 1, text: patchRowLine(r), note: (r.note as string) ?? '' });
  }
  const extraCount = rows.filter((r) => r.from_is_extra || r.to_is_extra).length;

  return {
    data: { ...headOf(doc), groups, rowCount: rows.length, extraCount, updatedAt: doc.updatedAt },
    updatedAt: doc.updatedAt,
  };
}

// ============================================================
// tech.staff（技術スタッフ: 作業日ごと・役職の見出し＋名前。§8-1）
// ============================================================
const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

/** `2026-10-15` → `10/15（木）`。読めない値はそのまま返す（画面に出す札なので落とさない） */
function dayLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return date;
  return `${Number(m[2])}/${Number(m[3])}（${WEEKDAY[d.getUTCDay()]}）`;
}

export async function resolveTechStaff(ctx: ManualTechResolveCtx): Promise<ManualTechResolveResult> {
  const resolved = await resolveAccessibleTechDoc(ctx);
  if (!resolved.ok) return resolved.result;
  const doc = resolved.doc;

  const rows = (await queryAll(
    `SELECT to_char(work_date, 'YYYY-MM-DD') AS work_date, role, person_name, company_name, note, sort_order
       FROM qsheet_tech_staff_rows WHERE tech_doc_id = $1 ORDER BY work_date, sort_order, created_at`,
    [doc.id],
  )) as unknown as TechStaffRow[];

  // 名前の入っていない行（画面で足しただけの空行）は紙に出さない
  const filled = rows.filter((r) => (r.person_name ?? '').trim() !== '');

  const days: { date: string; label: string; count: number; roles: { role: string; people: { name: string; company: string; note: string }[] }[] }[] = [];
  for (const r of filled) {
    const date = (r.work_date as string) ?? '';
    let day = days.find((d) => d.date === date);
    if (!day) {
      day = { date, label: dayLabel(date), count: 0, roles: [] };
      days.push(day);
    }
    const role = (r.role as string) ?? '';
    let group = day.roles.find((x) => x.role === role);
    if (!group) {
      group = { role, people: [] };
      day.roles.push(group);
    }
    group.people.push({ name: r.person_name, company: (r.company_name as string) ?? '', note: (r.note as string) ?? '' });
    day.count += 1;
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  // 役職は元のメンバー表と同じ並び（`roles.ts` の典型の並び順。一覧に無い役職は末尾）
  for (const day of days) day.roles.sort((a, b) => roleOrder(a.role) - roleOrder(b.role));

  return {
    data: { ...headOf(doc), days, count: filled.length, updatedAt: doc.updatedAt },
    updatedAt: doc.updatedAt,
  };
}

// ============================================================
// link-sources エンドポイント用: この project/program に属する技術資料の一覧
// ============================================================
export interface TechSourceOption {
  id: string;
  label: string;
}

/**
 * `listVenueSources` と同じ形——一覧に出す時点で `canAccessTechDoc` を通し、
 * 本人が読めない資料（他人の番組の資料など）をタイトルごと隠す。
 */
export async function listTechSources(scope: ManualTechResolveScope, user: AccessUser): Promise<TechSourceOption[]> {
  let sql = 'SELECT id, title, doc_no, status, created_by FROM qsheet_tech_docs WHERE deleted_at IS NULL';
  const params: unknown[] = [];
  if (scope.projectId) {
    sql += ' AND project_id = $1';
    params.push(scope.projectId);
  } else if (scope.programId) {
    sql += ' AND program_id = $1';
    params.push(scope.programId);
  } else {
    return [];
  }
  sql += ' ORDER BY updated_at DESC LIMIT 200';

  const rows = await queryAll(sql, params);
  const STATUS_LABEL: Record<string, string> = { draft: '下書き', fixed: '確定' };
  const options: TechSourceOption[] = [];
  for (const r of rows) {
    if (!(await canAccessTechDoc(user, r.id as string, (r.created_by as string) ?? null))) continue;
    const parts = [(r.doc_no as string) || '', (r.title as string) || '（無題）'];
    const status = typeof r.status === 'string' ? STATUS_LABEL[r.status] : undefined;
    if (status) parts.push(`（${status}）`);
    options.push({ id: r.id as string, label: parts.filter(Boolean).join(' ') });
  }
  return options;
}
