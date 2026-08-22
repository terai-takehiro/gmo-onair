// セル (blocks.map の中で描画する型ごとのコンポーネント) が共有する型定義。
// 元は CueRow.tsx に直書きされていたものを、cells/ への切り出し (段5 PR3) で
// ここへ移した。挙動に関わる変更はしていない (純粋な移動)。

export interface Block {
  id: string;
  type: string;
  label: string;
  width: string | number;
  widthPx?: number;
}

export interface CueRowData {
  duration: string;
  cells: Record<string, any>;
  [key: string]: any;
}

export interface LedScene {
  id: string;
  name: string;
  wall: string;
  floor: string;
}
