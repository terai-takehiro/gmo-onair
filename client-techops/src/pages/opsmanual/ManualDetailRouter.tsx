// マニュアル1件の画面（"/techops/manuals/:id"）— PC は編集（`ManualDetailPage.tsx`）、
// スマホは閲覧専用（`ManualMobileViewPage.tsx`）を**丸ごと入れ替える**だけの薄い親
// （段E・production-manual.md §6⑥。`shared/CLAUDE.md`「`useIsMobile()` で早期returnしない —
// 薄い親で部品ごと入れ替える」）。判定はここで1回だけ行い、`ManualDetailPage.tsx` 自体の
// 中には `useIsMobile()` の早期returnを書かない（`client/src/contexts/sales/pages/projectNew/
// NewProjectDialog.tsx` と同じ形）。
import { useIsMobile } from "@gmo-onair/shared/src/client-v4/mobile";
import ManualDetailPage from "./ManualDetailPage";
import ManualMobileViewPage from "./ManualMobileViewPage";

export default function ManualDetailRouter() {
  return useIsMobile() ? <ManualMobileViewPage /> : <ManualDetailPage />;
}
