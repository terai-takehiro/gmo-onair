/**
 * 計時・視聴者 — 表示画面の自由配置レイアウトの型定義。
 *
 * `client-live`（表示画面 `TimerDisplayPage.tsx`）・`client-qsheet`（将来のエディタ、PR3）の
 * 両方から import する唯一の型定義。表示画面とエディタで型がずれる事故を防ぐ。
 *
 * 設計: docs/design/v4/qsheet-v4-coding/13-live-display-layout-editor.md §2-2
 */

export type DisplayElementKey =
  | 'timer'
  | 'youtube'
  | 'jstream'
  | 'zoom'
  | 'teams'
  | 'total';

/**
 * `DisplayElementKey` の実体（実行時に列挙できる形）。型だけでは validate に使えないため、
 * 表示画面（`TimerDisplayPage.tsx`）・エディタ（PR3）双方の要素単位 validate が
 * ここを唯一の正として参照する。新しいキーを増やすときはここと上の型を両方直すこと。
 */
export const DISPLAY_ELEMENT_KEYS: readonly DisplayElementKey[] = [
  'timer',
  'youtube',
  'jstream',
  'zoom',
  'teams',
  'total',
];

export interface DisplayElementLayout {
  key: DisplayElementKey;
  visible: boolean;
  /**
   * 1280×720 の仮想キャンバスに対する割合 (0–100)。
   * 実際の表示解像度（会場モニターの実ピクセル数）に依らず相似で配置するため
   * px ではなく % を採用する。
   */
  x: number; // 左端の %
  y: number; // 上端の %
  w: number; // 幅の %
  h: number; // 高さの %
}

export interface DisplayLayout {
  /** 将来の構造変更に備えたスキーマバージョン。今回は 1 固定 */
  version: 1;
  background: 'dark' | 'light'; // 既存 Toggles.lightBase に対応
  /** 6キー固定。順不同・欠けは「非表示扱い」 */
  elements: DisplayElementLayout[];
}
