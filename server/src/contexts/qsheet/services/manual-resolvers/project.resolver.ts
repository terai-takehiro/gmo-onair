/**
 * 運営マニュアル 段C — 差し込みブロックの resolver: 案件（`project.heading` / `project.team`）。
 * 設計: docs/design/v4/production-manual.md §4-3・§5-4。レジストリは
 * `shared/src/production/manualBlocks.ts`（`server/src/shared/production/manualBlocks.ts` は複製・変更しない）。
 *
 * ── 共通ポリシー（resolver 全員が守る決めごと。呼び出し元＝ `GET /techops/manuals/:id/resolve` 側の実装） ──
 * resolve はサーバーの実行権限で読む。呼び出しユーザーが `sales` モジュール権限を個別に
 * 持っているかはここでは再チェックしない——**マニュアル自体が `canAccessManual` を通っていること
 * だけ**をゲートにする（一度差し込んだ情報は、マニュアルを見られる人になら見える、という設計判断）。
 * この resolver は `resolve` 経由専用で、単体で外部公開しない。
 *
 * ── なぜ `projectService.getById()` をそのまま使わないか ──────────────────────
 * `getById()` は一覧・詳細画面向けに売上・仕入・見積金額まで JOIN する重い問い合わせで、
 * ここでは見出しに要る列だけを直接引く。
 *
 * ⚠️⚠️ 外部レビュー再指摘（P1）: `projects.event_start`/`event_end` は DATE ではなく
 * **TEXT**（`YYYY-MM-DD`・migration 001b）——`device-settings.routes.ts` の同じ注意書きの
 * とおり、`to_char(text, ...)` は Postgres の型エラー（`function to_char(text, unknown)
 * does not exist`）になる。以前はこの2列に `to_char()` を掛けて引いていたため、案件紐づけの
 * `project.heading` ブロックが**必ず** `resolve_failed` になり一度も表示できていなかった。
 * TEXT 列をそのまま select するだけでよい（すでに `YYYY-MM-DD` 形式）。
 *
 * ── data の形（client-linked-ui 担当向け。無い項目はキーごと省く。空文字/null のラベルを出さない） ──
 *
 * `project.heading` → `ProjectHeadingData | null`
 *   - `projectId` が無い（programId 由来のマニュアル）ときは常に `null`
 *     （案件管理はプロジェクト専用——programId のマニュアルに対応する project は無い）
 *   - `projects` に「回」「会場」に相当する列が無いため、この2つは仕様上出せない（キーごと無い）
 *   - `serviceDateHint` は **project 由来ではなくマニュアル自身の `qsheet_manuals.service_date`**
 *     （呼び出し元が `ctx.manualServiceDate` として渡す）。「その日」を示すのに使う
 *
 * `project.team` → `ProjectTeamMemberData[]`
 *   - `projectId` が無ければ常に空配列
 *   - `phone` は社内ユーザー（`is_external = false`）だけ（`users.phone` を JOIN）。
 *     外部の方は `project_members` に電話の列が無いため出さない（キーごと省く）
 */
import { queryOne, queryAll, type Row } from '../../../../shared/db/connection';
import type { AccessUser } from '../../access';

/** resolver 全員が受け取る引数の形（各 resolver ファイルが自己完結するようここに複製する。
 *  `schedule.service.ts` / `manual.service.ts` が `AccessUser` をそれぞれ複製しているのと同じ作法） */
export interface ManualResolverCtx {
  /** マニュアルが案件に紐づくときの案件 id。program 紐づけのマニュアルでは null */
  projectId: string | null;
  /** マニュアルが番組に紐づくときの番組 id。project 紐づけのマニュアルでは null */
  programId: string | null;
  /** ブロックが指す差し込み元の id（`sheet.rundown`/`sheet.excerpt`/`sheet.micAssignment` の3種だけ必須）。
   *  この2つの resolver では使わない（project.heading/team は project_id 単位で一意なため） */
  sourceId: string | null;
  /** `link.reveal?.fields`。秘密の伏せ字解除に使うのは streaming.* だけ。この2つの resolver では使わない */
  revealFields: string[];
  /** マニュアル自身の予定日（`qsheet_manuals.service_date`、YYYY-MM-DD）。project 由来ではない */
  manualServiceDate: string | null;
  /** 呼び出し本人。`schedule.resolver.ts` が `canAccessSchedule` の判定に使う（レビュー指摘）。
   *  この2つの resolver では使わない */
  user: AccessUser;
}

