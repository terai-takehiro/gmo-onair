// マニュアルを「組織共通のテンプレート」として登録する小さいダイアログ（段E・production-manual.md
// §10-5「組織共通」）。名前を1つ訊くだけで、全ページ（blocksそのまま）をコピーして
// `qsheet_manual_templates` の行を1件作る（実際のコピーはサーバー側 `POST /manual-templates`）。
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import BufferedInput from "@/components/editor/BufferedInput";
import { notifyError, notifySuccess } from "@/lib/notify";
import * as manualApi from "@/lib/manualApi";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceManualId: string;
  defaultName: string;
  onRegistered?: () => void;
}

export default function RegisterManualTemplateDialog({ open, onOpenChange, sourceManualId, defaultName, onRegistered }: Props) {
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  const registerMutation = useMutation({
    mutationFn: () => manualApi.createManualTemplate({ name: name.trim() || defaultName, source_manual_id: sourceManualId }),
    onSuccess: () => {
      onOpenChange(false);
      notifySuccess("テンプレートとして登録しました。");
      onRegistered?.();
    },
    onError: () => {
      notifyError("テンプレートとして登録できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="組織共通のテンプレートとして登録"
      size="sm"
      onSubmit={(e) => { e.preventDefault(); registerMutation.mutate(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" className="min-h-tap" onClick={() => onOpenChange(false)} disabled={registerMutation.isPending}>閉じる</Button>
          <Button type="submit" className="min-h-tap" disabled={registerMutation.isPending}>
            {registerMutation.isPending ? "登録中…" : "登録する"}
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-4">
        <p className="text-sub text-muted-foreground">
          いまのページ構成をテンプレートとして保存します。組織の全員が、新しいマニュアルを作るときに選べるようになります。
        </p>
        <div>
          <Label htmlFor="manual-template-name">テンプレートの名前</Label>
          <BufferedInput
            id="manual-template-name"
            value={name}
            onCommit={setName}
            className="mt-1 flex h-10 w-full rounded-control-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="例: 収録の運営マニュアル"
          />
        </div>
      </div>
    </FormDialog>
  );
}
