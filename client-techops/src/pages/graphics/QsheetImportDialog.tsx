// テロップCG — 進行台本からの一括取り込みダイアログ。
// graphics-redesign.md §9 1〜2（段C。3番「本番で追従」・4番「依頼のタイミング選択」はスコープ外）。
//
// `RosterImportDialog.tsx` と同じ外枠（フェーズ遷移・Dialog/DialogContent/Footer）を手本にしたが、
// Excel特有の列マッピング・dry-runは無く、完了サマリー画面も持たない（成功したらトースト
// 通知だけ出してその場で閉じる）ぶん段数は少ない——
// ①台本を選ぶ（`QsheetImportPickStep`）→ ②取り込む行を確認する（`QsheetImportReviewStep`）→
// ③取り込み実行（成功時は自動で閉じる／失敗時は②へ戻す）、の3段。
//
// サーバー側（担当1・並行作業）の契約は `graphicsQsheetImportApi.ts` 冒頭コメント参照。
// このファイルを書いている時点でサーバー側3本はまだ存在しない——統合時に配線される想定
// （型だけ先に合わせてある）。
import { useState } from 'react';
import { AlertCircle, FileText, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { notifyError, notifySuccess } from '@/lib/notify';
import { PART_DEFAULT_SLOT, type GraphicsPartKey } from '@/lib/graphicsApi';
import {
  commitQsheetImport, previewQsheetImport,
  type QsheetImportCandidate, type QsheetImportItem,
} from '@/lib/graphicsQsheetImportApi';
import type { QsheetDocument } from '../sheets/types';
import { buildDefaultFields } from './pageFields';
import QsheetImportPickStep from './QsheetImportPickStep';
import QsheetImportReviewStep, { type ReviewRow } from './QsheetImportReviewStep';

/** ページ名に流し込む文言の上限（他の一括生成経路には無い制約——台本の文言をそのまま
 *  ページ名にするため、極端に長い行だけソフトに切り詰める。`fields` 側は切り詰めない） */
const NAME_MAX_LENGTH = 300;

/**
 * 取り込み1行ぶんの `fields` を組み立てる。`buildDefaultFields(partKey, text)` は
 * 「部品の**先頭の**入力欄」に text を入れるだけの汎用ヘルパーで、ほとんどの部品は
 * 先頭欄がそのまま主フィールド（`pageFields.ts` の `PRIMARY_FIELD_KEY`）と一致する
 * （title/ticker/flash/side/vote/list はいずれも先頭＝主フィールド）。
 *
 * ⚠️ `name` **だけ**先頭欄（`label`＝任意の「賞名・役割」）と主フィールド
 * （2番目の `mainText`＝氏名）がずれている。先頭欄まかせにすると、台本から取り込んだ
 * 名前が氏名欄に入らないまま「未完成」バッジが付き、「台本と違います」も
 * （`fields.mainText` が空 ⇔ 台本の文言）常に誤検出される——統合確認で実際に
 * 検証DBを叩いて踏んだ不具合。`name` のときだけ主フィールドへ明示的に文言を入れ直す
 * （`buildDefaultFields('name')` を firstFieldValue 無指定で呼び、`label` は空のまま
 * にする——「役割」は台本の文言からは判別できないため、あとから編集で足してもらう）。
 *
 * `name`/`title` 以外（`score`/`ranking`/`list` 等）は `inferPartKey` が提案することは
 * 無いが、確認画面の種類セレクトで手動選択はできる。それらは既存の
 * `buildDefaultFields(partKey, text)` のまま——`score`/`ranking` の主フィールドは
 * 配列型（`entries`）のため、ここで文字列を強制的に代入すると壊れる。
 */
function buildImportFields(partKey: GraphicsPartKey, text: string): Record<string, unknown> {
  if (partKey === 'name') {
    const fields = buildDefaultFields('name');
    fields.mainText = text;
    return fields;
  }
  return buildDefaultFields(partKey, text);
}

type Phase = 'pick' | 'review' | 'committing';

function toReviewRow(c: QsheetImportCandidate): ReviewRow {
  return { ...c, checked: true, partKey: c.suggestedPartKey };
}

export default function QsheetImportDialog({
  projectId, owner, open, onOpenChange, onImported,
}: {
  projectId: string;
  owner: { kind: 'project' | 'program'; id: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('pick');
  const [doc, setDoc] = useState<QsheetDocument | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPhase('pick'); setDoc(null); setDocTitle(''); setRows([]);
    setLoadingPreview(false); setCommitting(false); setError(null);
  };

  const close = () => { onOpenChange(false); reset(); };

  const pickDoc = async (d: QsheetDocument) => {
    setDoc(d);
    setError(null);
    setLoadingPreview(true);
    try {
      const preview = await previewQsheetImport(projectId, d.id);
      setDocTitle(preview.docTitle);
      setRows(preview.candidates.map(toReviewRow));
      setPhase('review');
    } catch {
      setError('台本を読み込めませんでした');
    } finally {
      setLoadingPreview(false);
    }
  };

  const toggleRow = (index: number, checked: boolean) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, checked } : r)));
  };

  const changePartKey = (index: number, partKey: GraphicsPartKey) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, partKey } : r)));
  };

  const checkedCount = rows.filter((r) => r.checked).length;

  const runCommit = async () => {
    if (!doc) return;
    const items: QsheetImportItem[] = rows.filter((r) => r.checked).map((r) => ({
      qsheetRowId: r.qsheetRowId,
      section: r.section,
      slot: PART_DEFAULT_SLOT[r.partKey],
      partKey: r.partKey,
      name: r.text.length > NAME_MAX_LENGTH ? r.text.slice(0, NAME_MAX_LENGTH) : r.text,
      fields: buildImportFields(r.partKey, r.text),
    }));
    if (items.length === 0) return;
    setError(null);
    setCommitting(true);
    setPhase('committing');
    try {
      const created = await commitQsheetImport(projectId, doc.id, items);
      notifySuccess(`${created.length}件のテロップを取り込みました`);
      onImported();
      close();
    } catch {
      notifyError('取り込めませんでした。', { description: '少し待ってから、もう一度お試しください。' });
      setPhase('review');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="border-b border-border-faint px-4 py-3 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            台本から取り込む
          </DialogTitle>
        </DialogHeader>

        {phase === 'pick' && (
          <>
            <QsheetImportPickStep owner={owner} onPick={(d) => void pickDoc(d)} />
            {loadingPreview && (
              <div className="flex items-center justify-center gap-2 pb-4 text-sub text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />読み込み中…
              </div>
            )}
          </>
        )}

        {phase === 'review' && (
          <QsheetImportReviewStep
            docTitle={docTitle}
            rows={rows}
            onToggle={toggleRow}
            onPartKeyChange={changePartKey}
          />
        )}

        {phase === 'committing' && (
          <div className="flex flex-col items-center gap-3 p-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
            <p className="text-sub">取り込んでいます…</p>
          </div>
        )}

        <DialogFooter className="border-t border-border-faint px-4 py-3 sm:px-6">
          {error && (
            <p className="mr-auto flex items-center gap-1.5 text-sub text-destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />{error}
            </p>
          )}
          {phase === 'review' && (
            <>
              <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setPhase('pick')}>
                台本を選び直す
              </Button>
              <Button
                type="button"
                className="min-h-[44px]"
                onClick={() => void runCommit()}
                disabled={committing || checkedCount === 0}
              >
                {checkedCount > 0 ? `取り込む（${checkedCount}件）` : '取り込む行がありません'}
              </Button>
            </>
          )}
          {(phase === 'pick' || phase === 'committing') && (
            <Button type="button" variant="outline" className="min-h-[44px]" onClick={close} disabled={committing}>
              <X className="mr-1 h-4 w-4" aria-hidden="true" />キャンセル
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
