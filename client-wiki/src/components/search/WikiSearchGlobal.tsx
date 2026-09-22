/**
 * どの画面からでも効くもの（`App.tsx` に1つだけ置く）
 *
 *   ・`⌘K`（Windows は `Ctrl+K`）で検索の窓を開け閉めする
 *   ・開いたページを「最近見たもの」に積む
 *
 * シェルの外に置いてあるのは、**画面を移っても消えない**ようにするためです。
 * ログインの画面では出しません（`App.tsx` が入っている人のときだけ描く）。
 */
import { useEffect } from 'react';
import { useMatch } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useWikiPage } from '@/lib/wikiApi';
import WikiSearchPalette from './WikiSearchPalette';
import { setWikiSearchOpen, useWikiSearchOpen } from './searchOpen';
import { pushWikiRecent } from './wikiRecent';

export default function WikiSearchGlobal() {
  const open = useWikiSearchOpen();

  // **打ち込み中の欄で押されても開いてよい**（探しに行く操作なので、打ち込みを
  // 止めても困りません）。ブラウザの既定（Chrome の検索欄へ移る）は止めます
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setWikiSearchOpen(!open);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <WikiSearchPalette />
      <WikiRecentTracker />
    </>
  );
}

/**
 * ページを開いたら「最近見たもの」に積む（その端末の中だけ）。
 *
 * ⚠️ **ここで新しく問い合わせません。** ページの画面が読むのと同じ鍵
 * （`wikiKeys.page(id)`）なので、react-query が1本にまとめます。
 * ページの画面（`PageViewPage` / `DatabasePage`）に積む処理を足さないのは、
 * 種類ごとに画面が分かれていて、片方だけ積み忘れるためです。
 */
function WikiRecentTracker() {
  const { currentUser } = useAuth();
  const { canView } = usePermissions();
  const uid = currentUser?.id ?? '';
  const match = useMatch('/p/:id');
  const id = match?.params.id;
  const { data } = useWikiPage(id, { enabled: !!id && canView });

  useEffect(() => {
    if (!uid || !id || !data || data.id !== id) return;
    pushWikiRecent(
      {
        id: data.id,
        title: data.title,
        spaceName: data.space_name ?? '',
        spaceColor: data.space_color ?? null,
      },
      uid,
    );
  }, [data, id, uid]);

  return null;
}
