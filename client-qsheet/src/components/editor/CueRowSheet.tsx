import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@gmo-onair/shared/src/client/ui";
import CueRowMobileEditor from "./CueRowMobileEditor";

interface Block {
  id: string;
  type: string;
  label: string;
  width?: string | number;
}

interface Row {
  id?: string;
  label?: string;
  duration?: string | number;
  cells?: Record<string, any>;
  [k: string]: any;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 編集対象の row */
  row: Row | null;
  /** section index / row index */
  si: number;
  ri: number;
  /** セクションラベル (シート見出しに表示) */
  sectionLabel?: string;
  blocks: Block[];
  masters: any;
  ledScenes?: any[];
  updateState: (updater: (s: any) => any) => void;
}

/**
 * 1 行をフル編集するためのボトムシート (lg 未満専用)。
 * 内部に CueRowMobileEditor を表示。
 */
export default function CueRowSheet({
  open,
  onOpenChange,
  row,
  si,
  ri,
  sectionLabel,
  blocks,
  masters,
  ledScenes,
  updateState,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="dialog-bottom-sheet h-[88vh] p-0 gap-0 overflow-hidden flex flex-col"
        aria-describedby={undefined}
      >
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <DialogTitle className="text-sm">
            {sectionLabel ? `${sectionLabel} — 行 ${ri + 1}` : `行 ${ri + 1}`}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-3">
          {row ? (
            <CueRowMobileEditor
              row={row}
              blocks={blocks}
              masters={masters}
              ledScenes={ledScenes}
              updateState={updateState}
              si={si}
              ri={ri}
            />
          ) : (
            <p className="text-sm text-muted-foreground italic text-center py-8">
              行データを読み込めませんでした。
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
