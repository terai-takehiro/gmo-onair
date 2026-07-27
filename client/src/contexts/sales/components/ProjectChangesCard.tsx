/**
 * 案件の変更の記録 (B4)
 *
 * **主要な項目だけ**を残している。全列を残すと履歴が伸びて読めなくなり、
 * 「なぜこの金額になったのか」を探せなくなる = 履歴の目的を失う。
 *
 * 履歴が空のときは**記録を始めた時期を断る**。空の一覧をそのまま見せると
 * 「変更が無かった」と誤解される (v2.9.270 の権限履歴と同じ扱い)。
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, ChevronDown, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ChangeRow {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  field: string;
  field_label: string;
  before_label: string | null;
  after_label: string | null;
  changed_at: string;
}

/** 記録している項目 (画面にも出して「これしか残らない」ことを伝える) */
const TRACKED = "案件名・ステージ・お客様・主担当・実施日・想定金額・案件種別・GLS番号・案件分類";

function when(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ProjectChangesCard({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const { data: rows = [], isLoading } = useQuery<ChangeRow[]>({
    queryKey: ["project-changes", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/changes`)).data.data,
    enabled: open,
    refetchOnMount: "always",
  });

  return (
    <Card>
      {/*
        畳んだときは**見出しの帯だけ**になる。`CardHeader` の既定は上下24pxで、
        `pb-0` を足すと上だけ空いて中身が下に寄る (畳んだ状態が空の箱に見えていた)。
        デザインの決まりどおり **帯の高さを48pxで固定**し、左右だけ余白を持たせる。
      */}
      <CardHeader className="space-y-0 p-0">
        <CardTitle className="text-base">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-ctl-5 w-full items-center gap-2 px-4 text-left sm:px-6"
            aria-expanded={open}
          >
            <History className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="shrink-0">変更の記録</span>
            <span className="min-w-0 truncate text-[12px] font-normal text-muted-foreground">
              誰が・いつ・何を変えたか
            </span>
            {open ? (
              <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
          </button>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-2 px-4 pb-4 pt-1 sm:px-6 sm:pb-6">
          {isLoading ? (
            <p className="text-[13px] text-secondary-foreground">読み込んでいます…</p>
          ) : rows.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              記録がありません。
              <span className="font-bold">記録を始めたのは v2.9.274 からなので、それより前に変えた分は残っていません</span>
              （「変更が無かった」ではありません）。
            </p>
          ) : (
            <ul className="divide-y divide-divider">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
                  <span className="text-[12px] text-muted-foreground">{when(r.changed_at)}</span>
                  <span className="text-[13px] font-bold text-foreground">{r.actor_name ?? "不明"}</span>
                  <span className="text-[13px] text-secondary-foreground">が</span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[12px] font-bold text-secondary-foreground">
                    {r.field_label}
                  </span>
                  <span className="text-[13px] text-foreground">
                    {r.before_label ?? "未設定"}
                    <span className="mx-1 text-muted-foreground">→</span>
                    <span className="font-bold">{r.after_label ?? "未設定"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[12px] text-muted-foreground">
            残しているのは <span className="font-bold">{TRACKED}</span> だけです
            （全部残すと履歴が伸びて読めなくなるため）。備考やタグの変更は記録していません。
          </p>
        </CardContent>
      )}
    </Card>
  );
}

export default ProjectChangesCard;
