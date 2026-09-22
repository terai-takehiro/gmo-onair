// 技術資料 ②映像パッチ — 表に出す値の組み立て（純粋関数・設計: docs/design/v4/tech-docs.md §4-2〜§4-4）。
// 画面の部品（PatchTable / PatchRow / DevicePicker / JackPicker / PatchRowExtras）が
// 共通で使う計算をここに寄せる（1ファイル 400 行の上限に収めるため）。
import { patchNo } from "@gmo-onair/shared/src/tech/patchNo";
import type {
  PatchDeviceOption,
  PatchJackRow,
  PatchPanelKind,
  PatchPanelListItem,
  TechPatchRow,
} from "@gmo-onair/shared/src/tech/types";

/** パッチ番号1つ分の見出しに要る値（盤の名前を含む） */
export interface JackInfo {
  id: string;
  panelId: string;
  panelName: string;
  jackNo: number;
  jackRow: PatchJackRow;
  /** 組み立てたパッチ番号（`216B` / `TRK12`） */
  no: string;
  /** 盤に転記された名称（行の「名称」の初期値になる） */
  label: string;
  signal: string;
  deviceName: string;
  area: string;
}

export type PanelKinds = Map<string, PatchPanelKind>;

/** 盤ごとの種別。TRK 盤（`trunk`）はパッチ番号に段（A／B）が付かない */
export function panelKindsOf(panels: PatchPanelListItem[] | undefined): PanelKinds {
  const map: PanelKinds = new Map();
  for (const p of panels ?? []) map.set(p.id, p.kind);
  return map;
}

/** 機材の候補から「パッチ番号の id → 中身」の索引を作る */
export function buildJackIndex(devices: PatchDeviceOption[] | undefined, kinds: PanelKinds): Map<string, JackInfo> {
  const index = new Map<string, JackInfo>();
  for (const d of devices ?? []) {
    for (const j of d.jacks) {
      index.set(j.id, {
        id: j.id,
        panelId: j.panel_id,
        panelName: j.panel_name,
        jackNo: j.jack_no,
        jackRow: j.jack_row,
        no: patchNo(j.panel_name, j.jack_no, j.jack_row, kinds.get(j.panel_id) ?? "jack"),
        label: j.label,
        signal: j.signal,
        deviceName: d.device_name,
        area: d.area,
      });
    }
  }
  return index;
}

/** 候補に出す機材の副題（`3G-SDI ・ 3ch ・ 101A`） */
export function deviceSubLabel(device: PatchDeviceOption, kinds: PanelKinds): string {
  const signal = device.jacks.find((j) => j.signal.trim())?.signal.trim() ?? "";
  const first = device.jacks[0];
  const firstNo = first ? patchNo(first.panel_name, first.jack_no, first.jack_row, kinds.get(first.panel_id) ?? "jack") : "";
  return [signal, `${device.jacks.length}ch`, firstNo].filter(Boolean).join(" ・ ");
}

export interface DeviceGroup {
  area: string;
  items: PatchDeviceOption[];
}

/** 検索語で絞り、設置場所ごとにまとめる（場所は最初に出てきた順） */
export function groupDevices(devices: PatchDeviceOption[] | undefined, query: string): DeviceGroup[] {
  const q = query.trim().toLowerCase();
  const groups: DeviceGroup[] = [];
  for (const d of devices ?? []) {
    if (q && !d.device_name.toLowerCase().includes(q) && !d.area.toLowerCase().includes(q)) continue;
    const area = d.area.trim() || "そのほか";
    let g = groups.find((x) => x.area === area);
    if (!g) {
      g = { area, items: [] };
      groups.push(g);
    }
    g.items.push(d);
  }
  return groups;
}

export interface JackChoice extends JackInfo {
  /** この資料の別の行が既に使っている */
  busy: boolean;
  /** 使っている行の名称（無ければ機材名） */
  busyBy: string;
}

/** 機材に立ち上がっているパッチ番号の候補。空きが先・使用中はあとに回す */
export function jackChoicesFor(
  device: PatchDeviceOption | undefined,
  kinds: PanelKinds,
  rows: TechPatchRow[],
  currentRowId: string,
): JackChoice[] {
  if (!device) return [];
  const used = new Map<string, string>();
  for (const r of rows) {
    if (r.id === currentRowId) continue;
    const name = r.label.trim() || r.from_device_text.trim() || r.to_device_text.trim();
    if (r.from_jack_id) used.set(r.from_jack_id, name);
    if (r.to_jack_id) used.set(r.to_jack_id, name);
  }
  const list: JackChoice[] = device.jacks.map((j) => ({
    id: j.id,
    panelId: j.panel_id,
    panelName: j.panel_name,
    jackNo: j.jack_no,
    jackRow: j.jack_row,
    no: patchNo(j.panel_name, j.jack_no, j.jack_row, kinds.get(j.panel_id) ?? "jack"),
    label: j.label,
    signal: j.signal,
    deviceName: device.device_name,
    area: device.area,
    busy: used.has(j.id),
    busyBy: used.get(j.id) ?? "",
  }));
  return list.sort((a, b) => {
    if (a.busy !== b.busy) return a.busy ? 1 : -1;
    if (a.panelName !== b.panelName) return a.panelName.localeCompare(b.panelName);
    if (a.jackNo !== b.jackNo) return a.jackNo - b.jackNo;
    return a.jackRow.localeCompare(b.jackRow);
  });
}

