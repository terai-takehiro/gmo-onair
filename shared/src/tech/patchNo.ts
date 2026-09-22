/**
 * パッチ番号の組み立てと分解（純粋関数・Vitest）。設計: docs/design/v4/tech-docs.md §4-2
 *
 * パッチ番号は「盤の百の位 ＋ 盤内の2桁 ＋ 段」の合成: VJP200 の 16 番 B段 → `216B`。
 * 列には持たず、盤の名前と jack_no / jack_row から毎回組み立てる（盤の名前を直しても番号が古くならない）。
 * TRK 盤（kind: 'trunk'）は `TRK12` のように段を持たない。
 */
import type { PatchJackRow, PatchPanelKind } from './types';

/** 盤の名前（VJP100〜VJP1800）から百の位を取り出す。取れなければ null */
export function panelHundreds(panelName: string): number | null {
  const m = /^[A-Z]+(\d+)$/.exec(panelName.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 100 || n % 100 !== 0) return null;
  return n / 100;
}

/** `216B` / `TRK12` を組み立てる */
export function patchNo(panelName: string, jackNo: number, jackRow: PatchJackRow, kind: PatchPanelKind = 'jack'): string {
  if (kind === 'trunk') return `TRK${jackNo}`;
  const h = panelHundreds(panelName);
  if (h == null) return `${jackNo}${jackRow}`;
  return `${h}${String(jackNo).padStart(2, '0')}${jackRow}`;
}

export interface ParsedPatchNo {
  hundreds: number;
  jackNo: number;
  jackRow: PatchJackRow;
}

/** `216B` を分解する。書式が違えば null（`TRK12` も null） */
export function parsePatchNo(text: string): ParsedPatchNo | null {
  const m = /^(\d{1,2})(\d{2})([AB])$/.exec(text.trim().toUpperCase());
  if (!m) return null;
  return { hundreds: Number(m[1]), jackNo: Number(m[2]), jackRow: m[3] as PatchJackRow };
}

/** 分解した番号が指す盤の名前（VJP を前提） */
export function panelNameOf(parsed: ParsedPatchNo, prefix = 'VJP'): string {
  return `${prefix}${parsed.hundreds * 100}`;
}
