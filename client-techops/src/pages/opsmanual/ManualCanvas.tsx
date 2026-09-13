// キャンバス（A4横）の汎用メカニクス(段B)。
//
// ブロックの中身（文字・図形・画像・表・QR）は一切知らない — 描画は `renderBlockContent`
// （呼び出し側の render prop）に完全に委ねる。ここが持つのは「選ぶ・つかんで動かす・
// 8方向で伸縮・回転・複製・削除・矢印キー移動・スナップ・元に戻す/やり直す・複数選択・
// 整列・等間隔・重ね順・スペース+ドラッグのパン・Ctrl+ホイールのズーム」というキャンバスの
// 操作だけ（production-manual.md §6 ②の操作表・段Bのスコープ）。
//
// 差し込みブロック（linked・段C）の位置・大きさ・選択・ドラッグ等のキャンバス操作はここが
// 他のブロックと同じに面倒を見る（中身の描画だけ `renderBlockContent` に委譲。onContentCommit
// は呼ばない設計 — kind:'linked' は中身編集を持たないため）。
// テンプレート（master）・確定/rev・PDF書き出しは実装しない（段D/E以降）。
//
// ⚠️ **undo履歴（`useManualHistory`）はページ単位。** 呼び出し側（`ManualDetailPage`）は
// ページを切り替えるたびに `key={ページID}` でこのコンポーネントごと再マウントすること
// （`pastRef`/`futureRef` はこのコンポーネントの寿命に紐づく ref のため、再マウントしないと
// 前のページの履歴が残り、切替後の Ctrl+Z が別ページの内容で上書きしてしまう）。
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { PAGE_HEIGHT_MM, PAGE_MARGIN_MM, PAGE_WIDTH_MM, type ManualBlock, type ManualFreeBlockContent } from "@gmo-onair/shared/src/opsmanual/types";
import ManualBlockView from "./ManualBlockView";
import ManualSelectionToolbar from "./ManualSelectionToolbar";
import { useManualHistory } from "./useManualHistory";
import { useManualPan } from "./useManualPan";
import { useManualMarqueeSelect, type MarqueeRect } from "./useManualMarqueeSelect";
import {
  ARROW_STEP_FINE_MM,
  ARROW_STEP_MM,
  alignBlocks,
  clamp,
  distributeBlocks,
  genBlockId,
  isEditableTarget,
  reorderZ,
  type AlignMode,
  type DistributeAxis,
  type ZOrderMode,
} from "./manualCanvasGeometry";
import type { BlockGeometryPatch } from "./ManualBlockView";

export interface ManualCanvasProps {
  /** 表示するブロック（親から渡される。真実の源は親側） */
  blocks: ManualBlock[];
  /** 1つの操作（ドラッグ終了・伸縮終了・回転終了・削除・複製・矢印キー移動・中身の編集・
   *  整列・等間隔・重ね順）が完了するたびに呼ぶ。親はこれを undo履歴の1手・自動保存の
   *  トリガーとして扱う */
  onCommit: (nextBlocks: ManualBlock[]) => void;
  /** 選択が変わるたびに親へ通知（右パネルの表示用。複数選択のときは null） */
  onSelectionChange?: (blockId: string | null) => void;
  /** ブロックの「中身」の描画は呼び出し側に委ねる。ctx.onContentCommit(newContent) を
   *  呼ぶと、そのブロックの free.content を差し替えて onCommit を呼ぶ（＝中身の編集も undo に乗る）。
   *  kind:'linked'（段C）のブロックは onContentCommit を呼ばない設計 — 呼び出し側が
   *  差し込みの解決結果（resolve）を渡したいときは、この関数をクロージャで包んで対応する */
  renderBlockContent: (
    block: ManualBlock,
    ctx: { selected: boolean; onContentCommit: (content: ManualFreeBlockContent) => void }
  ) => ReactNode;
  /** 既定 1（100%）。あとは Ctrl+ホイールで内部的に変わる（このコンポーネントの初期値としてだけ使う） */
  zoom?: number;
  /** ページの最上部に重ねる見た目専用の要素（実際に刷るヘッダーの WYSIWYG・利用者指摘）。
   *  版面の余白ガイドと同じ層に置くだけで、キャンバスの操作は一切知らない（段Bのスコープのまま） */
  headerOverlay?: ReactNode;
}

