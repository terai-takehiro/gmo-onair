/**
 * 映像パッチの矢印表記（純粋関数・Vitest）。設計: docs/design/v4/tech-docs.md §8-1
 *
 * 現場のパッチ表と同じ `機材 out [101A] → 機材 in [136B]` の形。増設機材は番号を持たないので
 * `ATEM 2 M/E in1（増設）` のように端子名と「増設」を添える。
 */
import type { TechPatchRow } from './types';

function side(device: string, jackText: string, isExtra: boolean, dir: 'out' | 'in'): string {
  const d = device.trim() || '（機材なし）';
  if (isExtra) {
    const t = jackText.trim();
    return `${d} ${t || dir}（増設）`;
  }
  const t = jackText.trim();
  return t ? `${d} ${dir} [${t}]` : `${d} ${dir}`;
}

/** 1行を矢印表記にする */
export function patchRowLine(row: Pick<TechPatchRow, 'from_device_text' | 'from_jack_text' | 'from_is_extra' | 'to_device_text' | 'to_jack_text' | 'to_is_extra'>): string {
  return `${side(row.from_device_text, row.from_jack_text, row.from_is_extra, 'out')} → ${side(row.to_device_text, row.to_jack_text, row.to_is_extra, 'in')}`;
}

export interface PatchExportGroup {
  label: string;
  lines: string[];
}

/** 系統ごとにまとめる（sort_order 順・系統は最初に出てきた順） */
export function groupPatchRows(rows: TechPatchRow[]): PatchExportGroup[] {
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const groups: PatchExportGroup[] = [];
  for (const r of sorted) {
    let g = groups.find((x) => x.label === r.group_label);
    if (!g) {
      g = { label: r.group_label, lines: [] };
      groups.push(g);
    }
    g.lines.push(patchRowLine(r));
  }
  return groups;
}

/** 紙面・書き出し用のテキスト（〈系統〉見出し＋行） */
export function patchExportText(rows: TechPatchRow[]): string {
  return groupPatchRows(rows)
    .map((g) => [g.label ? `〈${g.label}〉` : '', ...g.lines].filter(Boolean).join('\n'))
    .join('\n\n');
}
