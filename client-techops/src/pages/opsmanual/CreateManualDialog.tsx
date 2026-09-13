// 運営マニュアルの新規作成。**案件／番組が決まっているときはここを通らない**
// （一覧の「マニュアルを作る」が訊かずに作る・`ManualListPage.tsx`）。
// このダイアログが出るのは次の2つだけ:
//   ① 一覧を絞り込まずに開いていて、どの案件のものか決まっていないとき
//   ② 「前回・テンプレートから」を選んだとき
//
// ⚠️ タイトルと本番の予定日は**訊かない**。マニュアルは必ず案件か番組にぶら下がるので、
// どちらも作る前から分かっている（`GET /lookup/:id/context`）。あとから直すのは詳細画面の
// その場編集（タイトル）と `ManualServiceDateField`（予定日）で足りる。
// 先に同じ直しをしたのがスケジュール表（`CreateScheduleDialog.tsx`・codex 棚卸し #325
// 「案件から引けるのに手入力」）。
//
// §10-5 の割り切りどおり、「テンプレート」と「前回のマニュアルから」は別経路（前者は
// `templateId`＝`qsheet_manual_templates` 経由、後者は `copyFromManualId`＝実在する
// `qsheet_manuals` を直接複製）だが、利用者からは1つの2択に見せる。
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import { ToggleButtonGroup } from "@gmo-onair/shared/src/client/ui/toggle-button-group";
import type { ManualListItem } from "@gmo-onair/shared/src/opsmanual/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ManualOwnerFields, { type ManualOwnerValue } from "@/components/opsmanual/ManualOwnerFields";
import { notifyError } from "@/lib/notify";
import * as manualApi from "@/lib/manualApi";
import * as programsApi from "@/lib/programsApi";
import * as scheduleApi from "@/lib/scheduleApi";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `?project=`/`?program=` で絞り込まれているとき。案件/番組の選び直しはさせない */
  lockedOwner?: { projectId?: string | null; programId?: string | null; label: string };
  /** 「前回・テンプレートから」から開いたときの初期選択 */
  initialSource?: ManualSource;
  onCreated: (manual: ManualListItem) => void;
}

type ManualSource = "blank" | "template" | "copy";

function initialOwner(lockedOwner?: Props["lockedOwner"]): ManualOwnerValue {
  if (lockedOwner?.programId) return { ownerType: "program", projectId: null, programId: lockedOwner.programId };
  return { ownerType: "project", projectId: lockedOwner?.projectId ?? null, programId: null };
}

