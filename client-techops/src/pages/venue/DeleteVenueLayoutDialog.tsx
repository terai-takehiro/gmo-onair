// 会場図面の削除確認ダイアログ。`opsmanual/DeleteManualDialog.tsx` の写し
// （`VenueEditorDesktop.tsx` から見た目だけを切り出したもの・1ファイル400行のラチェット対策）。
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}

export default function DeleteVenueLayoutDialog({ open, onOpenChange, onConfirm, pending }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>この会場図面を削除しますか？</DialogTitle>
          <DialogDescription>この操作は取り消せません。図面と中の品目がすべて削除されます。</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "削除中…" : "削除する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
