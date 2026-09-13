// マニュアルの削除確認ダイアログ。`ManualDetailPage.tsx` から切り出した（1ファイル400行のラチェット）。
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}

export default function DeleteManualDialog({ open, onOpenChange, onConfirm, pending }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>このマニュアルを削除しますか？</DialogTitle>
          <DialogDescription>この操作は取り消せません。マニュアルとすべてのページが削除されます。</DialogDescription>
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
