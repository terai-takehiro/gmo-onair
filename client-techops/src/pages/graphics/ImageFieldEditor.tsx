// テロップCG — 写真アップロード欄（`pageFields.ts` の `kind: 'image'`）の入力UI。
// `PageFieldEditor.tsx`（→ `PageFormDialog.tsx` の自由入力・`TemplateFieldsSection.tsx` の
// テンプレート公開フィールドの両方から共通で呼ばれる）が dispatch する。
//
// 選んだら即座に `POST /graphics/pages/:id/photo` へアップロードする（ScoreEntriesEditor 等の
// 「配列を丸ごと state に持って親のフォーム送信で一括保存」とは違う経路 — 画像は事前に
// サーバーへ送ってURLだけを state に持つ必要があるため）。
//
// **ページ未保存（`pageId` が無い新規作成中）はアップロードを呼べない**（サーバー側の
// エンドポイントがページIDに紐づくため）。新規作成フォームでは欄自体は出したまま、
// アップロード操作だけを案内文に差し替える（欄を消すと「この部品に写真欄がある」ことに
// 気づけないため。テンプレート経由の新規作成でも同じ扱い）。
import { useRef, useState } from 'react';
import { ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { notifyError, notifySuccess } from '@/lib/notify';
import { uploadGraphicsPagePhoto } from '@/lib/graphicsApi';

const ACCEPT = 'image/jpeg,image/png,image/webp';

/** URL 末尾のファイル名（拡張子つき）を表示用に取り出す。形が崩れていても落ちない */
function filenameOf(url: string): string {
  const parts = url.split('/');
  return parts[parts.length - 1] || url;
}

export function ImageFieldEditor({
  label, pageId, value, onChange,
}: {
  label: string;
  /** 保存済みページのID。null＝まだ保存されていない新規作成中（アップロード不可） */
  pageId: string | null;
  /** 現在の写真URL（空文字＝未設定） */
  value: string;
  onChange: (next: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = () => inputRef.current?.click();

  const handleFile = async (file: File | undefined) => {
    if (!file || !pageId) return;
    setUploading(true);
    try {
      const { photoUrl } = await uploadGraphicsPagePhoto(pageId, file);
      onChange(photoUrl);
      notifySuccess('写真をアップロードしました');
    } catch {
      notifyError('写真をアップロードできませんでした', {
        description: 'JPG / PNG / WebP・10MBまでの画像を選んでください',
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <Label>{label}</Label>

      {!pageId ? (
        <p className="mt-1 rounded-note border border-dashed border-border bg-surface-subtle px-3 py-2 text-sub text-muted-foreground">
          テロップを保存すると写真を追加できます。まずは他の項目を入力して保存してください。
        </p>
      ) : value ? (
        <div className="mt-1 flex items-center gap-3 rounded-control-md border border-border bg-surface-subtle p-2">
          <img
            src={value}
            alt=""
            className="h-16 w-16 shrink-0 rounded-control object-cover"
          />
          <span className="min-w-0 flex-1 truncate text-sub text-muted-foreground">{filenameOf(value)}</span>
          <Button
            type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground"
            onClick={() => onChange('')} aria-label="写真を削除"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <Button
          type="button" variant="outline" className="mt-1 min-h-[44px] w-full justify-start gap-2 text-muted-foreground"
          onClick={pick} disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
          )}
          {uploading ? 'アップロード中…' : '写真を選ぶ（JPG / PNG / WebP）'}
        </Button>
      )}

      {pageId && value && (
        <Button
          type="button" variant="outline" size="sm" className="mt-2 min-h-[44px] gap-1.5"
          onClick={pick} disabled={uploading}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="h-3.5 w-3.5" aria-hidden="true" />}
          差し替える
        </Button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
