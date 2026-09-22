/**
 * zip の取り込み（設計 §5-2 の約束3-3・Obsidian / Notion / ONAiR の書き出しを受ける）
 *
 * ⚠️ **取り込みは元に戻せません。** サーバーは1回の取り込みを1つの錠で囲んでいない
 *    （何百ページの作成でほかの人の保存を待たせないため）ので、途中で失敗しても
 *    **そこまでが入った状態**で止まります。だからこの画面は
 *
 *      ① 取り込み先のスペースと「既存のページをどうするか」を**押す前に見せる**
 *      ② 選んだ zip の中を数えて、確認のダイアログに**何件が入るか**を書く
 *      ③ `confirmAction({ tone: 'danger' })` で1回止める
 *
 *    の3つを必ず通します。
 *
 * ⚠️ **既存のページは上書きしません。** サーバーの取り込みは**常に新しいページとして
 *    足す**だけで、同じ題のページを探して書き換えることはありません（選ばせる項目に
 *    していないのはそのためです。無い選択肢を出すほうが誤解を生みます）。
 *
 * ⚠️ **担当（owner）は戻りません。** `.md` に書いてあるのは氏名で、同姓同名があると
 *    別人に担当が付きます。取り込んだあとにページの「情報」で選び直してください。
 */
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { Label } from '@gmo-onair/shared/src/client/ui/label';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { usePermissions } from '@/hooks/usePermissions';
import { useWikiSpaces } from '@/lib/wikiApi';
import { importWikiZip, WIKI_IMPORT_MAX_BYTES } from '@/lib/wikiExportApi';
import WikiSection from '@/components/wiki/WikiSection';
import { FIELD_CLASS } from './transferFields';
import { peekZip, type ZipPeek } from './zipPeek';

const MB = 1024 * 1024;

/** 確認のダイアログに書く「何件が入るか」 */
function countText(peek: ZipPeek | null): string {
  if (!peek || !peek.readable) return 'zip の中身は数えられませんでした';
  const csv = peek.csv > 0 ? `・CSV ${peek.csv} 件` : '';
  return `zip の中の Markdown ファイルは ${peek.markdown} 件です${csv}`;
}

/** 選んだファイルの下に出す1行（確認のダイアログより短く） */
function pickedText(peek: ZipPeek | null): string {
  if (!peek || !peek.readable) return '中身を数えられませんでした';
  const csv = peek.csv > 0 ? `・CSV ${peek.csv} 件` : '';
  return `ファイル ${peek.files} 件（Markdown ${peek.markdown} 件${csv}）`;
}

