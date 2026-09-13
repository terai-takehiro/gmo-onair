// 会場図面 — 編集盤（画面②・`/techops/venue-layouts/:id`）。PC＝編集・スマホ＝閲覧
// （設計: docs/design/v4/venue-layout.md §14-5「スマホは閲覧のみ」）。
// PC/スマホは丸ごと別画面へ入れ替える薄い親（`ManualDetailRouter.tsx` と同じ形。
// `shared/CLAUDE.md`「useIsMobile() で早期returnしない — 薄い親で部品ごと入れ替える」）。
import { useIsMobile } from "@gmo-onair/shared/src/client-v4/mobile";
import VenueEditorDesktop from "./VenueEditorDesktop";
import VenueEditorMobile from "./VenueEditorMobile";

export default function VenueEditorRouter() {
  return useIsMobile() ? <VenueEditorMobile /> : <VenueEditorDesktop />;
}
