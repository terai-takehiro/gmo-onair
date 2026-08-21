import type { RecentItem } from '@gmo-onair/shared/src/client-v4/recent';
import type { Shortcut } from './shortcuts';

export interface SearchResults {
  projects: Array<{ id: string; code: string; gls_number: string | null; name: string; stage: string }>;
  customers: Array<{ id: string; name: string; short_name: string; phone?: string | null; contact_name?: string | null }>;
  vendors: Array<{ id: string; name: string; vendor_type: string }>;
}

/**
 * PC（`SearchPageDesktop.tsx`）とスマホ（`SearchPageMobile.tsx`）が受け取る props。
 *
 * 問い合わせ（デバウンス・投げた順番の管理）・権限フィルタ・「最近見たもの」の
 * 読み書きは薄い親（`SearchPage.tsx`）が1回だけ持ち、ここから下は見た目だけを
 * 組み立てる（`useIsMobile()` は薄い親で1回だけ呼ぶ・機材管理の `search/` と同じ形）。
 */
export interface SearchPageViewProps {
  query: string;
  onType: (v: string) => void;
  /** 何か打っている（0文字なら打つ前の状態） */
  searching: boolean;
  failed: unknown;
  onRetry: () => void;
  results: SearchResults | null;
  total: number;

  doItems: Shortcut[];
  places: Shortcut[];
  onGoShortcut: (s: Shortcut) => void;

  recent: RecentItem[];
  onOpenRecent: (to: string) => void;
  /** 1件だけ消す（読むだけで削除操作が無かった分の追加） */
  onRemoveRecent: (to: string) => void;

  onOpenProject: (id: string) => void;
  onOpenCustomer: (id: string) => void;
  /** 仕入先だけ個別の画面が無いので一覧へ送る */
  onOpenVendor: () => void;
}