export default function ImportZipCard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { canEdit } = usePermissions();
  const spacesQ = useWikiSpaces({ enabled: canEdit });
  const spaces = spacesQ.data;

  const inputRef = useRef<HTMLInputElement | null>(null);
  /**
   * 何回目に選んだファイルを数えているか。
   * ⚠️ **選び直したときに、前のファイルの件数が遅れて入るのを防ぎます** —
   * 確認のダイアログに別のファイルの件数が出ると、いちばん止めたい取り違えになります。
   */
  const pickCount = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [peek, setPeek] = useState<ZipPeek | null>(null);
  const [peeking, setPeeking] = useState(false);
  const [spaceKey, setSpaceKey] = useState('');
  const [status, setStatus] = useState<'published' | 'draft'>('published');

  const picked = spaces?.find((s) => s.key === spaceKey);
  const tooBig = !!file && file.size > WIKI_IMPORT_MAX_BYTES;
  // 数えられたうえで0件のときだけ止める（数えられなかったものはサーバーに判断させる）
  const nothingToImport = !!peek && peek.readable && peek.markdown === 0 && peek.csv === 0;

  const onPick = (next: File | null) => {
    const mine = (pickCount.current += 1);
    setFile(next);
    setPeek(null);
    if (!next) {
      setPeeking(false);
      return;
    }
    setPeeking(true);
    void peekZip(next)
      .then((result) => {
        if (pickCount.current === mine) setPeek(result);
      })
      .finally(() => {
        if (pickCount.current === mine) setPeeking(false);
      });
  };

  const run = useMutation({
    mutationFn: () => importWikiZip(file!, { space: spaceKey, status }),
    onSuccess: (result) => {
      // 取り込みはツリー・ホーム・スペースの件数を全部変える。まとめて読み直す
      void qc.invalidateQueries({ queryKey: ['wiki'] });
      setFile(null);
      setPeek(null);
      if (inputRef.current) inputRef.current.value = '';
      notifySuccess('取り込みました', {
        description: `ページ ${result.pages} 件・データベース ${result.databases} 件・行 ${result.rows} 件・画像 ${result.files} 件を「${picked?.name ?? result.space_key}」に追加しました。`,
      });
      navigate(`/s/${result.space_key}`);
    },
    onError: (err) => notifyApiError('取り込めませんでした', err),
  });

  const askAndRun = async () => {
    if (!file || !spaceKey) return;
    const ok = await confirmAction({
      title: `「${picked?.name ?? spaceKey}」に取り込みますか？`,
      description: `${countText(peek)}。すべて新しいページとして追加します（既存のページは上書きしません）。取り込んだページをまとめて元に戻す操作はありません。`,
      confirmLabel: '取り込む',
      tone: 'danger',
    });
    if (ok) run.mutate();
  };

  if (!canEdit) {
    return (
      <WikiSection title="取り込む" note="Obsidian・Notion・ONAiR の書き出し（zip）">
        <p className="p-4 text-sub text-muted-foreground">
          取り込みには Wiki の編集の権限が要ります。必要なときは管理者に連絡してください。
        </p>
      </WikiSection>
    );
  }

  return (
    <WikiSection
      title="取り込む"
      note="Obsidian・Notion・ONAiR の書き出し（zip）"
      footnote="担当は戻りません（.md に入っているのは氏名で、同姓同名があると別人に付くため）。取り込んだあとにページの「情報」で選び直してください。"
      bodyClassName="flex flex-col gap-3.5 p-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label className="text-th text-muted-foreground" htmlFor="wiki-import-file">
          取り込む zip
        </Label>
        <input
          ref={inputRef}
          id="wiki-import-file"
          type="file"
          accept=".zip,application/zip"
          className="block min-h-tap w-full cursor-pointer rounded-control-lg border border-border bg-card px-3 py-2 text-list text-foreground file:mr-3 file:rounded-control file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sub file:text-foreground"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        {file && (
          <p className="text-sub-sm text-muted-foreground">
            {file.name}（{(file.size / MB).toFixed(1)} MB）
            {peeking ? ' ・中身を数えています…' : ` ・${pickedText(peek)}`}
          </p>
        )}
        {tooBig && (
          <p className="text-sub-sm text-destructive">
            50MB を超えています。フォルダを分けてからお試しください。
          </p>
        )}
        {nothingToImport && !tooBig && (
          <p className="text-sub-sm text-destructive">
            取り込めるページ（.md）が見つかりません。別の zip を選んでください。
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-th text-muted-foreground" htmlFor="wiki-import-space">
          取り込み先のスペース
        </Label>
        <select
          id="wiki-import-space"
          className={FIELD_CLASS}
          value={spaceKey}
          onChange={(e) => setSpaceKey(e.target.value)}
        >
          <option value="">選んでください</option>
          {(spaces ?? []).map((s) => (
            <option key={s.key} value={s.key}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-th text-muted-foreground" htmlFor="wiki-import-status">
          取り込んだページの状態
        </Label>
        <select
          id="wiki-import-status"
          className={FIELD_CLASS}
          value={status}
          onChange={(e) => setStatus(e.target.value === 'draft' ? 'draft' : 'published')}
        >
          <option value="published">公開（全員が読める・検索に出る）</option>
          <option value="draft">下書き（自分だけが読める・検索に出ない）</option>
        </select>
      </div>

      {/*
        「既存のページをどうするか」を**押す前に見せる**（設計 §5-2 の約束3-3）。
        選ばせる欄にしていないのは、サーバーの取り込みが**足すことしかしない**ため。
        無い選択肢を並べるほうが「上書きもできる」と誤解させる
      */}
      <div className="rounded-card border border-border-faint bg-muted px-3 py-2.5">
        <p className="text-th text-foreground">既存のページ: 上書きしません</p>
        <p className="mt-1 text-sub-sm text-muted-foreground">
          同じ題のページがあっても書き換えず、すべて新しいページとして追加します。
          取り込んだページをまとめて元に戻す操作はありません。
        </p>
      </div>

      <Button
        type="button"
        size="lg"
        variant="destructive"
        className="w-full sm:w-auto sm:self-start"
        disabled={!file || !spaceKey || tooBig || nothingToImport || peeking || run.isPending}
        onClick={() => void askAndRun()}
      >
        <Upload className="mr-2 h-4 w-4" aria-hidden />
        {run.isPending ? '取り込んでいます…' : '取り込む'}
      </Button>
    </WikiSection>
  );
}
