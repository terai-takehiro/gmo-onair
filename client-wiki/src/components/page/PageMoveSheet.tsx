/**
 * 「別のページの下へ」（スマホでツリーを組み替えるとき）
 *
 * PC はドラッグで動かせますが、スマホではドラッグの当たり判定が細すぎて
 * 使えません（行の高さが 44px、階層のずれが 14px）。同じことを**選んで決める**
 * 形でもできるようにします（設計 §6-⑨）。
 *
 * ⚠️ **自分と、自分の下にぶら下がるページは選べません**（循環参照）。
 * サーバーも弾きますが、選べてしまうと「押したのに戻ってくる」ことになります。
 */
import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import type { WikiTreeNode } from '@gmo-onair/shared/src/wiki/types';
import { buildWikiTree, flattenWikiTree } from '@/lib/wikiTree';
import { cn } from '@/lib/utils';
import { descendantIdsOf } from './treeMove';

export interface PageMoveSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 動かすページ */
  node: WikiTreeNode | null;
  /** そのスペースのツリー全部 */
  nodes: WikiTreeNode[];
  spaceName: string;
  /** 選ばれた親（スペースの直下なら null）を受け取る */
  onPick: (parentId: string | null) => void;
}

export default function PageMoveSheet({
  open,
  onOpenChange,
  node,
  nodes,
  spaceName,
  onPick,
}: PageMoveSheetProps) {
  const currentParent = node?.parent_id ?? null;
  // **開いた時点では「いまの置き場所」を選んだ状態にする。** 何も選ばずに
  // 「スペースの直下」が光っていると、いまどこに居るのかを読み違える
  const [picked, setPicked] = useState<string | null>(currentParent);

  useEffect(() => {
    if (open) setPicked(currentParent);
  }, [open, currentParent]);

  const rows = useMemo(() => {
    if (!node) return [];
    const banned = descendantIdsOf(nodes, node.id);
    const roots = buildWikiTree(nodes.filter((n) => !banned.has(n.id)));
    return flattenWikiTree(roots, new Set(nodes.map((n) => n.id)));
  }, [nodes, node]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="別のページの下へ"
      sub={node ? `${node.title} の置き場所を選びます` : undefined}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button
            type="button"
            disabled={picked === currentParent}
            onClick={() => {
              onPick(picked);
              onOpenChange(false);
            }}
          >
            ここへ動かす
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-0.5">
        <Choice
          label={`${spaceName} の直下`}
          depth={0}
          selected={picked === null}
          current={currentParent === null}
          onSelect={() => setPicked(null)}
        />
        {rows.map((n) => (
          <Choice
            key={n.id}
            label={n.title}
            depth={n.depth + 1}
            selected={picked === n.id}
            current={currentParent === n.id}
            onSelect={() => setPicked(n.id)}
          />
        ))}
      </div>
    </Sheet>
  );
}

function Choice({
  label,
  depth,
  selected,
  current,
  onSelect,
}: {
  label: string;
  depth: number;
  selected: boolean;
  /** いまの置き場所（選び直す前の場所が分かるように印を出す） */
  current: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{ paddingLeft: 8 + depth * 14 }}
      className={cn(
        'flex min-h-tap items-center gap-2 rounded-control pr-2 text-left text-list',
        selected ? 'bg-primary-surface-weak text-primary' : 'text-foreground hover:bg-muted',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {current && <span className="shrink-0 text-sub-sm text-muted-foreground">いまここ</span>}
    </button>
  );
}