/** すべての resolver の戻り値。統一シグネチャ（production-manual.md §5-4） */
export interface ManualResolverResult {
  data: unknown;
  updatedAt: string | null;
}

export interface ProjectHeadingData {
  /** projects.name */
  projectName?: string;
  /** projects.gls_number（未発番なら省く） */
  glsNumber?: string;
  /** YYYY-MM-DD（projects.event_start） */
  eventStart?: string;
  /** YYYY-MM-DD。event_start と異なるときだけ持つ（単日開催で同じ日付を二重に出さない） */
  eventEnd?: string;
  /** YYYY-MM-DD。マニュアル自身の service_date（ctx.manualServiceDate） */
  serviceDateHint?: string;
}

export interface ProjectTeamMemberData {
  /** project_members.role */
  role?: string;
  /** project_members.member_name（登録ユーザーは users.name を優先表示） */
  name: string;
  /** users.phone。社内ユーザー（is_external=false）だけ */
  phone?: string;
}

/** `project.heading`: 見出し（案件名・管理番号・日付）。projectId が無ければ null */
export async function resolveProjectHeading(ctx: ManualResolverCtx): Promise<ManualResolverResult> {
  if (!ctx.projectId) return { data: null, updatedAt: null };

  const row = (await queryOne(
    `SELECT name, gls_number, event_start, event_end, updated_at
     FROM projects
     WHERE id = $1 AND deleted_at IS NULL`,
    [ctx.projectId],
  )) as Row | undefined;
  if (!row) return { data: null, updatedAt: null };

  const data: ProjectHeadingData = {};
  const name = row.name as string | null;
  const glsNumber = row.gls_number as string | null;
  const eventStart = row.event_start as string | null;
  const eventEnd = row.event_end as string | null;
  if (name) data.projectName = name;
  if (glsNumber) data.glsNumber = glsNumber;
  if (eventStart) data.eventStart = eventStart;
  if (eventEnd && eventEnd !== eventStart) data.eventEnd = eventEnd;
  if (ctx.manualServiceDate) data.serviceDateHint = ctx.manualServiceDate;

  const updatedAt = row.updated_at ? new Date(row.updated_at as string).toISOString() : null;
  return { data, updatedAt };
}

/** `project.team`: 体制・連絡先（役割・氏名・電話）。projectId が無ければ空配列 */
export async function resolveProjectTeam(ctx: ManualResolverCtx): Promise<ManualResolverResult> {
  if (!ctx.projectId) return { data: [], updatedAt: null };

  const rows = (await queryAll(
    `SELECT
       m.role,
       COALESCE(u.name, m.member_name) AS name,
       m.is_external,
       u.phone,
       m.updated_at
     FROM project_members m
     LEFT JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL
     WHERE m.project_id = $1 AND m.deleted_at IS NULL
     ORDER BY m.sort_order, m.created_at`,
    [ctx.projectId],
  )) as Row[];

  const data: ProjectTeamMemberData[] = rows.map((r) => {
    const item: ProjectTeamMemberData = { name: r.name as string };
    const role = r.role as string | null;
    // 電話番号は社内ユーザーだけ（project_members 自体は電話の列を持たない。外部の方は出さない）
    const phone = r.is_external ? null : (r.phone as string | null);
    if (role) item.role = role;
    if (phone) item.phone = phone;
    return item;
  });

  let updatedAt: string | null = null;
  for (const r of rows) {
    const t = new Date(r.updated_at as string).toISOString();
    if (!updatedAt || t > updatedAt) updatedAt = t;
  }

  return { data, updatedAt };
}
