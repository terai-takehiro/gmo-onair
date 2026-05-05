// CG side animation durations. Values mirror the CSS @keyframes used by the
// lower-third + ticker so that JS-side cleanup timeouts stay in sync.
export const LT_EXIT_MS = 480;       // .lt-exit ~380ms + 100ms safety buffer
export const TICKER_EXIT_MS = 420;   // .t-exit
export const SLOT_DURATION = 420;    // .slot-fade-in / SlotSwitcher cross-fade (legacy, unused by 3-phase v2.8.73)
export const PANEL_HEIGHT_MS = 360;  // useAnimatedHeight panel resize (v2.8.81 で resize phase と同期)

// v2.8.73+: SlotSwitcher 3-phase sequencing (text fade-out → height resize → text fade-in)
// v2.8.81: 1200ms は長すぎ + カクつき残感 → 780ms に縮めつつ sineInOut で滑らか維持。
//   exit + resize + enter = 180 + 360 + 240 = 780ms。CSS width transition も 360ms 同期。
export const SLOT_PHASE_EXIT_MS   = 180;  // 旧コンテンツ フェードアウト
export const SLOT_PHASE_RESIZE_MS = 360;  // パネル高さ・幅補間 (sineInOut)
export const SLOT_PHASE_ENTER_MS  = 240;  // 新コンテンツ フェードイン (子 stagger 含む)

// v2.8.73+: Ticker 部門切替のクロスフェード時間
export const TICKER_DIV_SWAP_MS = 600;
