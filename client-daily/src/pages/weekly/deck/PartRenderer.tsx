/**
 * 部品1つを描く — `binding` を解いて、種類ごとの描き手（`renderers/`）へ渡す
 *
 * 人の上書き（`text_override`）は binding より優先する（`SlidePart` の約束）。
 * 上書きの書き方は種類で違う: 文＝そのまま／箇条書き＝1行1項目／表＝タブ区切り（1行目が見出し）／
 * 写真＝Box の file id を1行に1つ。
 */
import { useDeckStore } from './deckState';
import { useMemo } from 'react';
import type { KeepDeck, KeepReportPack, SlidePage, SlidePart } from '@gmo-onair/shared/src/keepReport/types';
import { hasOverride } from './deckLabels';
import { resolveBinding } from './renderers/binding';
import { SLIDE_H, SLIDE_W } from './renderers/slideStyle';
import { MoneyTable, PipelineTable, PlByEntity, PlTable, SlideTable, parseTsv } from './renderers/TableRenderer';
import { TrendChart } from './renderers/ChartRenderer';
import { CalendarPart } from './renderers/CalendarRenderer';
import { BulletsPart, EmptyPart, KeyDatesPart, KpiPart, PhotosPart, TextPart } from './renderers/TextRenderer';

export interface PartRendererProps {
  pack: KeepReportPack | null;
  page: SlidePage;
  part: SlidePart;
  /** アジェンダ（`$agenda`）だけが読む。ほかのページには渡さなくてよい */
  deck?: KeepDeck | null;
  meeting?: string | null;
  /** 一覧のサムネイル（64×36）。文字の案内を出さない */
  thumb?: boolean;
}

const lines = (s: string) => s.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '');
const fileIds = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? lines(v) : []);

export function PartRenderer({ pack, page, part, deck, meeting, thumb }: PartRendererProps) {
  const box = { w: (part.w / 100) * SLIDE_W, h: (part.h / 100) * SLIDE_H };
  const inputs = useDeckStore((st) => st.inputs);
  const resolved = useMemo(() => resolveBinding(pack, page, part, { deck, meeting, inputs }), [pack, page, part, deck, meeting, inputs]);
  const fontSize = typeof part.options?.font_size === 'number' ? (part.options.font_size as number) : undefined;
  const projectId = (part.options?.project_id as string | undefined)
    ?? (resolved.kind === 'photos' ? resolved.projectId : null) ?? null;

  if (hasOverride(part)) {
    const text = part.text_override as string;
    switch (part.type) {
      case 'bullets':
        return <BulletsPart items={lines(text)} box={box} override fontSize={fontSize} />;
      case 'table': {
        const t = parseTsv(text);
        return <SlideTable head={t.head} rows={t.rows} box={box} overrideRed />;
      }
      case 'photos':
        return <PhotosPart projectId={projectId} photos={lines(text).map((id) => ({ box_file_id: id.trim(), caption: null }))} box={box} thumb={thumb} />;
      case 'kpi':
        return <KpiPart items={lines(text).map((l) => { const [label, value] = l.split(/[:：]/); return { label: label ?? '', value: value ?? '' }; })} box={box} override />;
      default:
        return <TextPart text={text} tone={resolved.kind === 'text' ? resolved.tone : 'plain'} box={box} override fontSize={fontSize} />;
    }
  }

  switch (resolved.kind) {
    case 'pl':
      return <PlTable table={resolved.table} mode={resolved.mode} box={box} />;
    case 'pl_by_entity':
      return <PlByEntity tables={resolved.tables} mode={resolved.mode} box={box} />;
    case 'pipeline':
      return <PipelineTable rows={resolved.rows} box={box} />;
    case 'trend':
      return <TrendChart metric={resolved.metric} points={resolved.points} box={box} />;
    case 'calendar':
      return <CalendarPart calendar={resolved.calendar} box={box} />;
    case 'text':
      return <TextPart text={resolved.text} tone={resolved.tone} box={box} fontSize={fontSize} />;
    case 'bullets':
      return <BulletsPart items={resolved.items} box={box} fontSize={fontSize} />;
    case 'table':
      return <SlideTable head={resolved.head} rows={resolved.rows} align={resolved.align} box={box} />;
    case 'money':
      return <MoneyTable revenue={resolved.revenue} gross={resolved.gross} margin={resolved.margin} box={box} />;
    case 'key_dates':
      return <KeyDatesPart items={resolved.items} box={box} />;
    case 'photos':
      return <PhotosPart projectId={resolved.projectId} photos={resolved.photos} box={box} thumb={thumb} />;
    case 'kpi':
      return <KpiPart items={resolved.items} box={box} />;
    case 'empty':
      return <EmptyPart reason={resolved.reason} box={box} thumb={thumb} />;
    case 'manual':
      break;
  }

  // binding が無い部品（人が置いたもの）。中身は上書き欄と options に持つ
  switch (part.type) {
    case 'photos': {
      const ids = fileIds(part.options?.box_file_ids);
      return <PhotosPart projectId={projectId} photos={ids.map((id) => ({ box_file_id: id, caption: null }))} box={box} thumb={thumb} />;
    }
    case 'table': {
      const rows = typeof part.options?.rows === 'string' ? parseTsv(part.options.rows as string) : { head: ['', '', ''], rows: [['', '', ''], ['', '', '']] };
      return <SlideTable head={rows.head} rows={rows.rows} box={box} />;
    }
    case 'image':
      return <EmptyPart reason="画像（前回の資料から写すページ。pptx 出力のときに前回の版から取ります）" box={box} thumb={thumb} />;
    case 'chart':
      return <EmptyPart reason="グラフ（右の「部品」から売上高・稼働率を置きます）" box={box} thumb={thumb} />;
    case 'calendar':
      return <EmptyPart reason="カレンダー（右の「部品」から月を置きます）" box={box} thumb={thumb} />;
    case 'kpi':
      return <EmptyPart reason="数字（右の「このページ」で「ラベル：値」を1行ずつ）" box={box} thumb={thumb} />;
    case 'bullets':
      return <EmptyPart reason="箇条書き（右の「このページ」で1行1項目）" box={box} thumb={thumb} />;
    default:
      return <EmptyPart reason="文（右の「このページ」で入れます）" box={box} thumb={thumb} />;
  }
}
