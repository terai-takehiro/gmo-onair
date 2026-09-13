// 「案件／番組」の選び方（冊子の新規作成用）。`ScheduleOwnerFields.tsx` と同じ作法だが、
// 冊子は project_id / program_id の**どちらか1つを必ず持つ**（qsheet_manuals_owner_ck）ため、
// スケジュール表版にある「なし」は無い（2択のみ）。案件・番組の候補一覧は同じ `/lookup`・
// `/techops/programs` を叩くだけなので、取得関数は `scheduleApi.ts` のものをそのまま使う
// （複製しない）。
import { useQuery } from "@tanstack/react-query";
import { ToggleButtonGroup } from "@gmo-onair/shared/src/client/ui/toggle-button-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as scheduleApi from "@/lib/scheduleApi";

export type ManualOwnerType = "project" | "program";
export interface ManualOwnerValue {
  ownerType: ManualOwnerType;
  projectId: string | null;
  programId: string | null;
}

interface Props {
  value: ManualOwnerValue;
  onChange: (next: ManualOwnerValue) => void;
  /** 一覧の絞り込みから来た新規作成では固定表示にする */
  locked?: boolean;
  lockedLabel?: string;
}

export default function ManualOwnerFields({ value, onChange, locked, lockedLabel }: Props) {
  const projectsQuery = useQuery({
    queryKey: ["gls-options"],
    queryFn: scheduleApi.listGlsProjects,
    enabled: value.ownerType === "project",
  });
  const programsQuery = useQuery({
    queryKey: ["techops-programs"],
    queryFn: scheduleApi.listPrograms,
    enabled: value.ownerType === "program",
  });

  if (locked) {
    return (
      <div>
        <Label>案件／番組</Label>
        <p className="mt-1 min-h-tap rounded-control-lg border border-input bg-muted/40 px-3 py-2.5 text-sm text-foreground">
          {lockedLabel ?? "（この一覧の絞り込みに従います）"}
        </p>
      </div>
    );
  }

  return (
    <>
      <div>
        <Label>案件／番組</Label>
        <div className="mt-1">
          <ToggleButtonGroup
            options={[{ value: "project", label: "案件" }, { value: "program", label: "番組" }]}
            value={[value.ownerType]}
            onChange={(next) => {
              const t = next[next.length - 1] as ManualOwnerType | undefined;
              if (t) onChange({ ownerType: t, projectId: t === "project" ? value.projectId : null, programId: t === "program" ? value.programId : null });
            }}
            multi={false}
            cols={{ base: 2 }}
            size="sm"
            ariaLabel="案件・番組の別"
          />
        </div>
      </div>

      {value.ownerType === "project" ? (
        <div>
          <Label>案件（GLS）</Label>
          <Select value={value.projectId ?? ""} onValueChange={(v) => onChange({ ...value, projectId: v || null })}>
            <SelectTrigger className="mt-1 min-h-tap"><SelectValue placeholder="案件を選ぶ" /></SelectTrigger>
            <SelectContent>
              {(projectsQuery.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.gls_number ? `${p.gls_number} — ` : ""}{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div>
          <Label>番組</Label>
          <Select value={value.programId ?? ""} onValueChange={(v) => onChange({ ...value, programId: v || null })}>
            <SelectTrigger className="mt-1 min-h-tap"><SelectValue placeholder="番組を選ぶ" /></SelectTrigger>
            <SelectContent>
              {(programsQuery.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}
