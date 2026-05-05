// CG side animation durations. Values mirror the CSS @keyframes used by the
// lower-third + ticker so that JS-side cleanup timeouts stay in sync.
export const LT_EXIT_MS = 480;       // .lt-exit ~380ms + 100ms safety buffer
export const TICKER_EXIT_MS = 420;   // .t-exit
export const SLOT_DURATION = 420;    // .slot-fade-in / SlotSwitcher cross-fade (legacy, unused by 3-phase v2.8.73)
export const PANEL_HEIGHT_MS = 300;  // useAnimatedHeight panel resize (v2.8.78 で resize phase と同期)

// v2.8.73+: SlotSwitcher 3-phase sequencing (text fade-out → height resize → text fade-in)
// v2.8.78+: なめらかさ向上のため、フェーズを短縮 + 同期。
//   exit + resize + enter = 200 + 300 + 260 = 760ms (旧 1020ms から短縮)。
export const SLOT_PHASE_EXIT_MS   = 200;  // 旧コンテンツ フェードアウト
export const SLOT_PHASE_RESIZE_MS = 300;  // パネル高さ補間 (useAnimatedHeight 同値)
export const SLOT_PHASE_ENTER_MS  = 260;  // 新コンテンツ フェードイン

// v2.8.73+: Ticker 部門切替のクロスフェード時間
export const TICKER_DIV_SWAP_MS = 600;
