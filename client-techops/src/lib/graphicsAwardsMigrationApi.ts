/**
 * テロップCG — 旧リアルタイムCG（client-awards）過去実績データの変換移行ツール（段6-9）。
 *
 * サーバー側の契約（`server/src/contexts/graphics/routes/awards-migration.routes.ts`）:
 *   GET  /graphics/awards-migration/events                    … 移行元候補（旧 awards_events）の一覧
 *   GET  /graphics/awards-migration/events/:eventId/preview   … 変換後のプレビュー（DBには書き込まない）
 *   POST /graphics/awards-migration/events/:eventId/commit    … 実際に graphics_projects/graphics_pages を作成
 *
 * `graphicsRosterApi.ts` と同じ「preview→commit」の2段構え（名簿インポートの dry-run と同型）。
 */
import api from '@/lib/api';

export interface AwardsMigrationEventSummary {
  id: number;
  name: string;
  subtitle: string | null;
  status: string;
  scheduledAt: string | null;
  categoryCount: number;
  entryCount: number;
}

export type AwardsMigrationPattern = 'direct' | 'vote';

export interface AwardsMigrationPagePreview {
  categoryId: number;
  categoryName: string;
  categoryNameEn: string | null;
  awardPattern: AwardsMigrationPattern;
  entryCount: number;
  /** データ不整合の警告（rank重複・pointsが全員0・nameが空、等）。あっても移行は止まらない。 */
  warnings: string[];
}

export interface AwardsMigrationPreview {
  event: { id: number; name: string; status: string };
  project: { ownerId: string; name: string; theme: string };
  pages: AwardsMigrationPagePreview[];
  /** イベント全体に関わる警告（カテゴリが1件も無い、等） */
  warnings: string[];
  /** 既にこのイベントが移行済みかどうか（同じ owner の CGプロジェクトが存在する） */
  alreadyMigrated: boolean;
}

export interface AwardsMigrationCommitResult {
  projectId: number;
  pageIds: number[];
}

export async function listAwardsMigrationEvents(): Promise<AwardsMigrationEventSummary[]> {
  const { data } = await api.get('/graphics/awards-migration/events');
  return data.data;
}

export async function previewAwardsMigration(eventId: number): Promise<AwardsMigrationPreview> {
  const { data } = await api.get(`/graphics/awards-migration/events/${eventId}/preview`);
  return data.data;
}

export async function commitAwardsMigration(eventId: number): Promise<AwardsMigrationCommitResult> {
  const { data } = await api.post(`/graphics/awards-migration/events/${eventId}/commit`, {});
  return data.data;
}

/** axios のエラーから、サーバーが返した日本語メッセージを取り出す（無ければ undefined）。
 *  `AiKnowledgePage.tsx` 等と同じ取り出し方。 */
export function extractApiErrorMessage(e: unknown): string | undefined {
  return (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
}
