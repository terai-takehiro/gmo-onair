/**
 * FinanceDocOriginal — 見積・請求の「原本」
 *
 * 承認する画面で**原本を見られるようにする**ための部品。
 * 案件管理アプリ (「今日」の行) と 日常業務アプリ (見積/請求の一覧) の両方から使うので
 * shared に置き、`api` を渡してもらう (アプリごとに api インスタンスが違う)。
 *
 * 見た目の決めごと:
 *   - 原本が無いときは「無い」ことを言い、置き場所をその場に出す (別画面に送らない)
 *   - PDF は画面内にそのまま表示する。承認しながら読めないと意味がない
 *   - 画像 (撮った請求書) は img で出す。文字は読み取れないと書く
 */
import { useRef, useState } from 'react';
import type { AxiosInstance } from 'axios';
import { confirmAction } from '../ui/confirm';

export interface FinanceDocOriginalProps {
  api: AxiosInstance;
  docId: string;
  hasOriginal: boolean;
  originalName?: string | null;
  originalKind?: 'pdf' | 'image' | null;
  /** 付ける・外すができるか (dailyops の書ける権限) */
  canEdit: boolean;
  /** 付けた・外したあとに一覧を取り直す */
  onChanged?: () => void;
}

const ACCEPT = 'application/pdf,image/jpeg,image/png';

export default function FinanceDocOriginal({
  api, docId, hasOriginal, originalName, originalKind, canEdit, onChanged,
}: FinanceDocOriginalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [open, setOpen] = useState(true);
  // 差し替えたときに同じ URL でブラウザがキャッシュを返さないようにする
  const [nonce, setNonce] = useState(0);

  const src = `/api/v1/internal/dailyops/finance-docs/${docId}/original?v=${nonce}`;

  const send = async (file: File) => {
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/dailyops/finance-docs/${docId}/original`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setNonce((n) => n + 1);
      onChanged?.();
    } catch (e) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      setError(err?.response?.data?.error?.message ?? '原本を付けられませんでした');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    // v3.1.0: `window.confirm` をやめた。**共通部品なのに検査の対象外だった**ため、
    // 全アプリに出るこの1か所だけブラウザ標準のダイアログが出ていた
    // (デザインの外側に出る / 何が一緒に起きるかを書けない)。
    const ok = await confirmAction({
      title: '付けた原本を外しますか？',
      description:
        'この書類から PDF・写真の紐づけを外します。Box に置いたファイルそのものは消えません（差し替えの記録が要る書類なので残します）。もう一度付け直せます。',
      confirmLabel: '外す',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true); setError(null);
    try {
      await api.delete(`/dailyops/finance-docs/${docId}/original`);
      onChanged?.();
    } catch (e) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      setError(err?.response?.data?.error?.message ?? '原本を外せませんでした');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <p className="text-[12px] font-bold text-muted-foreground">原本</p>
        {hasOriginal && (
          <>
            <span className="truncate text-[12px] text-secondary-foreground">{originalName}</span>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-[12px] font-bold text-primary underline"
            >
              {open ? '閉じる' : '開く'}
            </button>
            <a
              href={`${src}&download=1`}
              className="text-[12px] font-bold text-primary underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              ダウンロード
            </a>
          </>
        )}
      </div>

      {hasOriginal ? (
        <>
          {open && (
            <div className="overflow-hidden rounded-control border border-border bg-secondary/40">
              {originalKind === 'pdf' ? (
                <object data={src} type="application/pdf" className="block h-[420px] w-full">
                  {/* PDF を表示できないブラウザ (一部のスマホ) 向け */}
                  <p className="p-3 text-[13px] text-secondary-foreground">
                    この端末では画面内に表示できませんでした。
                    <a href={src} target="_blank" rel="noopener noreferrer" className="ml-1 font-bold text-primary underline">
                      別のタブで開く
                    </a>
                  </p>
                </object>
              ) : (
                <img src={src} alt={originalName ?? '原本'} className="block max-h-[420px] w-full object-contain" />
              )}
            </div>
          )}
          {originalKind === 'image' && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              写真の原本です。文字は読み取っていないので、金額と支払期日は目で確かめてください。
            </p>
          )}
          {canEdit && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                className="inline-flex h-8 items-center rounded-control border border-border bg-card px-2.5 text-[12px] font-bold text-foreground hover:bg-secondary disabled:opacity-60"
              >
                別のファイルに差し替える
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="inline-flex h-8 items-center rounded-control border border-destructive/40 px-2.5 text-[12px] font-bold text-destructive hover:bg-destructive-surface disabled:opacity-60"
              >
                原本を外す
              </button>
            </div>
          )}
        </>
      ) : canEdit ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void send(f);
          }}
          className={`rounded-control border-2 border-dashed px-3 py-4 text-center ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border bg-secondary/30'
          }`}
        >
          <p className="text-[13px] font-bold text-foreground">
            {busy ? '保存しています…' : '原本がまだありません'}
          </p>
          <p className="mt-0.5 text-[12px] text-secondary-foreground">
            PDF か 写真 (JPEG / PNG) をここに置くと、この画面で読めるようになります。
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="mt-2 inline-flex h-9 items-center rounded-control bg-primary px-3 text-[13px] font-bold text-primary-foreground disabled:opacity-60"
          >
            ファイルを選ぶ
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-secondary-foreground">
          原本はまだ付いていません。付けるには「日常業務」の書ける権限が必要です。
        </p>
      )}

      {error && <p className="mt-1.5 text-[12px] font-bold text-destructive">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ''; // 同じファイルを選び直せるようにする
          if (f) void send(f);
        }}
      />
    </div>
  );
}
