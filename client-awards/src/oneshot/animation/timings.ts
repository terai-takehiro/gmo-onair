// CG side animation durations. Values mirror the CSS @keyframes used by the
// lower-third + ticker so that JS-side cleanup timeouts stay in sync.
export const LT_EXIT_MS = 480;       // .lt-exit ~380ms + 100ms safety buffer
export const TICKER_EXIT_MS = 420;   // .t-exit
export const SLOT_DURATION = 420;    // .slot-fade-in / SlotSwitcher cross-fade (legacy, unused by 3-phase v2.8.73)
export const PANEL_HEIGHT_MS = 520;  // useAnimatedHeight panel resize

// v2.8.73+: SlotSwitcher 3-phase sequencing (text fade-out → height resize → text fade-in)
export const SLOT_PHASE_EXIT_MS   = 220;  // 旧コンテンツ フェードアウト
export const SLOT_PHASE_RESIZE_MS = 480;  // パネル高さ補間 (useAnimatedHeight と揃える)
export const SLOT_PHASE_ENTER_MS  = 320;  // 新コンテンツ フェードイン
// 合計 ~1020ms。旧版 (420ms クロスフェード並走) より長いが、カクツキを排除して滑らか。

// v2.8.73+: Ticker 部門切替のクロスフェード時間
export const TICKER_DIV_SWAP_MS = 600;
