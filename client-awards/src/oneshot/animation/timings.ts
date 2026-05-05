// CG side animation durations. Values mirror the CSS @keyframes used by the
// lower-third + ticker so that JS-side cleanup timeouts stay in sync.
export const LT_EXIT_MS = 480;       // .lt-exit ~380ms + 100ms safety buffer
export const TICKER_EXIT_MS = 420;   // .t-exit
export const SLOT_DURATION = 420;    // .slot-fade-in / SlotSwitcher cross-fade (legacy, unused by 3-phase v2.8.73)
export const PANEL_HEIGHT_MS = 560;  // useAnimatedHeight panel resize (v2.8.79 で resize phase と同期)

// v2.8.73+: SlotSwitcher 3-phase sequencing (text fade-out → height resize → text fade-in)
// v2.8.79: ユーザー報告「速すぎてカクついて見える」に対応 — durations 拡張 + sineInOut 系の
//   均等な easing で滑らか優先に。expoOut (0→25% で 80% 動く) はジョルト感の原因だった。
//   exit + resize + enter = 280 + 560 + 360 = 1200ms (smoother / 各フェーズ ~1.5x)
export const SLOT_PHASE_EXIT_MS   = 280;  // 旧コンテンツ フェードアウト (ゆとりのある退場)
export const SLOT_PHASE_RESIZE_MS = 560;  // パネル高さ・幅補間 (見える滑らかな動き)
export const SLOT_PHASE_ENTER_MS  = 360;  // 新コンテンツ フェードイン (ふわっと登場)

// v2.8.73+: Ticker 部門切替のクロスフェード時間
export const TICKER_DIV_SWAP_MS = 600;
