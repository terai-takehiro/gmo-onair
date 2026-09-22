// 技術資料の新規作成（`CreateVenueLayoutDialog.tsx` と同じ作法）。
// 設計: docs/design/v4/tech-docs.md §6①「作成ダイアログは2手: 名前 → 新規作成／前の資料を
// 複製する」。モック `mockups/native/tech-docs/Main.dc.html` の作成ダイアログ。
// 案件／番組は一覧の絞り込みから来たときは固定表示にし、絞り込みが無いときだけ選ばせる
// （`qsheet_tech_docs_owner_ck` でどちらか1つが必ず要るため）。
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import { ToggleButtonGroup } from "@gmo-onair/shared/src/client/ui/toggle-button-group";
import type { TechDoc } from "@gmo-onair/shared/src/tech/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ManualOwnerFields, { type ManualOwnerValue } from "@/components/opsmanual/ManualOwnerFields";
import { notifyError } from "@/lib/notify";
import * as techApi from "@/lib/techApi";

type StartSource = "blank" | "copy";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `?project=`/`?program=` で絞り込まれているとき。案件／番組の選び直しはさせない */
  lockedOwner?: { projectId?: string | null; programId?: string | null; label: string };
  onCreated: (doc: TechDoc) => void;
}

function initialOwner(lockedOwner?: Props["lockedOwner"]): ManualOwnerValue {
  if (lockedOwner?.programId) return { ownerType: "program", projectId: null, programId: lockedOwner.programId };
  return { ownerType: "project", projectId: lockedOwner?.projectId ?? null, programId: null };
}

export default function CreateTechDocDialog({ open, onOpenChange, lockedOwner, onCreated }: Props) {
  const [owner, setOwner] = useState<ManualOwnerValue>(() => initialOwner(lockedOwner));
  const [name, setName] = useState("");
  const [source, setSource] = useState<StartSource>("blank");
  const [copyFromId, setCopyFromId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setOwner(initialOwner(lockedOwner));
    setName("");
    setSource("blank");
    setCopyFromId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ownerReady = owner.ownerType === "project" ? !!owner.projectId : !!owner.programId;

  const pastDocsQuery = useQuery({
    queryKey: ["tech-docs", "list", owner.projectId, owner.programId],
    queryFn: () => techApi.listTechDocs({
      project: owner.ownerType === "project" ? owner.projectId ?? undefined : undefined,
      program: owner.ownerType === "program" ? owner.programId ?? undefined : undefined,
    }),
    enabled: open && source === "copy" && ownerReady,
  });
  const pastDocs = useMemo(
    () => [...(pastDocsQuery.data ?? [])].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)),
    [pastDocsQuery.data],
  );

  useEffect(() => {
    if (source !== "copy") setCopyFromId(null);
  }, [source]);

  const sourceReady = source === "blank" ? true : !!copyFromId;
  const nameReady = name.trim().length > 0;

  const createMutation = useMutation({
    mutationFn: () => techApi.createTechDoc({
      title: name.trim(),
      project_id: owner.ownerType === "project" ? owner.projectId : null,
      program_id: owner.ownerType === "program" ? owner.programId : null,
      copy_from: source === "copy" ? copyFromId ?? undefined : undefined,
    }),
    onSuccess: (row) => { onOpenChange(false); onCreated(row); },
    onError: () => notifyError("技術資料を作成できませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });

  const canSubmit = ownerReady && nameReady && sourceReady;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="技術資料を作成"
      sub="名前と作成方法の2つで作成できます。資料番号は作成したときに採番されます。"
      size="md"
      onSubmit={(e) => { e.preventDefault(); if (canSubmit) createMutation.mutate(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" className="min-h-tap" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>キャンセル</Button>
          <Button type="submit" className="min-h-tap" disabled={createMutation.isPending || !canSubmit}>作成</Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-4">
        <ManualOwnerFields value={owner} onChange={setOwner} locked={!!lockedOwner} lockedLabel={lockedOwner?.label} />

        <div>
          <Label>名前</Label>
          <Input
            className="mt-1 min-h-tap"
            placeholder="例: 本番用 映像プラン"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="mt-1 text-sub-sm text-muted-foreground">何のための資料かが分かる名前を付けてください。</p>
        </div>

        <div>
          <Label>作成方法</Label>
          <div className="mt-1">
            <ToggleButtonGroup
              options={[{ value: "blank", label: "新規作成" }, { value: "copy", label: "前の資料を複製する" }]}
              value={[source]}
              onChange={(next) => {
                const v = next[next.length - 1] as StartSource | undefined;
                if (v) setSource(v);
              }}
              multi={false}
              cols={{ base: 2 }}
              size="sm"
              ariaLabel="作成方法"
            />
          </div>
          <p className="mt-1 text-sub-sm text-muted-foreground">
            {source === "blank"
              ? "映像パッチ・技術スタッフを 0 行から入力します。"
              : "映像パッチの行と技術スタッフをそのまま引き継いでから編集します。"}
          </p>
          {source === "copy" && (
            <div className="mt-2">
              {!ownerReady ? (
                <p className="text-sub-sm text-muted-foreground">先に案件／番組を選んでください。</p>
              ) : (
                <>
                  <Select value={copyFromId ?? ""} onValueChange={(v) => setCopyFromId(v || null)}>
                    <SelectTrigger className="min-h-tap"><SelectValue placeholder="複製する資料を選ぶ" /></SelectTrigger>
                    <SelectContent>
                      {pastDocs.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.doc_no ? `${d.doc_no} ` : ""}{d.title || "（無題）"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {pastDocsQuery.isSuccess && pastDocs.length === 0 && (
                    <p className="mt-1 text-sub-sm text-muted-foreground">この案件／番組にはまだ技術資料がありません。</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
