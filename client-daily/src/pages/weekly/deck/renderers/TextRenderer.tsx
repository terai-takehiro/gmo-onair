/**
 * 文・箇条書き・数字（KPI）・チェック／リハ／本番・写真・中身が無い部品 — 資料の中の見た目
 *
 * 文字の大きさは枠に収まるように決める（`fitFont`）。人が上書きした文は赤
 * （`docs/design/v4/keep-report.md` §6.3「変更点は赤字」）。色・書体は `slideStyle.ts` の1か所。
 */
import { useState, type CSSProperties } from 'react';
import { ImageOff } from 'lucide-react';
import { C, bandTitle, emptyBox, overrideColor } from './slideStyle';

interface Box { w: number; h: number }

/** 行の長さと枠から、収まる文字の大きさを探す（大きいほうから下げる） */
export function fitFont(lines: string[], box: Box, max: number, min = 12, lineHeight = 1.5, indent = 0): number {
  for (let fs = max; fs >= min; fs -= 1) {
    const perLine = Math.max(1, Math.floor((box.w - indent) / (fs * 1.02)));
    const total = lines.reduce((n, l) => n + Math.max(1, Math.ceil((l.length || 1) / perLine)), 0);
    if (total * fs * lineHeight <= box.h) return fs;
  }
  return min;
}

export function TextPart({ text, tone, box, override, fontSize }: {
  text: string;
  tone: 'plain' | 'band' | 'confidence' | 'cover' | 'heading';
  box: Box;
  override?: boolean;
  fontSize?: number;
}) {
  const color = override ? overrideColor : undefined;
  if (tone === 'band') {
    return <div style={{ ...bandTitle, fontSize: Math.min(26, box.h * 0.62), ...(override ? { background: C.negative } : {}) }}>{text}</div>;
  }
  if (tone === 'confidence') {
    const [letter, label] = text.split('\n');
    return (
      <div style={{ textAlign: 'center', color: C.negative, fontWeight: 700, lineHeight: 1 }}>
        <div style={{ fontSize: Math.min(40, box.h * 0.55) }}>{letter}</div>
        <div style={{ fontSize: Math.min(15, box.h * 0.22), marginTop: 4 }}>{label}</div>
      </div>
    );
  }
  const lines = text.split('\n');
  if (tone === 'cover') {
    const fs = fontSize ?? fitFont(lines, box, 48, 20, 1.3);
    return <div style={{ fontSize: fs, fontWeight: 700, color: color ?? C.title, lineHeight: 1.3, whiteSpace: 'pre-wrap' }}>{text}</div>;
  }
  if (tone === 'heading') {
    const fs = fontSize ?? fitFont(lines, box, 28, 14, 1.3);
    return <div style={{ fontSize: fs, fontWeight: 700, color: color ?? C.text, lineHeight: 1.3, whiteSpace: 'pre-wrap', overflow: 'hidden' }}>{text}</div>;
  }
  const fs = fontSize ?? fitFont(lines, box, 24, 12, 1.5);
  return (
    <div style={{ fontSize: fs, fontWeight: 700, color: color ?? C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflow: 'hidden', height: '100%' }}>
      {text}
    </div>
  );
}

export function BulletsPart({ items, box, override, fontSize }: { items: string[]; box: Box; override?: boolean; fontSize?: number }) {
  const fs = fontSize ?? fitFont(items, box, 30, 13, 1.55, 30);
  return (
    <ul style={{ margin: 0, paddingLeft: fs * 1.1, fontSize: fs, fontWeight: 700, lineHeight: 1.55, color: override ? overrideColor : C.text, overflow: 'hidden', height: '100%' }}>
      {items.map((it, i) => <li key={i} style={{ whiteSpace: 'pre-wrap' }}>{it}</li>)}
    </ul>
  );
}

export function KpiPart({ items, box, override }: { items: Array<{ label: string; value: string; sub?: string }>; box: Box; override?: boolean }) {
  const valueSize = Math.min(44, box.h * 0.42, (box.w / Math.max(1, items.length)) / 5.5);
  return (
    <div style={{ display: 'flex', gap: 18, height: '100%', alignItems: 'stretch' }}>
      {items.map((it) => (
        <div key={it.label} style={{ flex: 1, minWidth: 0, borderLeft: `4px solid ${C.title}`, paddingLeft: 12, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: Math.max(12, valueSize * 0.38), color: C.muted, fontWeight: 700 }}>{it.label}</div>
          <div style={{ fontSize: valueSize, fontWeight: 700, color: override ? overrideColor : C.title, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{it.value}</div>
          {it.sub && <div style={{ fontSize: Math.max(11, valueSize * 0.32), color: C.muted }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function KeyDatesPart({ items, box }: { items: Array<{ label: string; text: string }>; box: Box }) {
  if (!items.length) return <div style={{ fontSize: 16, color: C.muted }}>チェック／リハ／本番の予定はカレンダーから入ります</div>;
  const fs = Math.max(12, Math.min(22, Math.floor(box.h / (items.length * 1.5))));
  return (
    <div style={{ fontSize: fs, fontWeight: 700, lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden' }}>
      {items.map((it, i) => <div key={i}>{it.label}：{it.text}</div>)}
    </div>
  );
}

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1/internal';

function Photo({ projectId, fileId, caption, style }: { projectId: string | null; fileId: string; caption: string | null; style: CSSProperties }) {
  const [broken, setBroken] = useState(false);
  const src = projectId ? `${API_BASE}/projects/${projectId}/box-files/${fileId}/thumbnail` : null;
  return (
    <div style={{ ...style, position: 'relative', background: C.soft, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {src && !broken
        ? <img src={src} alt={caption ?? ''} onError={() => setBroken(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <ImageOff size={28} color={C.muted} aria-hidden="true" />}
      {caption && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 12, padding: '2px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {caption}
        </div>
      )}
    </div>
  );
}

export function PhotosPart({ projectId, photos, box, thumb }: {
  projectId: string | null;
  photos: Array<{ box_file_id: string; caption: string | null }>;
  box: Box;
  thumb?: boolean;
}) {
  if (!photos.length) {
    return (
      <div style={{ ...emptyBox, fontSize: Math.min(16, box.h / 4) }}>
        {thumb ? null : '写真（案件 Box の 08_写真 から選びます）'}
      </div>
    );
  }
  if (thumb) {
    return <div style={{ width: '100%', height: '100%', background: C.softLine }} />;
  }
  const cols = photos.length === 1 ? 1 : 2;
  const rows = Math.ceil(photos.length / cols);
  const gap = 6;
  const w = (box.w - gap * (cols - 1)) / cols;
  const h = (box.h - gap * (rows - 1)) / rows;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap, width: '100%', height: '100%' }}>
      {photos.map((p) => <Photo key={p.box_file_id} projectId={projectId} fileId={p.box_file_id} caption={p.caption} style={{ width: w, height: h }} />)}
    </div>
  );
}

export function EmptyPart({ reason, thumb, box }: { reason: string; thumb?: boolean; box: Box }) {
  return <div style={{ ...emptyBox, fontSize: Math.max(11, Math.min(16, box.h / 5)) }}>{thumb ? null : reason}</div>;
}
