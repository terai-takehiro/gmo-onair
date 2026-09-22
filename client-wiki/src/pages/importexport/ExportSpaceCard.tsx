/**
 * スペースまるごとの書き出し（設計 §5-2 の約束3-3）
 *
 * `GET /wiki/export?space=<key>` が zip を1本返します。中身は Notion の書き出しと
 * 同じ考え方（`README.md` ＋ ページ1枚＝`.md` 1本 ＋ 子ページは同じ名前のフォルダ ＋
 * データベースは `_database.md` と `_index.csv` と行の `.md` ＋ 画像は `files/`）。
 *
 * ⚠️ **下書きは入りません**（§7-5。他の人の書きかけを配らない）。
 *    一覧から隠したページは入ります（消えていないもの）。**画面にもそう書きます** —
 *    書き出した zip を開いてから足りないと気づくのがいちばん困ります。
 */
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { Label } from '@gmo-onair/shared/src/client/ui/label';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { useWikiSpaces } from '@/lib/wikiApi';
import { downloadSpaceZip } from '@/lib/wikiExportApi';
import WikiSection from '@/components/wiki/WikiSection';
import { FIELD_CLASS } from './transferFields';

export default function ExportSpaceCard() {
  const spacesQ = useWikiSpaces();
  const spaces = spacesQ.data;
  const [spaceKey, setSpaceKey] = useState('');

  // 読めたら先頭を選んでおく（空のまま「書き出す」を押せる状態を作らない）
  useEffect(() => {
    if (!spaceKey && spaces && spaces.length > 0) setSpaceKey(spaces[0].key);
  }, [spaces, spaceKey]);

  const picked = spaces?.find((s) => s.key === spaceKey);

  const run = useMutation({
    mutationFn: () => downloadSpaceZip(spaceKey, picked?.name ?? spaceKey),
    onSuccess: () => {
      notifySuccess('スペースを書き出しました', {
        description: `${picked?.name ?? spaceKey} の zip を保存しました。`,
      });
    },
    onError: (err) => notifyApiError('スペースを書き出せませんでした', err),
  });

  return (
    <WikiSection
      title="書き出す"
      note="スペース1つを zip（.md のフォルダ）で保存します"
      footnote="中身は README.md ／ ページごとの .md ／ 子ページのフォルダ ／ データベースの _database.md・_index.csv ／ 本文が指している画像の files/ です。下書きは入りません。"
      bodyClassName="flex flex-col gap-3.5 p-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label className="text-th text-muted-foreground" htmlFor="wiki-export-space">
          書き出すスペース
        </Label>
        <select
          id="wiki-export-space"
          className={FIELD_CLASS}
          value={spaceKey}
          disabled={!spaces || spaces.length === 0}
          onChange={(e) => setSpaceKey(e.target.value)}
        >
          {!spaces || spaces.length === 0 ? (
            <option value="">{spacesQ.isLoading ? '読み込み中…' : '—'}</option>
          ) : (
            spaces.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
                {s.page_count ? `（${s.page_count}ページ）` : ''}
              </option>
            ))
          )}
        </select>
        {/* 0件は「読めるスペースが無い」状態。読み込み中と同じ見た目にしない */}
        {!spacesQ.isLoading && spaces && spaces.length === 0 && (
          <p className="text-sub-sm text-muted-foreground">
            読めるスペースがありません。必要なときは管理者に連絡してください。
          </p>
        )}
      </div>

      <Button
        type="button"
        size="lg"
        className="w-full sm:w-auto sm:self-start"
        disabled={!spaceKey || run.isPending}
        onClick={() => run.mutate()}
      >
        <Download className="mr-2 h-4 w-4" aria-hidden />
        {run.isPending ? '書き出しています…' : 'zip で書き出す'}
      </Button>
    </WikiSection>
  );
}
