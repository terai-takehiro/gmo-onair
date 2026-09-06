// テロップCG — ⑤依頼フォームの「出したいタイミング」を台本の項目から選ぶダイアログ。
// docs/design/v4/graphics-redesign.md §5⑤・§9-4「依頼の出すタイミングは台本の項目から選べる」（段D・担当1）。
//
// `QsheetImportDialog.tsx` と同じ2段構成（①台本を選ぶ→②台本の項目を選ぶ）だが、
// あちらと違って**何も作成しない**——選んだ行から組み立てた文字列を `onPick(label)` で
// 呼び出し元へ渡すだけで完結する（サーバーへ書き込まないため `committing` 段が無い）。
// ①はそのまま既存の `QsheetImportPickStep`（変更禁止）を再利用する——新しい台本一覧は作らない。
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, FileText, Inbox, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import api from '@/lib/api';
import {
  flattenCues, extractCellText, type Block, type DocumentData, type FlatCue,
} from '../rundown/rundownData';
import type { QsheetDocument } from '../sheets/types';
import QsheetImportPickStep from './QsheetImportPickStep';

/**
 * 項目ラベルの文字数上限。`QsheetImportDialog.tsx` の `NAME_MAX_LENGTH` と同じ考え方
 * （台本の文言をそのまま流し込む先が短い入力欄のため、長い行だけソフトに切り詰める。
 * 同ファイルにならい省略記号は付けない——ハサミを入れた痕跡より、欄に収まる長さのほうを優先する）。
 */
const LABEL_MAX_LENGTH = 50;

type Phase = 'pick' | 'items';

function findBlock(blocks: Block[] | undefined, type: string): Block | undefined {
  return blocks?.find((b) => b.type === type);
}

/**
 * 1キューぶんの表示ラベルを組み立てる。**空のボタンを作らない**ことを最優先し、
 * scenario列 → telop列 → コーナー名 → 機械的な文字列、の順で必ず何か文字を作る。
 */
function buildCueLabel(cue: FlatCue, blocks: Block[] | undefined): string {
  const scenarioBlock = findBlock(blocks, 'scenario');
  let text = scenarioBlock ? extractCellText(cue.row, scenarioBlock).replace(/\s*\n\s*/g, ' ').trim() : '';
  if (!text) {
    const telopBlock = findBlock(blocks, 'telop');
    text = telopBlock ? extractCellText(cue.row, telopBlock).replace(/\s*\n\s*/g, ' ').trim() : '';
  }
  if (!text) text = (cue.sectionLabel || '').trim();
  if (!text) text = `${cue.sectionIdx + 1}コーナー目 ${cue.globalIndex + 1}行目`;
  const truncated = text.length > LABEL_MAX_LENGTH ? text.slice(0, LABEL_MAX_LENGTH) : text;
  return cue.sectionLabel ? `【${cue.sectionLabel}】${truncated}` : truncated;
}

export default function ScriptPositionPickerDialog({
  owner, open, onOpenChange, onPick,
}: {
  owner: { kind: 'project' | 'program'; id: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (label: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>('pick');
  const [doc, setDoc] = useState<QsheetDocument | null>(null);

  const reset = () => { setPhase('pick'); setDoc(null); };
  const close = () => { onOpenChange(false); reset(); };

  const { data: documentData, isLoading, isError } = useQuery({
    queryKey: ['graphics-script-position-document', doc?.id],
    queryFn: async () => {
      const res = await api.get(`/techops/documents/${doc?.id}`);
      const row = res.data.data;
      // 本番3画面（OnAir/Rundown/Prompter）と同じ防御——このエンドポイントは
      // 稀に data 列が JSON 文字列のまま返る（OnAirPage.tsx 等参照）。
      // 万一 data が無い（空）ドキュメントでも `undefined` は返さない
      // （react-query は queryFn が undefined を返すことを許さないため）
      const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      return (parsed ?? { sections: [], blocks: [] }) as DocumentData;
    },
    enabled: phase === 'items' && !!doc,
  });

  const cues = useMemo(() => flattenCues(documentData?.sections), [documentData]);
  const items = useMemo(
    () => cues.map((cue) => ({ cue, label: buildCueLabel(cue, documentData?.blocks) })),
    [cues, documentData],
  );

  const pickDoc = (d: QsheetDocument) => {
    setDoc(d);
    setPhase('items');
  };

  const choose = (label: string) => {
    onPick(label);
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="border-b border-border-faint px-4 py-3 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            台本から選ぶ
          </DialogTitle>
        </DialogHeader>

        {phase === 'pick' && (
          <QsheetImportPickStep owner={owner} onPick={pickDoc} />
        )}

        {phase === 'items' && (
          <div className="p-4 sm:p-6">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
              </div>
            ) : isError ? (
              <EmptyState
                icon={<AlertCircle />}
                title="台本を読み込めませんでした"
                description="少し待ってから、もう一度開き直してください。"
              />
            ) : items.length === 0 ? (
              <EmptyState
                icon={<Inbox />}
                title="この台本には項目がありません"
                description="別の台本を選び直してください。"
              />
            ) : (
              <div className="space-y-2">
                <p className="text-note text-muted-foreground">
                  「{doc?.title || '（無題）'}」・押すと「出したいタイミング」欄にその項目が入ります。
                </p>
                <div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
                  {items.map(({ cue, label }) => (
                    <button
                      key={cue.globalIndex}
                      type="button"
                      onClick={() => choose(label)}
                      className="flex min-h-tap w-full items-start gap-2.5 rounded-control-md border border-border bg-card px-3 py-2.5 text-left hover:bg-surface-subtle"
                    >
                      <span className="min-w-0 flex-1 break-words text-sub">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="border-t border-border-faint px-4 py-3 sm:px-6">
          {phase === 'items' && (
            <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setPhase('pick')}>
              台本を選び直す
            </Button>
          )}
          {phase === 'pick' && (
            <Button type="button" variant="outline" className="min-h-[44px]" onClick={close}>
              <X className="mr-1 h-4 w-4" aria-hidden="true" />キャンセル
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