export default function CreateManualDialog({ open, onOpenChange, lockedOwner, initialSource, onCreated }: Props) {
  const [owner, setOwner] = useState<ManualOwnerValue>(() => initialOwner(lockedOwner));
  const [source, setSource] = useState<ManualSource>(initialSource ?? "blank");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [copyFromManualId, setCopyFromManualId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setOwner(initialOwner(lockedOwner));
    setSource(initialSource ?? "blank");
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

  // 「前回のマニュアル」の候補は、いま選んでいる案件／番組の既存の一覧をそのまま使う
  // （production-manual.md §6①「前回のマニュアル」の一覧はGET /manuals?project=…の既存の一覧APIをそのまま使ってよい）
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

  // タイトルと本番の予定日は、選ばれた案件／番組から引く（手で打たせない・冒頭コメント参照）
  const projectCtxQuery = useQuery({
    queryKey: ["lookup", "project-context", owner.projectId],
    queryFn: () => scheduleApi.getProjectContext(owner.projectId as string),
    enabled: open && owner.ownerType === "project" && !!owner.projectId,
  });
  const programQuery = useQuery({
    queryKey: ["techops", "program", owner.programId],
    queryFn: () => programsApi.getProgram(owner.programId as string),
    enabled: open && owner.ownerType === "program" && !!owner.programId,
  });
  // ⚠️ タイトル・予定日を訊かない作りなので、**事実を読み終わる前に作らせない**。
  // 読み込み中に押せると、既定の「運営マニュアル」と日付なしで作られ、しかも直す欄がここに無い
  // （レビュー指摘）。読み終わるか、失敗したときだけ押せるようにする（失敗時は既定値で作れる）。
  const ownerCtxQuery = owner.ownerType === "project" ? projectCtxQuery : programQuery;
  const ownerCtxReady = !ownerReady || ownerCtxQuery.isSuccess || ownerCtxQuery.isError;
  const ownerName = projectCtxQuery.data?.name ?? programQuery.data?.name ?? lockedOwner?.label ?? null;
  const serviceDate = owner.ownerType === "project"
    ? projectCtxQuery.data?.performanceDates[0] ?? projectCtxQuery.data?.eventStart ?? null
    : programQuery.data?.event_date ?? null;

  const createMutation = useMutation({
    mutationFn: () => manualApi.createManual({
      title: ownerName ?? "運営マニュアル",
      project_id: owner.ownerType === "project" ? owner.projectId : null,
      program_id: owner.ownerType === "program" ? owner.programId : null,
      service_date: serviceDate,
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
      onSubmit={(e) => { e.preventDefault(); if (ownerReady && sourceReady && ownerCtxReady) createMutation.mutate(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" className="min-h-tap" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>閉じる</Button>
          <Button type="submit" className="min-h-tap" disabled={createMutation.isPending || !ownerReady || !sourceReady || !ownerCtxReady}>作る</Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-4">
        <ManualOwnerFields
          value={owner}
          onChange={setOwner}
          locked={!!lockedOwner}
          lockedLabel={lockedOwner?.label}
        />

        <div>
          <Label>作り方</Label>
          <p className="mt-1 text-sub-sm text-muted-foreground">
            タイトルと本番の予定日は案件から入ります（あとで直せます）。
          </p>
          <div className="mt-1">
            <ToggleButtonGroup
              options={[
                { value: "blank", label: "空のマニュアル" },
                { value: "template", label: "組織のテンプレートから" },
                { value: "copy", label: "前回のマニュアルから" },
              ]}
              value={[source]}
              onChange={(next) => {
                const v = next[next.length - 1] as ManualSource | undefined;
                if (v) setSource(v);
              }}
              multi={false}
              cols={{ base: 3 }}
              size="sm"
              ariaLabel="マニュアルの作り方"
            />
          </div>
        </div>

        {source === "template" && (
          <div>
            <Label>テンプレート</Label>
            <Select value={templateId ?? ""} onValueChange={(v) => setTemplateId(v || null)}>
              <SelectTrigger className="mt-1 min-h-tap"><SelectValue placeholder="テンプレートを選ぶ" /></SelectTrigger>
              <SelectContent>
                {(templatesQuery.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templatesQuery.isSuccess && templatesQuery.data.length === 0 && (
              <p className="mt-1 text-sub-sm text-muted-foreground">まだ組織共通のテンプレートがありません。</p>
            )}
          </div>
        )}

        {source === "copy" && (
          <div>
            <Label>複製するマニュアル</Label>
            {!ownerReady ? (
              <p className="mt-1 text-sub-sm text-muted-foreground">先に案件／番組を選んでください。</p>
            ) : (
              <>
                <Select value={copyFromManualId ?? ""} onValueChange={(v) => setCopyFromManualId(v || null)}>
                  <SelectTrigger className="mt-1 min-h-tap"><SelectValue placeholder="マニュアルを選ぶ" /></SelectTrigger>
                  <SelectContent>
                    {pastManuals.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.doc_no ? `${m.doc_no} ` : ""}{m.title || "（無題）"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {pastManualsQuery.isSuccess && pastManuals.length === 0 && (
                  <p className="mt-1 text-sub-sm text-muted-foreground">この案件／番組にはまだマニュアルがありません。</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </FormDialog>
  );
}