export interface PatchGroup {
  label: string;
  rows: TechPatchRow[];
}

/** 系統ごとにまとめる（行は sort_order 順・系統は最初に出てきた順） */
export function groupRowsByLabel(rows: TechPatchRow[]): PatchGroup[] {
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const groups: PatchGroup[] = [];
  for (const r of sorted) {
    let g = groups.find((x) => x.label === r.group_label);
    if (!g) {
      g = { label: r.group_label, rows: [] };
      groups.push(g);
    }
    g.rows.push(r);
  }
  return groups;
}

export interface ExtraDevice {
  name: string;
  /** その機材が出てくる系統（重複なし） */
  groups: string[];
  outCount: number;
  inCount: number;
}

/** この資料で手入力した増設機材（名前ごとにまとめる） */
export function extraDevicesOf(rows: TechPatchRow[]): ExtraDevice[] {
  const map = new Map<string, ExtraDevice>();
  const put = (name: string, group: string, dir: "out" | "in") => {
    const key = name.trim();
    if (!key) return;
    let e = map.get(key);
    if (!e) {
      e = { name: key, groups: [], outCount: 0, inCount: 0 };
      map.set(key, e);
    }
    if (group.trim() && !e.groups.includes(group.trim())) e.groups.push(group.trim());
    if (dir === "out") e.outCount += 1;
    else e.inCount += 1;
  };
  for (const r of [...rows].sort((a, b) => a.sort_order - b.sort_order)) {
    if (r.from_is_extra) put(r.from_device_text, r.group_label, "out");
    if (r.to_is_extra) put(r.to_device_text, r.group_label, "in");
  }
  return [...map.values()];
}

export interface PatchNoStats {
  /** この資料が使っているパッチ番号の数（重複なし） */
  total: number;
  /** そのうち、相手が増設機材のもの */
  toExtra: number;
  byPanel: Array<{ panelName: string; count: number }>;
}

/** 「この資料で使うパッチ番号」の集計 */
export function patchNoStatsOf(rows: TechPatchRow[], index: Map<string, JackInfo>): PatchNoStats {
  const seen = new Map<string, { panelName: string; toExtra: boolean }>();
  const mark = (jackId: string | null, otherIsExtra: boolean, panelHint: string) => {
    if (!jackId) return;
    const info = index.get(jackId);
    const panelName = info?.panelName || panelHint || "そのほか";
    const prev = seen.get(jackId);
    if (prev) prev.toExtra = prev.toExtra || otherIsExtra;
    else seen.set(jackId, { panelName, toExtra: otherIsExtra });
  };
  for (const r of rows) {
    mark(r.from_jack_id, r.to_is_extra, "");
    mark(r.to_jack_id, r.from_is_extra, "");
  }
  const byPanel: Array<{ panelName: string; count: number }> = [];
  let toExtra = 0;
  for (const v of seen.values()) {
    if (v.toExtra) toExtra += 1;
    const hit = byPanel.find((p) => p.panelName === v.panelName);
    if (hit) hit.count += 1;
    else byPanel.push({ panelName: v.panelName, count: 1 });
  }
  byPanel.sort((a, b) => b.count - a.count || a.panelName.localeCompare(b.panelName));
  return { total: seen.size, toExtra, byPanel };
}

/** 「系統 3」のように、まだ無い名前を作る */
export function nextGroupLabel(rows: TechPatchRow[]): string {
  const labels = new Set(rows.map((r) => r.group_label));
  for (let n = labels.size + 1; n < labels.size + 60; n += 1) {
    const name = `系統 ${n}`;
    if (!labels.has(name)) return name;
  }
  return "系統";
}

/**
 * 行を1つ上／下へ動かしたあとの id の列。動かせないときは null。
 *
 * 入れ替える相手は**同じ系統の隣の行**にする。全体の隣と入れ替えると、
 * 系統の見出しをまたいだときに画面上は何も動かない（表示は系統ごとにまとめ直すため）。
 */
export function movedOrder(rows: TechPatchRow[], id: string, dir: -1 | 1): string[] | null {
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const at = sorted.findIndex((r) => r.id === id);
  if (at < 0) return null;
  const label = sorted[at].group_label;
  let to = -1;
  for (let i = at + dir; i >= 0 && i < sorted.length; i += dir) {
    if (sorted[i].group_label === label) {
      to = i;
      break;
    }
  }
  if (to < 0) return null;
  const next = [...sorted];
  [next[at], next[to]] = [next[to], next[at]];
  return next.map((r) => r.id);
}
