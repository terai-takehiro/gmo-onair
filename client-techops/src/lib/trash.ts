// Qシート: ゴミ箱ユーティリティ
// 削除したセクション／キュー行／エントリを doc.data.trash に退避し、
// 後から復元・完全削除できるようにする。

export type TrashItemType = 'section' | 'row' | 'entry';

export interface TrashOrigin {
  sectionIdx?: number;
  rowIdx?: number;
  blockId?: string;
  entryIdx?: number;
  sectionLabel?: string;
  rowLabel?: string;
}

export interface TrashItem {
  id: string;
  deletedAt: string;
  type: TrashItemType;
  payload: any;
  origin: TrashOrigin;
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function makeTrashItem(type: TrashItemType, payload: any, origin: TrashOrigin): TrashItem {
  return {
    id: shortId(),
    deletedAt: new Date().toISOString(),
    type,
    payload: JSON.parse(JSON.stringify(payload)),
    origin,
  };
}

// doc.data にゴミ箱配列が無い場合に備えて取得
export function getTrash(data: any): TrashItem[] {
  return Array.isArray(data?.trash) ? (data.trash as TrashItem[]) : [];
}

// ゴミ箱にアイテムを追加した新しい data を返す
export function pushToTrash(data: any, item: TrashItem): any {
  const trash = getTrash(data);
  return { ...data, trash: [...trash, item] };
}

// ゴミ箱からアイテムを除く
export function removeFromTrash(data: any, itemId: string): any {
  const trash = getTrash(data);
  return { ...data, trash: trash.filter(t => t.id !== itemId) };
}

export function clearTrash(data: any): any {
  return { ...data, trash: [] };
}

// 日時の相対表示
export function formatDeletedAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}時間前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}日前`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// TrashItem の表示名（ゴミ箱ドロワーの一行目）
export function describeTrashItem(item: TrashItem): string {
  switch (item.type) {
    case 'section': {
      const payload = item.payload || {};
      if (payload._break) return `CM「${payload.label || 'CM'}」`;
      if (payload._pageBreak) return 'ページ区切り';
      if (payload._vtr) return `VTR「${payload.label || 'VTR'}」`;
      return `ロール「${payload.label || '無題'}」 (${(payload.rows || []).length}行)`;
    }
    case 'row': {
      const label = item.origin.rowLabel || 'キュー行';
      const section = item.origin.sectionLabel ? `ロール「${item.origin.sectionLabel}」内の` : '';
      return `${section}${label}`;
    }
    case 'entry': {
      const p = item.payload || {};
      const name = p.name || p.label || '（空）';
      return `エントリ「${name}」`;
    }
    default:
      return '(不明な項目)';
  }
}
