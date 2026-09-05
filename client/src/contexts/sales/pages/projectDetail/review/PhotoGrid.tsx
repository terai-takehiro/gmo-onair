/**
 * 当日の写真 (v4 ⑥ 案件記録)
 *
 * ── 実体は BOX に置く。こちらには残さない ──────────────────
 *
 * 保存先は **BOX の「社外と共有するフォルダ」の下の `08_写真`**（ご指示）。
 * 自前のストレージには置きません。サムネイルも BOX が作ったものを
 * サーバーが**流すだけ**で、画像をこちらに複製しません。
 *
 * ── 社外と共有するフォルダに入ることを画面に書く ────────────
 *
 * 社内限りと取り違えると、原価が外に出るのと同じ事故になります。
 * **枠の中に書きます** — 別の場所に注意書きを置いても読まれません。
 *
 * ── サムネイルが出ないことがある ────────────────────────────
 *
 * BOX の変換が終わっていない・対応していない形式・契約プランで使えない、の
 * どれでも起こります。そのときは**ファイル名だけ**にします
 * （絵が出ないのは我慢できますが、枠が壊れると何枚あるのかも分からなくなります）。
 *
 * ── スマホはカメラを直接開く ────────────────────────────────
 *
 * `capture="environment"`。本番当日は現場で撮ってその場で入れるので、
 * 「写真を選ぶ」だと一度カメラアプリに出てから戻ることになります。
 */
import { useRef, useState } from 'react';
import { Camera, ImageIcon, Loader2, AlertTriangle } from 'lucide-react';
import { BoxLogo } from '@/components/BoxLogo';
import { cn } from '@gmo-onair/shared/src/client/utils';
import api from '@/lib/api';

export interface PhotoItem {
  id: string;
  name: string;
  url: string;
}

/** 1回に上げられる枚数。**書類タブと同じ上限**（片方だけ増やすと使い分けが分からなくなる） */
export const MAX_PHOTOS = 5;

export function PhotoGrid({
  projectId, photos, canEdit, busy, mobile, reason, onUpload,
}: {
  projectId: string;
  photos: PhotoItem[];
  canEdit: boolean;
  busy: boolean;
  mobile: boolean;
  /** BOX につながらない・フォルダが無いときの理由 */
  reason?: string | null;
  onUpload: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <p className="text-sub mb-1.5 flex flex-wrap items-center gap-2 font-bold">
        当日の写真
        <span className="text-note font-number font-normal text-muted-foreground">{photos.length}</span>
        <span className="flex-1" />
        <span className="text-note font-normal text-muted-foreground">報告資料に使えます</span>
      </p>

      {reason ? (
        <p className="text-note rounded-note flex items-start gap-2 border border-warning-border bg-warning-surface px-3 py-2 text-secondary-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          {reason}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p) => (
            <Thumb key={p.id} projectId={projectId} photo={p} />
          ))}

          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="rounded-note flex aspect-[4/3] flex-col items-center justify-center gap-1.5 border border-dashed border-border bg-surface-subtle hover:bg-muted"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
              ) : mobile ? (
                <Camera className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
              ) : (
                <BoxLogo className="h-3 w-auto" />
              )}
              <span className="text-note font-bold text-secondary-foreground">
                {mobile ? '写真を撮って追加' : '写真を追加'}
              </span>
            </button>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        // **スマホではカメラを直接開く。** PC で `capture` を付けても無視される
        {...(mobile ? { capture: 'environment' as const } : {})}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS);
          if (files.length > 0) onUpload(files);
          // 同じ写真をもう一度選べるように空にする
          e.target.value = '';
        }}
      />

      <p className="text-note mt-1.5 leading-relaxed text-muted-foreground">
        1回に <span className="font-number">{MAX_PHOTOS}</span> 枚まで。
        <strong className="font-bold text-foreground">保存先は BOX の「社外と共有するフォルダ／08_写真」です</strong>
        （社内限りではありません）。報告資料をつくるときに選んで貼れます。
      </p>
    </div>
  );
}

function Thumb({ projectId, photo }: { projectId: string; photo: PhotoItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href={photo.url}
      target="_blank"
      rel="noopener noreferrer"
      title={photo.name}
      className="rounded-note relative block aspect-[4/3] overflow-hidden border border-border bg-surface-subtle"
    >
      {/*
        サムネイルは **axios を通さずに `<img>` で取りに行きます**。認証は
        HTTP-only cookie が同一オリジンで自動で付くので通ります
        （付かない環境では `onError` でファイル名の表示に落ちます）。
        行き先は `api` の baseURL から組み立てます — `/api/v1/internal` と
        直書きすると、`VITE_API_URL` を変えている環境で 404 になります
      */}
      {failed ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </span>
      ) : (
        <img
          src={`${api.defaults.baseURL ?? ''}/projects/${projectId}/box-files/${photo.id}/thumbnail`}
          alt={photo.name}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      <span className={cn(
        'text-badge absolute inset-x-0 bottom-0 truncate px-1.5 py-1 font-bold text-white',
        'bg-gradient-to-t from-black/55 to-transparent',
      )}>
        {photo.name}
      </span>
    </a>
  );
}
