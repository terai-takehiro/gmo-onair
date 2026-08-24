// 機材管理「レンタル機材検索」の API 呼び出し。
//
// エンドポイントは `server/src/contexts/equipment/routes/rental-catalog.routes.ts`
// （検索・詳細・取得状況の読み取りだけ。予約リスト・今すぐ取得は制作技術支援側専用）。
// 型・関数名は `client-techops/src/lib/rentalApi.ts` の対応する部分に意図的に揃えてある
// （データの実体は同じ `qsheet_rental_items` のため、呼ぶ側の形も揃えたほうが読みやすい）。
import api from '@/lib/api';

/** DB上の会社名は必ずこの2値の完全一致文字列（qsheet_rental_items.company） */
export type RentalCompany = 'TOC' | 'レスター';

export type RentalItemStatus = 'listed' | 'missing';

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
  categories: RentalCategoryCount[];
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

const base = '/equipment/rental-catalog';

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
