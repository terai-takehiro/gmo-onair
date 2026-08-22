// レンタル機材検索の API 呼び出し。deviceSettingsApi.ts と同じ作法（axios の `api` インスタンス
// を薄くラップするだけ・型は interface で定義）。エンドポイント一覧は実装タスクの契約を参照。
import api from '@/lib/api';

/** DB上の会社名は必ずこの2値の完全一致文字列（qsheet_rental_items.company） */
export type RentalCompany = '東京オフラインセンター' | 'レスター';

export type RentalItemStatus = 'listed' | 'missing';
export type RentalReservationStatus = 'draft' | 'requested';

export interface RentalItemSummary {
  company: string;
  itemId: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  priceTel: number | null;
  priceNet: number | null;
  thumbnailUrl: string | null;
  status: RentalItemStatus;
}

export interface RentalCategoryCount {
  category: string;
  count: number;
}

export interface RentalCompanyCount {
  company: string;
  count: number;
}

export interface RentalItemsResult {
  items: RentalItemSummary[];
  total: number;
  /** company/q 絞り込み後・category 自体の絞り込み前のカテゴリ別件数（絞り込みチップ用） */
  categories: RentalCategoryCount[];
  /** q 絞り込み後・company 絞り込み前の会社別件数 */
  companies: RentalCompanyCount[];
}

export interface RentalRelatedItem {
  company: string;
  itemId: string;
  name: string;
  priceNet: number | null;
}

export interface RentalItemDetail {
  company: string;
  itemId: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  priceTel: number | null;
  priceNet: number | null;
  status: RentalItemStatus;
  specs: Record<string, string>;
  images: string[];
  url: string | null;
  relatedItems: RentalRelatedItem[];
}

export interface RentalConflict {
  ownerLabel: string;
  date: string;
}

export interface RentalReservationLine {
  id: string;
  company: string;
  itemId: string;
  itemName: string;
  category: string | null;
  quantity: number;
  startDate: string;
  endDate: string;
  priceNet: number | null;
  lineTotal: number;
  status: RentalReservationStatus;
  conflict: RentalConflict | null;
}

export interface RentalReservationGroup {
  company: string;
  status: RentalReservationStatus | 'mixed';
  requestedAt: string | null;
  subtotal: number;
  lines: RentalReservationLine[];
}

export interface RentalReservationsResult {
  groups: RentalReservationGroup[];
}

export interface RentalMailDraft {
  subject: string;
  body: string;
  itemCount: number;
  quantityTotal: number;
  subtotal: number;
}

export interface RentalSyncStatusCompany {
  company: string;
  lastSeenAt: string | null;
  listedCount: number;
  missingCount: number;
}

export interface RentalSyncStatus {
  companies: RentalSyncStatusCompany[];
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

const base = '/qsheet/rental';
const reservationsBase = (ownerKey: string) => `${base}/${encodeURIComponent(ownerKey)}/reservations`;

export async function getRentalSyncStatus(): Promise<RentalSyncStatus> {
  const { data } = await api.get<Envelope<RentalSyncStatus>>(`${base}/sync-status`);
  return data.data;
}

export interface SearchRentalItemsParams {
  q?: string;
  company?: RentalCompany;
  category?: string;
  page?: number;
  pageSize?: number;
}

export async function searchRentalItems(params: SearchRentalItemsParams): Promise<RentalItemsResult> {
  const { data } = await api.get<Envelope<RentalItemsResult>>(`${base}/items`, { params });
  return data.data;
}

export async function getRentalItem(company: string, itemId: string): Promise<RentalItemDetail> {
  const { data } = await api.get<Envelope<RentalItemDetail>>(
    `${base}/items/${encodeURIComponent(company)}/${encodeURIComponent(itemId)}`,
  );
  return data.data;
}

export async function getRentalReservations(ownerKey: string): Promise<RentalReservationsResult> {
  const { data } = await api.get<Envelope<RentalReservationsResult>>(reservationsBase(ownerKey));
  return data.data;
}

export interface AddRentalReservationPayload {
  company: string;
  itemId: string;
  quantity: number;
  startDate: string;
  endDate: string;
}

export async function addRentalReservation(
  ownerKey: string,
  payload: AddRentalReservationPayload,
): Promise<RentalReservationLine> {
  const { data } = await api.post<Envelope<RentalReservationLine>>(reservationsBase(ownerKey), payload);
  return data.data;
}

export interface UpdateRentalReservationPayload {
  quantity?: number;
  startDate?: string;
  endDate?: string;
}

export async function updateRentalReservation(
  ownerKey: string,
  id: string,
  payload: UpdateRentalReservationPayload,
): Promise<void> {
  await api.put(`${reservationsBase(ownerKey)}/${encodeURIComponent(id)}`, payload);
}

export async function deleteRentalReservation(ownerKey: string, id: string): Promise<void> {
  await api.delete(`${reservationsBase(ownerKey)}/${encodeURIComponent(id)}`);
}

export async function requestRentalReservations(ownerKey: string, company: string): Promise<number> {
  const { data } = await api.post<Envelope<{ updated: number }>>(
    `${reservationsBase(ownerKey)}/${encodeURIComponent(company)}/request`,
  );
  return data.data.updated;
}

export async function getRentalMailDraft(ownerKey: string, company: string): Promise<RentalMailDraft> {
  const { data } = await api.get<Envelope<RentalMailDraft>>(
    `${reservationsBase(ownerKey)}/${encodeURIComponent(company)}/mail-draft`,
  );
  return data.data;
}
