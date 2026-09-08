// 「案件／番組」の選び方。表の設定シートと新規作成ダイアログの両方から使う
// （14-schedule-v2-plan.md §3 A3・A5）。project_id と program_id は同時に立てない
//（migration 227）ので、なし／案件／番組の3択トグル＋対応する選択を1組にまとめてある。
import { useQuery } from "@tanstack/react-query";
import { ToggleButtonGroup } from "@gmo-onair/shared/src/client/ui/toggle-button-group";
import { formGrid2 } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as scheduleApi from "@/lib/scheduleApi";

export type OwnerType = "none" | "project" | "program";
export interface OwnerValue {
  ownerType: OwnerType;
  projectId: string | null;
  programId: string | null;
  /** 案件のときだけ意味を持つ。番組・なしのときは常に null */
  episodeId: string | null;
}

export function ownerValueOf(projectId: string | null | undefined, programId: string | null | undefined, episodeId: string | null | undefined): OwnerValue {
  return {
    ownerType: projectId ? "project" : programId ? "program" : "none",
    projectId: projectId ?? null,
    programId: programId ?? null,
    episodeId: episodeId ?? null,
  };
}

interface Props {
  value: OwnerValue;
  onChange: (next: OwnerValue) => void;
  /** 案件・番組を選び直せない文脈（一覧の絞り込みから来た新規作成など）では固定表示にする */
  locked?: boolean;
  lockedLabel?: string;
}

export default function ScheduleOwnerFields({ value, onChange, locked, lockedLabel }: Props) {
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
  const episodesQuery = useQuery({
    queryKey: ["episode-options", value.projectId],
    queryFn: () => scheduleApi.listEpisodes(value.projectId!),
    enabled: value.ownerType === "project" && !!value.projectId,
  });

  const setOwnerType = (t: OwnerType) => onChange({
    ownerType: t,
    projectId: t === "project" ? value.projectId : null,
    programId: t === "program" ? value.programId : null,
    episodeId: t === "project" ? value.episodeId : null,
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
            options={[{ value: "none", label: "なし" }, { value: "project", label: "案件" }, { value: "program", label: "番組" }]}
            value={[value.ownerType]}
            onChange={(next) => { const t = next[next.length - 1] as OwnerType | undefined; if (t) setOwnerType(t); }}
            multi={false}
            cols={{ base: 3 }}
            size="sm"
            ariaLabel="案件・番組の別"
          />
        </div>
      </div>

      {value.ownerType === "project" && (
        <div className={formGrid2}>
          <div>
            <Label>案件（GLS）</Label>
            <Select value={value.projectId ?? ""} onValueChange={(v) => onChange({ ...value, projectId: v || null, episodeId: null })}>
              <SelectTrigger className="mt-1 min-h-tap"><SelectValue placeholder="案件を選ぶ" /></SelectTrigger>
              <SelectContent>
                {(projectsQuery.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.gls_number ? `${p.gls_number} — ` : ""}{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {value.projectId && (episodesQuery.data ?? []).length > 0 && (
            <div>
              <Label>回（任意）</Label>
              <Select value={value.episodeId ?? ""} onValueChange={(v) => onChange({ ...value, episodeId: v || null })}>
                <SelectTrigger className="mt-1 min-h-tap"><SelectValue placeholder="決めていない" /></SelectTrigger>
                <SelectContent>
                  {(episodesQuery.data ?? []).map((ep) => (
                    <SelectItem key={ep.id} value={ep.id}>{ep.episode_code}{ep.broadcast_date ? ` — ${ep.broadcast_date}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {value.ownerType === "program" && (
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
