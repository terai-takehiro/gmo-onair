/**
 * 編集画面の上の1行（戻る・題名・保存の状態・公開する・プレビューの開閉）
 *
 * ⚠️ **ここに `☰` を置かない。** ツリーは共通の左メニューの中にあり、スマホでは
 *    上辺バーの `☰` から開きます（`client-wiki/CLAUDE.md`「ナビの列は1本だけ」）。
 *
 * 題名は `BufferedInput`（日本語入力を壊さない欄）。本文と同じく、保存の応答で
 * 値を書き戻しません。
 */
import { AlertCircle, ArrowLeft, Check, Columns2, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import type { WikiPageStatus } from '@gmo-onair/shared/src/wiki/types';
import WikiStatusBadge from '@/components/wiki/WikiStatusBadge';
import type { WikiSaveState } from '@/hooks/useWikiAutosave';
import BufferedInput from './BufferedInput';

/** 「14:02」 */
function hhmm(at: Date): string {
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** 保存の状態を人の言葉にする。時刻は「保存しました 14:02」 */
export function saveLabel(state: WikiSaveState, savedAt: Date | null): string {
  if (state === 'saving') return '保存しています';
  if (state === 'conflict') return '他の人が先に保存しました';
  if (state === 'error') return '保存できませんでした';
  if (state === 'dirty') return '入力中';
  return savedAt ? `保存しました ${hhmm(savedAt)}` : '';
}

interface Props {
  title: string;
  onTitleChange: (v: string) => void;
  status: WikiPageStatus;
  reviewBy: string | null;
  saveState: WikiSaveState;
  savedAt: Date | null;
  readOnly: boolean;
  publishing: boolean;
  onBack: () => void;
  onPublish: () => void;
  onReload: () => void;
  previewOpen: boolean;
  onTogglePreview: () => void;
}

export default function WikiEditorHeader({
  title, onTitleChange, status, reviewBy, saveState, savedAt, readOnly,
  publishing, onBack, onPublish, onReload, previewOpen, onTogglePreview,
}: Props) {
  const label = saveLabel(saveState, savedAt);
  const tone = saveState === 'error' || saveState === 'conflict' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-2 lg:px-6">
      <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="ページに戻る" type="button">
        <ArrowLeft className="h-4 w-4" aria-hidden />
      </Button>

      <BufferedInput
        value={title}
        onCommit={onTitleChange}
        readOnly={readOnly}
        placeholder="題名"
        aria-label="題名"
        className="min-w-0 flex-1 rounded-control bg-transparent px-2 py-1 text-cardtitle text-foreground outline-none read-only:text-muted-foreground focus:bg-muted"
      />

      {/*
        保存の状態。**狭い画面でも消さない** — 自動保存は目に見えないので、
        「いま保存されたか」が分からないと、閉じてよいのか判断できません。
        375px では字を置く幅が無いので、印と時刻だけにします。
      */}
      <span className={`hidden shrink-0 whitespace-nowrap text-sub-sm sm:inline ${tone}`}>
        {saveState === 'saving' && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden />}
        {label}
      </span>
      <span className={`inline shrink-0 whitespace-nowrap text-sub-sm sm:hidden ${tone}`} title={label}>
        {saveState === 'saving' && <Loader2 className="inline h-3.5 w-3.5 animate-spin" aria-hidden />}
        {(saveState === 'error' || saveState === 'conflict') && <AlertCircle className="inline h-3.5 w-3.5" aria-hidden />}
        {saveState !== 'saving' && saveState !== 'error' && saveState !== 'conflict' && savedAt && (
          <>
            <Check className="mr-0.5 inline h-3.5 w-3.5" aria-hidden />
            {hhmm(savedAt)}
          </>
        )}
      </span>

      {saveState === 'conflict' && (
        <Button variant="outline" size="sm" type="button" onClick={onReload}>
          <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
          読み込み直す
        </Button>
      )}

      <WikiStatusBadge status={status} reviewBy={reviewBy} className="hidden shrink-0 lg:inline-flex" />

      {status !== 'published' && (
        <Button size="sm" type="button" onClick={onPublish} disabled={readOnly || publishing}>
          公開する
        </Button>
      )}

      {/* プレビューは幅のある画面だけ（スマホは本文に幅を譲る・設計 §6-⑨） */}
      <Button
        variant={previewOpen ? 'secondary' : 'outline'}
        size="sm"
        type="button"
        aria-pressed={previewOpen}
        onClick={onTogglePreview}
        className="hidden lg:inline-flex"
      >
        <Columns2 className="mr-1.5 h-4 w-4" aria-hidden />
        プレビュー
      </Button>
    </div>
  );
}
