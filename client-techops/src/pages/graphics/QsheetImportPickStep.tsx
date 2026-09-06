// テロップCG — 台本からの取り込みダイアログの①「台本を選ぶ」段。
// `QsheetImportDialog.tsx` から切り出した（ファイルサイズ規律・400行）。
//
// 一覧の絞り込みは `SheetListPage.tsx` と同じ `GET /techops/documents` を
// project_id／program_id のどちらか一方だけで絞る呼び方をそのまま真似ている
// （owner.kind に応じて出し分ける。アクセス制御自体は既存のこのエンドポイントに任せる）。
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, FileText, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { fmtDate, type QsheetDocument } from '../sheets/types';

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function QsheetImportPickStep({
  owner, onPick,
}: {
  owner: { kind: 'project' | 'program'; id: string };
  onPick: (doc: QsheetDocument) => void;
}) {
  const { data: documents, isLoading, isError } = useQuery({
    queryKey: ['graphics-qsheet-import-documents', owner.kind, owner.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (owner.kind === 'project') params.set('project_id', owner.id);
      else params.set('program_id', owner.id);
      const res = await api.get(`/techops/documents?${params}`);
      return res.data.data as QsheetDocument[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          icon={<AlertCircle />}
          title="台本の一覧を取得できませんでした"
          description="少し待ってから、もう一度開き直してください。"
        />
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          icon={<FileText />}
          title={`この${owner.kind === 'project' ? '案件' : '番組'}の台本がまだありません`}
          description="先に進行台本を作成してから、もう一度お試しください。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4 sm:p-6">
      <p className="text-sub text-muted-foreground">テロップの文言を取り込む台本を選んでください。</p>
      <div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
        {documents.map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => onPick(doc)}
            className="flex min-h-tap w-full items-start gap-2.5 rounded-control-md border border-border bg-card px-3 py-2.5 text-left hover:bg-surface-subtle"
          >
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sub font-bold">{doc.title || '（無題）'}</span>
              <span className="block text-note text-muted-foreground">
                更新 {fmtDateTime(doc.updated_at)}
                {doc.broadcast_date && ` ・ 放送 ${fmtDate(doc.broadcast_date)}`}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