/** 親（ツールバー・右パネル）からも undo 履歴の1手として積みたいときに使う */
export interface ManualCanvasHandle {
  commit: (next: ManualBlock[]) => void;
  /** 追加ブロックを選択状態にする（`duplicateSelected` と同じ扱い。詳細は呼び出し側のコメント） */
  select: (id: string) => void;
}

const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const ARROW_FLUSH_DELAY_MS = 600;
const DUPLICATE_OFFSET_MM = 5;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.1;

const ManualCanvas = forwardRef<ManualCanvasHandle, ManualCanvasProps>(function ManualCanvas(
  { blocks, onCommit, onSelectionChange, renderBlockContent, zoom = 1, headerOverlay },
  ref
) {
  const pageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [liveBlocks, setLiveBlocks] = useState<ManualBlock[] | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ x: number[]; y: number[] } | null>(null);
  // ズームは内部で持つ（Ctrl+ホイール）。`zoom` prop は初期値としてだけ使う
  const [zoomLevel, setZoomLevel] = useState(zoom);
  const arrowPendingRef = useRef<ManualBlock[] | null>(null);
  const arrowTimeoutRef = useRef<number | null>(null);
  const pan = useManualPan(viewportRef);

  const history = useManualHistory({ blocks, onCommit, limit: 50 });
  const displayBlocks = liveBlocks ?? blocks;
  // ⚠️ レビュー指摘（P1）: 体制図の顔写真アップロードのように、ブロックの中身の編集が
  // 通信をまたぐ場合、通信が終わるまでにブロックそのものが削除されうる。そのとき
  // `onContentCommit` は削除される直前の（まだブロックが存在した頃の）閉包のまま
  // 呼ばれる——`blocks` を直接閉じ込めた `handleBlockContentCommit` がそのまま
  // 古い配列を使うと、削除したブロックを丸ごと復活させてしまう。ref で常に最新の
  // `blocks` を指し、**呼ばれた時点でそのブロックがまだ存在するかを確かめてから**
  // 書き込む（存在しなければ何もしない）。
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  // `selectOnly` はこの下で定義される関数宣言（巻き上げにより参照可能）
  const marquee = useManualMarqueeSelect(pageRef, blocks, selectedIds, setSelectedIds, selectOnly);

  // 右パネル・ツールバー（BlockInspector・BlockToolbar）からも同じ undo 履歴に積めるようにする
  useImperativeHandle(ref, () => ({ commit: history.commit, select: selectOnly }), [history]);

  // 外部から blocks が変わって選択中のブロックが消えたものは選択から外す（undo で消えた等）
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = prev.filter((id) => blocks.some((b) => b.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [blocks]);

  // 単一選択のときだけ右パネルへ通知（複数選択は null = 右パネルは何も出さない）
  useEffect(() => {
    onSelectionChange?.(selectedIds.length === 1 ? selectedIds[0] : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  useEffect(
    () => () => {
      if (arrowTimeoutRef.current != null) window.clearTimeout(arrowTimeoutRef.current);
    },
    []
  );

  function selectOnly(id: string | null) {
    setSelectedIds(id ? [id] : []);
    pageRef.current?.focus({ preventScroll: true });
  }

  function selectBlock(id: string, shiftKey: boolean) {
    if (shiftKey) {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setSelectedIds([id]);
    }
    pageRef.current?.focus({ preventScroll: true });
  }

  function flushArrow() {
    if (arrowTimeoutRef.current != null) {
      window.clearTimeout(arrowTimeoutRef.current);
      arrowTimeoutRef.current = null;
    }
    if (arrowPendingRef.current) {
      history.commit(arrowPendingRef.current);
      arrowPendingRef.current = null;
    }
    setLiveBlocks(null);
  }

  function moveSelectedByArrow(key: string, fine: boolean) {
    const cur = displayBlocks;
    const targets = cur.filter((b) => selectedIds.includes(b.id));
    if (targets.length === 0) return;
    const step = fine ? ARROW_STEP_FINE_MM : ARROW_STEP_MM;
    let dx = 0;
    let dy = 0;
    if (key === "ArrowUp") dy = -step;
    else if (key === "ArrowDown") dy = step;
    else if (key === "ArrowLeft") dx = -step;
    else dx = step;
    const next = cur.map((b) => {
      if (!selectedIds.includes(b.id)) return b;
      const nx = clamp(b.x + dx, 0, Math.max(0, PAGE_WIDTH_MM - b.w));
      const ny = clamp(b.y + dy, 0, Math.max(0, PAGE_HEIGHT_MM - b.h));
      return { ...b, x: nx, y: ny } as ManualBlock;
    });
    setLiveBlocks(next);
    arrowPendingRef.current = next;
    if (arrowTimeoutRef.current != null) window.clearTimeout(arrowTimeoutRef.current);
    arrowTimeoutRef.current = window.setTimeout(flushArrow, ARROW_FLUSH_DELAY_MS);
  }

  function deleteSelected() {
    if (selectedIds.length === 0) return;
    const next = blocks.filter((b) => !selectedIds.includes(b.id));
    history.commit(next);
    selectOnly(null);
  }

  function duplicateSelected() {
    const srcs = blocks.filter((b) => selectedIds.includes(b.id));
    if (srcs.length === 0) return;
    let maxZ = blocks.reduce((m, b) => Math.max(m, b.z), 0);
    const dups: ManualBlock[] = srcs.map((src) => {
      maxZ += 1;
      return {
        ...src,
        id: genBlockId(),
        x: clamp(src.x + DUPLICATE_OFFSET_MM, 0, Math.max(0, PAGE_WIDTH_MM - src.w)),
        y: clamp(src.y + DUPLICATE_OFFSET_MM, 0, Math.max(0, PAGE_HEIGHT_MM - src.h)),
        z: maxZ,
      };
    });
    history.commit([...blocks, ...dups]);
    setSelectedIds(dups.map((d) => d.id));
  }

  function handleBlockPatchCommit(id: string, patch: BlockGeometryPatch) {
    const next = blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as ManualBlock) : b));
    history.commit(next);
  }

  function handleBlockContentCommit(id: string, content: ManualFreeBlockContent) {
    // ここは通信をまたいだ古い閉包から呼ばれうる（上の blocksRef の注記）ので、
    // 呼ばれた「いま」の最新を ref から読み、そのブロックがもう無いなら何もしない
    const current = blocksRef.current;
    if (!current.some((b) => b.id === id)) return;
    // kind:'linked'（段C）のブロックは中身編集を持たないため onContentCommit を呼ばない設計だが、
    // 型として安全にするため、ここでも free ブロック以外は書き込まない
    const next = current.map((b) =>
      b.id === id && b.kind === "free" ? ({ ...b, free: { ...b.free, content } } as unknown as ManualBlock) : b
    );
    history.commit(next);
  }

  // ── 複数選択: 整列・等間隔・重ね順（production-manual.md §6-2） ──────────
  function handleAlign(mode: AlignMode) {
    history.commit(alignBlocks(blocks, selectedIds, mode));
  }
  function handleDistribute(axis: DistributeAxis) {
    history.commit(distributeBlocks(blocks, selectedIds, axis));
  }
  function handleZOrder(mode: ZOrderMode) {
    history.commit(reorderZ(blocks, selectedIds, mode));
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (isEditableTarget(e.target)) return; // 中身の文字入力欄などは邪魔しない

    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
      return;
    }
    if (meta && e.key.toLowerCase() === "y") {
      e.preventDefault();
      history.redo();
      return;
    }
    if (selectedIds.length === 0) return;
    if (meta && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicateSelected();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSelected();
      return;
    }
    if (ARROW_KEYS.has(e.key)) {
      e.preventDefault();
      moveSelectedByArrow(e.key, e.shiftKey);
    }
  }

  function handleKeyUp(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (ARROW_KEYS.has(e.key)) flushArrow();
  }

  // ── Ctrl+ホイールでズーム ────────────────────────────
  function handleWheel(e: ReactWheelEvent<HTMLDivElement>) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoomLevel((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 100) / 100)));
  }

  const sorted = [...displayBlocks].sort((a, b) => a.z - b.z);

  return (
    <div className="relative">
      {selectedIds.length >= 2 && (
        <ManualSelectionToolbar count={selectedIds.length} onAlign={handleAlign} onDistribute={handleDistribute} onZOrder={handleZOrder} />
      )}

      {/* スペース＋ドラッグでつかんで動かす・Ctrl＋ホイールで拡大縮小の対象（production-manual.md §6-2） */}
      <div
        ref={viewportRef}
        className="max-h-[70vh] min-h-[420px] overflow-auto rounded-card border border-border bg-muted/10 p-4"
        style={{ cursor: pan.isSpaceHeld ? (pan.isPanning ? "grabbing" : "grab") : undefined }}
        onWheel={handleWheel}
        onPointerDownCapture={pan.onPointerDownCapture}
        onPointerMove={pan.onPointerMove}
        onPointerUp={pan.onPointerUp}
        onPointerCancel={pan.onPointerUp}
      >
        <div style={{ width: `${PAGE_WIDTH_MM * zoomLevel}mm`, height: `${PAGE_HEIGHT_MM * zoomLevel}mm` }} className="relative">
          <div
            ref={pageRef}
            data-manual-page
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onPointerDown={marquee.onPointerDown}
            onPointerMove={marquee.onPointerMove}
            onPointerUp={marquee.onPointerUp}
            onPointerCancel={marquee.onPointerUp}
            style={{
              width: `${PAGE_WIDTH_MM}mm`,
              height: `${PAGE_HEIGHT_MM}mm`,
              transform: `scale(${zoomLevel})`,
              transformOrigin: "top left",
            }}
            className="relative select-none overflow-hidden bg-white text-foreground shadow outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* 版面の余白ガイド */}
            <div
              className="pointer-events-none absolute border border-dashed border-border/70"
              style={{
                left: `${PAGE_MARGIN_MM.left}mm`,
                top: `${PAGE_MARGIN_MM.top}mm`,
                right: `${PAGE_MARGIN_MM.right}mm`,
                bottom: `${PAGE_MARGIN_MM.bottom}mm`,
              }}
            />

            {headerOverlay}

            {sorted.map((block) => (
              <ManualBlockView
                key={block.id}
                block={block}
                selected={selectedIds.includes(block.id)}
                allBlocks={displayBlocks}
                pageRef={pageRef}
                onSelect={(shiftKey) => selectBlock(block.id, shiftKey)}
                onPatchCommit={(patch) => handleBlockPatchCommit(block.id, patch)}
                onContentCommit={(content) => handleBlockContentCommit(block.id, content)}
                onSnapGuides={setSnapGuides}
                renderContent={(ctx) => renderBlockContent(block, ctx)}
              />
            ))}

            <SnapGuideOverlay guides={snapGuides} />
            <MarqueeOverlay rect={marquee.marqueeRect} />
          </div>
        </div>
      </div>
    </div>
  );
});

export default ManualCanvas;

function SnapGuideOverlay({ guides }: { guides: { x: number[]; y: number[] } | null }) {
  if (!guides) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {guides.x.map((x) => (
        <div key={`v-${x}`} className="absolute top-0 h-full w-px bg-destructive/60" style={{ left: `${x}mm` }} />
      ))}
      {guides.y.map((y) => (
        <div key={`h-${y}`} className="absolute left-0 h-px w-full bg-destructive/60" style={{ top: `${y}mm` }} />
      ))}
    </div>
  );
}

function MarqueeOverlay({ rect }: { rect: MarqueeRect | null }) {
  if (!rect) return null;
  return (
    <div
      className="pointer-events-none absolute border border-primary bg-primary/10"
      style={{ left: `${rect.x}mm`, top: `${rect.y}mm`, width: `${rect.w}mm`, height: `${rect.h}mm` }}
    />
  );
}
