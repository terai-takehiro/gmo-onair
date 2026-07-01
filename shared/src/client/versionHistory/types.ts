// shared/src/client/versionHistory/types.ts — バージョン履歴データのスキーマ
// scripts/generate-version-history.mjs が CLAUDE.md から生成する JSON の形と一致させる。
export interface VersionHistoryEntry {
  version: string;
  isCurrent: boolean;
  title: string;
  description: string;
}

export interface VersionHistoryData {
  generatedAt: string;
  generatedFrom: string;
  product: string;
  currentVersion: string | null;
  count: number;
  versions: VersionHistoryEntry[];
}
