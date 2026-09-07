/**
 * 隔週キープの数字 — ②案件実施報告（前回の会議日以降に本番を終えた案件）
 *
 * 写真と一言は案件管理の「ふりかえり」（`event_reports`）から。写真の正は案件 Box の
 * `08_写真` で、サムネイルは案件管理の口（`/projects/:id/box-files/:fileId/thumbnail`）を
 * **同じ base URL** で読む（cookie が付くので `<img>` で足りる）。
 * 下書きのふりかえりも出す（資料に載せる前に「まだ下書き」と分かるように印を付ける）。
 */
import { Camera, ImageOff } from 'lucide-react';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import type { ProjectPageData } from '@gmo-onair/shared/src/keepReport/types';
import api from '@/lib/api';
import { SectionHead } from './SectionHead';
import { mdLabel, pctLabel } from './format';

const API_BASE = api.defaults.baseURL ?? '/api/v1/internal';

export function thumbnailUrl(projectId: string, fileId: string): string {
  return `${API_BASE}/projects/${projectId}/box-files/${fileId}/thumbnail`;
}

function PhotoStrip({ page }: { page: ProjectPageData }) {
  const photos = page.photos.slice(0, 3);
  if (photos.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center gap-2 bg-muted text-muted-foreground">
        <ImageOff className="h-5 w-5" aria-hidden="true" />
        <span className="text-sub-sm">写真はまだありません（案件 Box の 08_写真）</span>
      </div>
    );
  }
  return (
    <div className="flex h-24 gap-1 bg-muted">
      {photos.map((p) => (
        <div key={p.box_file_id} className="flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-secondary">
          <img
            src={thumbnailUrl(page.project_id, p.box_file_id)}
            alt={p.caption ?? ''}
            loading="lazy"
            className="h-full w-full object-cover"
            // サムネイルが出せない（変換中・BOX 未接続）ときは枠だけ残す。500 にしないのはサーバー側と同じ考え
            onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
          />
        </div>
      ))}
    </div>
  );
}

function ReportCard({ page }: { page: ProjectPageData }) {
  const text = page.headline ?? page.highlights[0] ?? page.summary_lines[0] ?? null;
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-card">
      <PhotoStrip page={page} />
      <div className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-number text-sub-sm font-bold text-muted-foreground">{page.band.date_label || '—'}</span>
          {page.report_status === 'confirmed'
            ? <TableBadge label="確定" w={null} className="border-success-border bg-success-surface text-success" />
            : page.report_status === 'draft'
              ? <TableBadge label="下書き" w={null} className="border-warning-border bg-warning-surface text-warning" />
              : <TableBadge label="未記入" w={null} className="bg-muted text-muted-foreground" />}
        </div>
        <a href={`/sales/projects/${page.project_id}/review`} className="text-list hover:underline">{page.band.event_name}</a>
        <span className="text-sub-sm text-muted-foreground">{page.band.customer_short}</span>
        {text
          ? <p className="text-sub line-clamp-3 text-foreground">{text}</p>
          : <p className="text-sub text-muted-foreground">ふりかえりの総括はまだ書かれていません</p>}
        <div className="flex items-center gap-4 border-t border-border-faint pt-2">
          <span className="flex flex-col gap-0.5">
            <span className="text-sub-sm text-muted-foreground">売上</span>
            {page.revenue === null
              ? <span className="text-sub text-muted-foreground">未登録</span>
              : <Money value={page.revenue} inline className="text-list" />}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-sub-sm text-muted-foreground">粗利</span>
            {page.gross_profit === null
              ? <span className="text-sub text-muted-foreground">未登録</span>
              : (
                <span className="flex items-baseline gap-1.5">
                  <Money value={page.gross_profit} inline className="text-list" negativeIsDanger />
                  {page.gross_margin !== null && (
                    <span className={`font-number text-sub-sm font-bold ${page.gross_margin < 30 ? 'text-destructive' : 'text-success'}`}>
                      {pctLabel(page.gross_margin)}
                    </span>
                  )}
                </span>
              )}
          </span>
        </div>
      </div>
    </div>
  );
}

export function EventReportCards({ reports, previousMeeting }: { reports: ProjectPageData[]; previousMeeting: string | null }) {
  const unwritten = reports.filter((r) => r.report_status === null).length;
  return (
    <div className="flex flex-col gap-3">
      <SectionHead
        icon={Camera}
        title="案件実施報告"
        note={`本番を終えた案件${previousMeeting ? `（${mdLabel(previousMeeting)} の会議より後）` : ''}。写真と一言は案件管理の「ふりかえり」から`}
        right={unwritten > 0 ? (
          <span className="text-sub-sm whitespace-nowrap font-bold text-warning">ふりかえりが未記入の案件 {unwritten}件</span>
        ) : undefined}
      />
      {reports.length === 0 ? (
        <p className="text-sub text-muted-foreground">前回の会議のあとに本番を終えた案件はまだありません</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((r) => <ReportCard key={r.project_id} page={r} />)}
        </div>
      )}
    </div>
  );
}
