/**
 * **共通の左メニューの上に差し込む「いま開いているスペースのツリー」。**
 *
 * ── なぜ差し込みにするのか ──────────────────────────────────
 *
 * 最初は「共通の左メニュー（248px）＋ Wiki のツリー（264px）＋ 本文 ＋ 情報（320px）」の
 * 4列だった。1440px で本文に残るのは **608px** しかなく、利用者から
 * 「サイドタブが増えすぎて窮屈」とご指摘をいただいた（2026-09-22）。
 *
 * ナビが2列あるのが原因で、しかも**同じものを2回出していた** — 共通メニューの
 * 「スペース」の一覧と、ツリーの上に置いたスペース名。ツリーを共通メニューの中へ
 * 移し、ナビを1列にした。本文は 608px → **860px**（最大幅）に広がる。
 *
 * やり方は予定（カレンダー）の先例と同じ（`shared/src/client/shell/sideMenuSlot.ts`）:
 * シェルが空の `<div>` を用意し、画面が `createPortal` でここを描く。
 * **シェルは中身を一切知らない** ので、Wiki を知らない他のアプリには影響しない。
 *
 * ⚠️ 共通メニューは利用者が畳める（`data-side-collapsed`）。畳むとツリーも一緒に
 * 消えるが、それは利用者が自分で選んだ状態なので戻す手当てはしない
 * （上辺バーのパンくずとページ内のリンクで移れる）。
 *
 * ── 段B で足したもの ────────────────────────────────────────
 *
 * ページを追加する入口はここに**1つだけ**置く（見出しの右の `+`）。行の `+` は
 * その行を親にした追加で、どちらも同じ入口を開く。
 * **2つ目のナビの列も、2つ目の `☰` も作らない**（上のご指摘と同じ理由）。
 *
 * ── 段C で足したもの ────────────────────────────────────────
 *
 * `+` は「ページを追加」と「データベースを追加」の2つを出す（設計 §4-4 で
 * データベースは `kind='database'` のページ＝ツリーの一員なので、入口も同じ `+`）。
 * 絵柄を3つ並べず、1つの `+` から選ばせる。
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Plus, Table2 } from 'lucide-react';
import type { WikiPageKind, WikiTreeNode } from '@gmo-onair/shared/src/wiki/types';
import WikiTree from '@/components/wiki/WikiTree';
import PageCreateSheet from '@/components/page/PageCreateSheet';
import WikiMoreMenu from '@/components/page/WikiMoreMenu';
import DatabaseCreateSheet from '@/components/items/DatabaseCreateSheet';
import { usePermissions } from '@/hooks/usePermissions';

export interface WikiSpaceTreePanelProps {
  spaceKey: string;
  spaceName: string;
  nodes: WikiTreeNode[] | undefined;
  loading?: boolean;
  /** いま開いているページ。親を自動で開くのに使う */
  currentId?: string;
}

export default function WikiSpaceTreePanel({
  spaceKey,
  spaceName,
  nodes,
  loading,
  currentId,
}: WikiSpaceTreePanelProps) {
  const { canEdit } = usePermissions();
  /**
   * 追加のシートは2つ（ページ／データベース）。**同時には開きません** —
   * どちらを開いているかを `add.kind` で持ち、閉じたら両方が閉じます。
   */
  const [add, setAdd] = useState<{ kind: WikiPageKind | null; parentId: string | null }>({
    kind: null,
    parentId: null,
  });

  const openAdd = (parentId: string | null, kind: WikiPageKind) => {
    setAdd({ kind, parentId });
  };
  const closeAdd = () => setAdd((prev) => ({ ...prev, kind: null }));

  /** 見出しの「＋」とツリーの行の「＋」で同じ2つを出す */
  const addItems = (parentId: string | null) => [
    {
      key: 'add-page',
      label: 'ページを追加',
      icon: FileText,
      onSelect: () => openAdd(parentId, 'page'),
    },
    {
      key: 'add-database',
      label: 'データベースを追加',
      icon: Table2,
      onSelect: () => openAdd(parentId, 'database'),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center gap-1">
        {/* スペースの名前は押せる（そのスペースの目次へ戻る） */}
        <Link
          to={`/s/${spaceKey}`}
          className="flex min-h-tap min-w-0 flex-1 items-center gap-2 rounded-control px-2 text-list text-foreground hover:bg-primary-surface-weak lg:min-h-[34px]"
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-badge-xs bg-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{spaceName}</span>
        </Link>
        {canEdit && (
          <WikiMoreMenu
            label={spaceName}
            icon={Plus}
            triggerLabel={`${spaceName} に追加`}
            items={addItems(null)}
            className="lg:h-7 lg:w-7"
          />
        )}
      </div>

      {/*
        ツリーが長いスペースでも、下の「ホーム／スペース」が画面の外へ押し出されない
        ように高さを止める。止めないとスペースを移れなくなる。
      */}
      <div className="max-h-[44vh] min-w-0 overflow-y-auto">
        <WikiTree
          nodes={nodes}
          loading={loading}
          currentId={currentId}
          spaceKey={spaceKey}
          spaceName={spaceName}
          canEdit={canEdit}
          onAddChild={(parentId, kind) => openAdd(parentId, kind)}
        />
      </div>

      <PageCreateSheet
        open={add.kind === 'page'}
        onOpenChange={(v) => { if (!v) closeAdd(); }}
        defaultSpaceKey={spaceKey}
        defaultParentId={add.parentId}
      />
      <DatabaseCreateSheet
        open={add.kind === 'database'}
        onOpenChange={(v) => { if (!v) closeAdd(); }}
        defaultSpaceKey={spaceKey}
        defaultParentId={add.parentId}
      />
    </div>
  );
}
