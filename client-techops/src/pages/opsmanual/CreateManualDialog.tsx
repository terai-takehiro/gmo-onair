// 運営マニュアルの新規作成（段A: 空の冊子／段E: 組織共通のひな形・前回の冊子から複製）。
// `CreateScheduleDialog.tsx` と同じ作法。§10-5 の割り切りどおり、「ひな形」と「前回の冊子から」は
// 別経路（前者は `templateId`＝`qsheet_manual_templates` 経由、後者は `copyFromManualId`＝
// 実在する `qsheet_manuals` を直接複製）だが、利用者からは1つの3択に見せる。
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import { ToggleButtonGroup } from "@gmo-onair/shared/src/client/ui/toggle-button-group";
import type { ManualListItem } from "@gmo-onair/shared/src/opsmanual/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BufferedInput from "@/components/editor/BufferedInput";
import ManualOwnerFields, { type ManualOwnerValue } from "@/components/opsmanual/ManualOwnerFields";
import { notifyError } from "@/lib/notify";
import * as manualApi from "@/lib/manualApi";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `?project=`/`?program=` で絞り込まれているとき。案件/番組の選び直しはさせない */
  lockedOwner?: { projectId?: string | null; programId?: string | null; label: string };
  onCreated: (manual: ManualListItem) => void;
}

type ManualSource = "blank" | "template" | "copy";

function initialOwner(lockedOwner?: Props["lockedOwner"]): ManualOwnerValue {
  if (lockedOwner?.programId) return { ownerType: "program", projectId: null, programId: lockedOwner.programId };
  return { ownerType: "project", projectId: lockedOwner?.projectId ?? null, programId: null };
}

export default function CreateManualDialog({ open, onOpenChange, lockedOwner, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [owner, setOwner] = useState<ManualOwnerValue>(() => initialOwner(lockedOwner));
  const [source, setSource] = useState<ManualSource>("blank");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [copyFromManualId, setCopyFromManualId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setServiceDate("");
    setOwner(initialOwner(lockedOwner));
    setSource("blank");
    setTemplateId(null);
    setCopyFromManualId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 作り方を切り替えたら、別の作り方で選んでいたものを持ち越さない
  useEffect(() => {
    if (source !== "template") setTemplateId(null);
    if (source !== "copy") setCopyFromManualId(null);
  }, [source]);

  const ownerReady = owner.ownerType === "project" ? !!owner.projectId : !!owner.programId;

  const templatesQuery = useQuery({
    queryKey: ["manual-templates"],
    queryFn: manualApi.listManualTemplates,
    enabled: open && source === "template",
  });

  // 「前回の冊子」の候補は、いま選んでいる案件／番組の既存の一覧をそのまま使う
  // （production-manual.md §6①「前回の冊子」の一覧はGET /manuals?project=…の既存の一覧APIをそのまま使ってよい）
  const pastManualsQuery = useQuery({
    queryKey: ["manuals", "list", owner.projectId, owner.programId],
    queryFn: () => manualApi.listManuals({
      project_id: owner.ownerType === "project" ? owner.projectId ?? undefined : undefined,
      program_id: owner.ownerType === "program" ? owner.programId ?? undefined : undefined,
    }),
    enabled: open && source === "copy" && ownerReady,
  });
  const pastManuals = useMemo(
    () => [...(pastManualsQuery.data ?? [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [pastManualsQuery.data],
  );

  const sourceReady = source === "blank" ? true : source === "template" ? !!templateId : !!copyFromManualId;

  const createMutation = useMutation({
    mutationFn: () => manualApi.createManual({
      title: title.trim() || "無題の運営マニュアル",
      project_id: owner.ownerType === "project" ? owner.projectId : null,
      program_id: owner.ownerType === "program" ? owner.programId : null,
      service_date: serviceDate || null,
      template_id: source === "template" ? templateId ?? undefined : undefined,
      copy_from_manual_id: source === "copy" ? copyFromManualId ?? undefined : undefined,
    }),
    onSuccess: (row) => { onOpenChange(false); onCreated(row); },
    onError: () => {
      notifyError("運営マニュアルを作れませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="運営マニュアルを新しく作る"
      size="md"
      onSubmit={(e) => { e.preventDefault(); if (ownerReady && sourceReady) createMutation.mutate(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" className="min-h-tap" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>閉じる</Button>
          <Button type="submit" className="min-h-tap" disabled={createMutation.isPending || !ownerReady || !sourceReady}>作る</Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="new-manual-title">タイトル</Label>
          <BufferedInput
            id="new-manual-title"
            value={title}
            onCommit={setTitle}
            className="mt-1 flex h-10 w-full rounded-control-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="例: 本番当日の運営マニュアル"
          />
        </div>

        <div>
          <Label htmlFor="new-manual-service-date">本番/開催の予定日（任意）</Label>
          <input
            id="new-manual-service-date"
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
            className="mt-1 flex h-10 w-full rounded-control-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <ManualOwnerFields
          value={owner}
          onChange={setOwner}
          locked={!!lockedOwner}
          lockedLabel={lockedOwner?.label}
        />

        <div>
          <Label>作り方</Label>
          <div className="mt-1">
            <ToggleButtonGroup
              options={[
                { value: "blank", label: "空の冊子" },
                { value: "template", label: "組織のひな形から" },
                { value: "copy", label: "前回の冊子から" },
              ]}
              value={[source]}
              onChange={(next) => {
                const v = next[next.length - 1] as ManualSource | undefined;
                if (v) setSource(v);
              }}
              multi={false}
              cols={{ base: 3 }}
              size="sm"
              ariaLabel="冊子の作り方"
            />
          </div>
        </div>

        {source === "template" && (
          <div>
            <Label>ひな形</Label>
            <Select value={templateId ?? ""} onValueChange={(v) => setTemplateId(v || null)}>
              <SelectTrigger className="mt-1 min-h-tap"><SelectValue placeholder="ひな形を選ぶ" /></SelectTrigger>
              <SelectContent>
                {(templatesQuery.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templatesQuery.isSuccess && templatesQuery.data.length === 0 && (
              <p className="mt-1 text-sub-sm text-muted-foreground">まだ組織共通のひな形がありません。</p>
            )}
          </div>
        )}

        {source === "copy" && (
          <div>
            <Label>複製する冊子</Label>
            {!ownerReady ? (
              <p className="mt-1 text-sub-sm text-muted-foreground">先に案件／番組を選んでください。</p>
            ) : (
              <>
                <Select value={copyFromManualId ?? ""} onValueChange={(v) => setCopyFromManualId(v || null)}>
                  <SelectTrigger className="mt-1 min-h-tap"><SelectValue placeholder="冊子を選ぶ" /></SelectTrigger>
                  <SelectContent>
                    {pastManuals.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.doc_no ? `${m.doc_no} ` : ""}{m.title || "（無題）"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {pastManualsQuery.isSuccess && pastManuals.length === 0 && (
                  <p className="mt-1 text-sub-sm text-muted-foreground">この案件／番組にはまだ冊子がありません。</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </FormDialog>
  );
}
