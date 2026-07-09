// ユーザー ID から決定的にカーソル色 (hex) を選ぶ。ライブカーソル/選択ハイライト用。
const PALETTE = [
  '#0d9488', '#4f46e5', '#db2777', '#d97706',
  '#059669', '#0284c7', '#e11d48', '#7c3aed',
];

export function userColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
