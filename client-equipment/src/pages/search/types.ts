import type { EquipmentRecord } from '../equipmentList/types';
import type { CatalogItem } from '../catalog/types';
import type { StandbyRow } from './standby';

/**
 * PC（`SearchPageDesktop.tsx`）とスマホ（`SearchPageMobile.tsx`）が
 * 受け取る props。**問い合わせ・絞り込みのロジックは薄い親（`SearchPage.tsx`）
 * が1回だけ持ち**、ここから下は見た目だけを組み立てる。
 */
export interface SearchPageViewProps {
  query: string;
  onType: (v: string) => void;
  searching: boolean;
  loading: boolean;
  total: number;
  debounced: string;
  found: EquipmentRecord[];
  supplies: CatalogItem[];
  standbyRows: StandbyRow[];
  onGo: (to: string) => void;
  onOpenEquipment: (id: string) => void;
  onOpenSupply: () => void;
  onScan: () => void;
}
