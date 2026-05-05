// CG side animation durations. Values mirror the CSS @keyframes used by the
// lower-third + ticker so that JS-side cleanup timeouts stay in sync.
export const LT_EXIT_MS = 480;       // .lt-exit ~380ms + 100ms safety buffer
export const TICKER_EXIT_MS = 420;   // .t-exit
export const SLOT_DURATION = 420;    // .slot-fade-in / SlotSwitcher cross-fade
export const PANEL_HEIGHT_MS = 520;  // useAnimatedHeight panel resize
