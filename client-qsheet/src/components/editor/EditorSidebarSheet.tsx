import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@gmo-onair/shared/src/client/ui";
import { EditorSidebarBody } from "@/components/editor/EditorSidebar";

// EditorSidebar と完全に同じ Props を受け取る (ラッパ)
type Props = React.ComponentProps<typeof EditorSidebarBody> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * モバイル / タブレット (lg 未満) で右下 FAB から呼び出すサイドバー Sheet。
 * デスクトップサイドバーと同じ Tabs 構造 (列 / マスター / メタ / LED) を
 * ボトムシート形式で提供する。
 */
export default function EditorSidebarSheet({ open, onOpenChange, ...bodyProps }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="dialog-bottom-sheet h-[88vh] p-0 gap-0 overflow-hidden flex flex-col"
        aria-describedby={undefined}
      >
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <DialogTitle className="text-sm">エディタサイドバー</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <EditorSidebarBody {...bodyProps} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
