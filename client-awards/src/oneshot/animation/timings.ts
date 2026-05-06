// CG side animation durations. Values mirror the CSS @keyframes used by the
// lower-third + ticker so that JS-side cleanup timeouts stay in sync.
export const LT_EXIT_MS = 480;       // .lt-exit ~380ms + 100ms safety buffer
export const TICKER_EXIT_MS = 420;   // .t-exit
export const SLOT_PHASE_EXIT_MS = 180;  // SlotSwitcher 旧コンテンツ fade-out
export const TICKER_DIV_SWAP_MS = 600;  // ticker 部門切替クロスフェード
