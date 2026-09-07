/**
 * 文・箇条書き・数字（KPI）・チェック／リハ／本番・写真・中身が無い部品 — 資料の中の見た目
 *
 * 文字の大きさは枠に収まるように決める（`fitFont`）。人が上書きした文は赤
 * （`docs/design/v4/keep-report.md` §6.3「変更点は赤字」）。色・書体は `slideStyle.ts` の1か所。
 */
import { useState, type CSSProperties } from 'react';
import { ImageOff } from 'lucide-react';
import { FORMAT_FONT } from '@gmo-onair/shared/src/keepReport/templates';
import { C, bandTitle, emptyBox, fitPx, overrideColor, pt, toInch, type TextTone } from './slideStyle';

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

/** 枠いっぱいに置いて上下左右の中央に寄せる（表紙の会議名・部署名と日付・青い箱） */
const centered: CSSProperties = {
  width: '100%', height: '100%', boxSizing: 'border-box', padding: '0 5px', display: 'flex', alignItems: 'center',
  justifyContent: 'center', textAlign: 'center', whiteSpace: 'pre-wrap', overflow: 'hidden',
};

export function TextPart({ text, tone, box, override, fontSize }: {
  text: string;
  tone: TextTone;
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
  // 実物の表紙: 会議名 72pt 太字・黒・中央（長い名前は幅に収まるまで小さく）／部署名と日付 40pt 中央／
  // 青い箱 24pt 白／注意書き 20pt 左。Appendix は 54pt の青。pptx（keep-pptx.service.ts の textStyle）と同じ値
  if (tone === 'cover') {
    const fs = fontSize ?? fitPx(text, FORMAT_FONT.coverTitle, toInch(box.w));
    return <div style={{ ...centered, fontSize: fs, fontWeight: 700, color: color ?? C.text, lineHeight: 1.1 }}>{text}</div>;
  }
  if (tone === 'cover-sub') {
    const fs = fontSize ?? fitFont(lines, box, pt(FORMAT_FONT.coverSub), 16, 1.2);
    return <div style={{ ...centered, fontSize: fs, color: color ?? C.text, lineHeight: 1.2 }}>{text}</div>;
  }
  if (tone === 'cover-note') {
    const fs = fontSize ?? fitFont(lines, box, pt(FORMAT_FONT.coverNote), 12, 1.35);
    return <div style={{ ...centered, fontSize: fs, color: color ?? '#fff', background: C.title, lineHeight: 1.35 }}>{text}</div>;
  }
  if (tone === 'cover-guide') {
    const fs = fontSize ?? fitFont(lines, box, pt(FORMAT_FONT.coverGuide), 12, 1.2);
    return <div style={{ ...centered, justifyContent: 'flex-start', textAlign: 'left', fontSize: fs, color: color ?? C.text, lineHeight: 1.2 }}>{text}</div>;
  }
  if (tone === 'appendix') {
    return <div style={{ fontSize: fontSize ?? pt(FORMAT_FONT.appendix), color: color ?? C.positive, lineHeight: 1.2, whiteSpace: 'pre-wrap', overflow: 'hidden', padding: 5 }}>{text}</div>;
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

/**
 * 帯（1行。太字＋大きめの本文 ＋ 細め＋小さめの副文 ／ 右端に丸バッジ）。
 * pptx 側の `renderInfoBand` と同じ部品を、案件ページの帯（`BandPart`）と
 * 内覧会サマリの帯（`InviewSummaryPart`）で共有する。収まらない文字は省略記号で切る
 */
export function InfoBand({ main, sub, pill, box }: { main: string; sub: string; pill?: string | null; box: Box }) {
  return (
    <div style={{
      width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: 3, background: C.band,
      display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', overflow: 'hidden',
    }}
    >
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        <span style={{ fontSize: Math.min(20, box.h * 0.42), fontWeight: 700, color: '#fff' }}>{main}</span>
        <span style={{ fontSize: Math.min(14, box.h * 0.3), color: C.talkBlue, marginLeft: 10 }}>{sub}</span>
      </div>
      {pill && (
        <span style={{
          flexShrink: 0, borderRadius: 999, border: '1px solid rgba(255,255,255,.65)', background: 'rgba(255,255,255,.18)',
          color: '#fff', fontWeight: 700, fontSize: Math.min(13, box.h * 0.28), padding: '4px 12px', whiteSpace: 'nowrap',
        }}
        >
          {pill}
        </span>
      )}
    </div>
  );
}

/**
 * 数字カード（横並び。ラベル小さく上・太字の大きい数字が下）。カード間は薄い縦線1本で仕切り、
 * 四角く囲む罫線は引かない。pptx 側の `renderStatRow` に対応する部品を、売上／粗利／粗利率
 * （`MoneyTable`）と内覧会サマリ（`InviewSummaryPart`）で共有する
 */
export function StatRow({ items, box }: { items: Array<{ label: string; value: string; accent?: boolean }>; box: Box }) {
  if (items.length === 0) return null;
  const valueSize = Math.max(14, Math.min(26, box.h * 0.4, (box.w / items.length) / 4));
  return (
    <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'stretch' }}>
      {items.map((it, i) => (
        <div
          key={it.label}
          style={{
            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4,
            padding: '0 16px', borderLeft: i > 0 ? `1px solid ${C.softLine}` : undefined,
          }}
        >
          <div style={{ fontSize: Math.max(11, valueSize * 0.42), color: C.muted, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</div>
          <div style={{
            fontSize: valueSize, fontWeight: 700, color: it.accent ? C.positive : C.title, lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
          >
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 帯（案件ページ・実施報告）。`Resolved.kind === 'band'` を描く。①などの通し番号は pptx 側と同じく出さない */
export function BandPart({ event, customer, date, confidenceLetter, confidenceLabel, box }: {
  event: string;
  customer: string;
  date: string;
  confidenceLetter: string | null;
  confidenceLabel: string | null;
  box: Box;
}) {
  return (
    <InfoBand
      main={event}
      sub={`${customer} ／ ${date}`}
      pill={confidenceLetter ? `${confidenceLetter}・${confidenceLabel ?? ''}` : null}
      box={box}
    />
  );
}

/**
 * 総括（薄い水色地＋「総括」バッジ＋太字）＋ 成果のチェック箇条書き。`Resolved.kind === 'highlights'` を描く。
 * `headline` があれば箱の上30%程度をカードに、無ければチェック箇条書きが箱いっぱいを使う
 */
export function HighlightsPart({ headline, items, box, override }: { headline: string | null; items: string[]; box: Box; override?: boolean }) {
  const gap = 10;
  const headlineH = headline ? Math.min(box.h * 0.32, 90) : 0;
  const listH = Math.max(0, box.h - (headline ? headlineH + gap : 0));
  const fs = items.length ? fitFont(items, { w: box.w, h: listH }, 22, 13, 1.55, 26) : 13;
  return (
    <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap }}>
      {headline && (
        <div style={{
          height: headlineH, boxSizing: 'border-box', borderRadius: 3, background: C.positiveLight,
          padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden',
        }}
        >
          <span style={{
            alignSelf: 'flex-start', borderRadius: 999, background: C.band, color: '#fff', fontWeight: 700,
            fontSize: 11, lineHeight: 1.4, padding: '2px 10px',
          }}
          >
            総括
          </span>
          <div style={{ fontSize: Math.min(16, headlineH * 0.24), fontWeight: 700, color: C.title, lineHeight: 1.3, overflow: 'hidden' }}>{headline}</div>
        </div>
      )}
      {items.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', flex: 1, minHeight: 0, overflow: 'hidden', fontSize: fs, lineHeight: 1.55, fontWeight: 700, color: override ? overrideColor : C.text }}>
          {items.map((it, i) => (
            <li key={i} style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: C.positive, flexShrink: 0 }}>✓</span>
              <span style={{ whiteSpace: 'pre-wrap' }}>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 内覧会サマリ（`inview.summary`）。帯（「定期内覧会」＋開催日。次回開催日があれば右にバッジ）＋
 * 数字カード3枚（来場組数／来場人数／分類数）を縦に並べる。帯・数字カードは `BandPart` /
 * `MoneyTable` と同じ `InfoBand` / `StatRow` を再利用する（3種類バラバラのデザインにしない）
 */
export function InviewSummaryPart({ sessionDate, groups, people, categoryCount, nextSessionDate, box }: {
  sessionDate: string;
  groups: number;
  people: number;
  categoryCount: number;
  nextSessionDate: string | null;
  box: Box;
}) {
  const gap = 10;
  const bandH = Math.min(box.h * 0.34, 76);
  const statBox = { w: box.w, h: Math.max(0, box.h - bandH - gap) };
  return (
    <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap }}>
      <div style={{ height: bandH }}>
        <InfoBand main="定期内覧会" sub={`${sessionDate}開催`} pill={nextSessionDate ? `次回 ${nextSessionDate}` : null} box={{ w: box.w, h: bandH }} />
      </div>
      <div style={{ height: statBox.h }}>
        <StatRow
          items={[
            { label: '来場組数', value: `${groups}組` },
            { label: '来場人数', value: `${people}名` },
            { label: '分類数', value: `${categoryCount}`, accent: true },
          ]}
          box={statBox}
        />
      </div>
    </div>
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
