/**
 * 「資料をつくる」の見出し — 会議日・構成の出どころ・ページ数・人が直した数・保存の状態・4つのボタン
 *
 * 主アクションは「PowerPoint に出力」（`PageHeader` の `primaryAction`）。
 * 「数字を更新」は週報の確定で凍結した数字を読んでいるときは押せない（凍結版は書き換えない約束）。
 */
import { Columns2, Download, Eye, RefreshCw } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { Button } from '@/components/ui/button';
import { formatMeetingDate, shortMd } from './deckLabels';
import type { SaveStatus } from './deckState';

export interface DeckHeaderProps {
  meeting: string | null;
  onChangeMeeting: (iso: string) => void;
  previousMeetingDate: string | null;
  pageCount: number;
  editCount: number;
  saveStatus: SaveStatus;
  savedAt: string | null;
  dirty: boolean;
  onSaveNow: () => void;
  onCompare: () => void;
  onPreview: () => void;
  onRebuild: () => void;
  rebuilding: boolean;
  packFrozen: boolean;
  onExport: () => void;
  exporting: boolean;
  ready: boolean;
}

function SaveState({ status, savedAt, dirty, onSaveNow }: Pick<DeckHeaderProps, 'savedAt' | 'dirty' | 'onSaveNow'> & { status: SaveStatus }) {
  const time = savedAt ? new Date(savedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
  if (status === 'saving') return <span className="text-sub-sm text-muted-foreground" aria-live="polite">保存中…</span>;
  if (status === 'error') {
    return (
      <span className="text-sub-sm inline-flex items-center gap-2 text-destructive" aria-live="polite">
        保存できませんでした
        <button type="button" onClick={onSaveNow} className="text-badge h-8 rounded-control-md border border-destructive-border bg-destructive-surface px-2 text-destructive hover:bg-card">もう一度保存</button>
      </span>
    );
  }
  if (dirty) return <span className="text-sub-sm text-warning" aria-live="polite">未保存の変更（1.5秒後に自動で保存）</span>;
  if (status === 'saved') return <span className="text-sub-sm text-success" aria-live="polite">保存済み <span className="font-number">{time}</span></span>;
  return <span className="text-sub-sm text-muted-foreground">自動で保存します</span>;
}

export function DeckHeader(p: DeckHeaderProps) {
  const sub = p.meeting
    ? `隔週キープ ${formatMeetingDate(p.meeting)} ・ ${p.previousMeetingDate ? `前回（${shortMd(p.previousMeetingDate)}）の構成から自動で組みました` : '標準の構成から自動で組みました'} ・ 全 ${p.pageCount} ページ ・ 人が直した ${p.editCount} か所`
    : '会議日を決めています…';
  return (
    <PageHeader
      title="資料をつくる"
      sub={sub}
      primaryAction={(
        <Button type="button" onClick={p.onExport} disabled={!p.ready || p.exporting}>
          <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />{p.exporting ? '出力中…' : 'PowerPoint に出力'}
        </Button>
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sub-sm inline-flex items-center gap-1.5 text-muted-foreground">
          会議日
          <input
            type="date"
            value={p.meeting ?? ''}
            onChange={(e) => { if (e.target.value) p.onChangeMeeting(e.target.value); }}
            aria-label="会議日"
            className="text-sub h-9 rounded-control border border-border bg-background px-2 text-foreground"
          />
        </label>
        <SaveState status={p.saveStatus} savedAt={p.savedAt} dirty={p.dirty} onSaveNow={p.onSaveNow} />
        <span className="hidden w-px self-stretch bg-border lg:block" aria-hidden="true" />
        <Button type="button" variant="outline" size="sm" onClick={p.onCompare} disabled={!p.ready}>
          <Columns2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />前回の資料と見比べる
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={p.onPreview} disabled={!p.ready}>
          <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />通しで見る
        </Button>
        <Button
          type="button" variant="outline" size="sm" onClick={p.onRebuild}
          disabled={!p.ready || p.rebuilding || p.packFrozen}
          title={p.packFrozen ? '週報を確定した時点の数字で凍結しています。数字を直すときは元のデータを直して凍結し直します' : 'いまの ONAiR の数字で自動ページを組み直します（人が直した箇所は残ります）'}
          className={cn(p.packFrozen && 'opacity-60')}
        >
          <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', p.rebuilding && 'animate-spin')} aria-hidden="true" />{p.packFrozen ? '数字は凍結済み' : '数字を更新'}
        </Button>
      </div>
    </PageHeader>
  );
}
