/**
 * `/wiki/p/:id` の振り分け — ふつうのページ（②）と データベース（⑩）は**同じ URL**
 *
 * 設計 §6-⑩ が「データベースは `kind='database'` のページ」と決めているので、
 * URL では見分けられません。ページを1件引いてから、種類で描く画面を選びます。
 *
 * ⚠️ **ここで追加の通信は起きません。** `useWikiPage` は ②（`PageViewPage`）が
 *    使うのと同じ鍵なので、react-query の同じ結果を見ます。
 *
 * ⚠️ 読み込み中・失敗のときは `PageViewPage` に任せます（骨組みと失敗の表示を
 *    2か所に書かない）。
 */
import { useParams } from 'react-router-dom';
import { useWikiPage } from '@/lib/wikiApi';
import PageViewPage from '@/pages/page/PageViewPage';
import DatabasePage from './DatabasePage';

export default function PageRoute() {
  const { id } = useParams<{ id: string }>();
  const { data } = useWikiPage(id);

  if (data?.kind === 'database') return <DatabasePage page={data} />;
  return <PageViewPage />;
}
