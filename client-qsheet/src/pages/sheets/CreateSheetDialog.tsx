// 進行台本の一覧 — 新規作成ダイアログ。旧 DashboardPage.tsx の新規作成フォームをそのまま分割。
//
// ⚠️ 初期値（`data.blocks` の3種・`masters` の空配列）は
// `server/src/contexts/qsheet/services/document-create.service.ts` に置く1本だけを使う
// （01-app-structure.md §7-4「2か所に持たない」）。このコンポーネントはタイトル等の
// メタしか組み立てず、`data` そのものはサーバー任せにする。
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { notifySuccess, notifyError } from "@/lib/notify";
import { Switch } from "@gmo-onair/shared/src/client/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type GlsProject, type EpisodeOption, type ProjectContext } from "./types";

/** 案件・エピソードから自動で入れた欄。**入れたことを画面に出すため**に持つ
 * （黙って入ると誤りに気づけない。`client/src/contexts/finance/.../HandoffDialog.tsx` に倣う）。
 * ユーザーが手で直したらその欄の印を落とす＝注記も消える。 */
type PrefilledField = "title" | "location" | "broadcastDate" | "recordingDate" | "rehearsalDate";

/** どこから入れたか。**放送日・収録日は案件からもエピソードからも入る**ので、
 * 真偽値ではなく出どころを持つ（注記に「どこから来た値か」を出すため）。 */
type PrefillSource = "project" | "episode";

/** 自動入力の注記。エピソードのほうが回ごとに正確なので、そう分かる文言にする。 */
function prefillNote(field: PrefilledField, source: PrefillSource | undefined): string | null {
  if (!source) return null;
  if (source === "episode") return "エピソードから入れました";
  switch (field) {
    case "title": return "GLS案件の名前から入れました。違うときは直してください";
    case "location": return "GLS案件の会場から入れました。違うときは直してください";
    case "broadcastDate": return "GLS案件の日程から入れました";
    case "recordingDate": return "GLS案件の本番日から入れました";
    case "rehearsalDate": return "GLS案件のリハーサル日から入れました";
  }
}

function PrefillNote({ field, source }: { field: PrefilledField; source: PrefillSource | undefined }) {
  const text = prefillNote(field, source);
  return text ? <p className="mt-1 text-xs text-info">{text}</p> : null;
}

export function CreateSheetDialog({
  open,
  onOpenChange,
  defaultProjectId,
  defaultProgramId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** URL の `?project=` フィルタ。渡されていれば「GLS案件に紐付ける」の初期値として使う */
  defaultProjectId?: string | null;
  /** URL の `?program=` フィルタ（番組＝マニュアル・案件管理外）。渡されていれば作成時にそのまま紐付ける。
   * `defaultProjectId` と同時には渡らない（一覧の絞り込みはどちらか一方）ので、UI での選び直しは設けていない */
  defaultProgramId?: string | null;
  onCreated: (doc: { id: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newBroadcastDate, setNewBroadcastDate] = useState("");
  const [newBroadcastStartTime, setNewBroadcastStartTime] = useState("");
  const [hasRecording, setHasRecording] = useState(true);
  const [newRecordingDate, setNewRecordingDate] = useState("");
  const [hasRehearsal, setHasRehearsal] = useState(false);
  const [newRehearsalDate, setNewRehearsalDate] = useState("");
  const [linkToProject, setLinkToProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");
  const [prefilled, setPrefilled] = useState<Partial<Record<PrefilledField, PrefillSource>>>({});

  /** `source` に `null` を渡すと印を落とす（＝注記が消える）。 */
  const markPrefilled = useCallback((field: PrefilledField, source: PrefillSource | null) => {
    setPrefilled((prev) => {
      if ((prev[field] ?? null) === source) return prev;
      const next = { ...prev };
      if (source) next[field] = source;
      else delete next[field];
      return next;
    });
  }, []);

  useEffect(() => {
    if (defaultProjectId) {
      setLinkToProject(true);
      setSelectedProjectId(defaultProjectId);
    }
  }, [defaultProjectId]);

  const { data: glsProjects } = useQuery({
    queryKey: ["gls-options"],
    queryFn: async () => {
      const res = await api.get("/lookup/gls-options");
      return res.data.data as GlsProject[];
    },
    enabled: linkToProject,
  });

  const { data: episodes } = useQuery({
    queryKey: ["episode-options", selectedProjectId],
    queryFn: async () => {
      const res = await api.get(`/lookup/${selectedProjectId}/episodes-options`);
      return res.data.data as EpisodeOption[];
    },
    enabled: !!selectedProjectId,
  });

  /**
   * 案件1件の「台本に要る事実」（会場・本番日・リハ日）。
   * **案件を選んだときに1回だけ**（`enabled` と queryKey で1案件につき1本）。
   * 取れなくても画面は普通に使える — 失敗しても何も出さず、手入力に落ちるだけ
   * （帯を出すのは書き込みの失敗だけ。`shared/src/client/queryClient.ts`）。
   */
  const { data: projectContext } = useQuery({
    queryKey: ["project-context", selectedProjectId],
    queryFn: async () => {
      const res = await api.get(`/lookup/${selectedProjectId}/context`);
      return res.data.data as ProjectContext;
    },
    enabled: !!selectedProjectId,
  });

  /** どの案件の context を反映済みか。**1案件につき1回だけ入れる**ための印
   * （入れたあとユーザーが消した欄を、再描画のたびに書き戻さない）。 */
  const appliedContextRef = useRef<string | null>(null);

  const resetForm = () => {
    setNewTitle("");
    setNewLocation("");
    setNewBroadcastDate("");
    setNewBroadcastStartTime("");
    setHasRecording(true);
    setNewRecordingDate("");
    setHasRehearsal(false);
    setNewRehearsalDate("");
    if (!defaultProjectId) {
      setLinkToProject(false);
      setSelectedProjectId("");
    }
    setSelectedEpisodeId("");
    setPrefilled({});
    appliedContextRef.current = null;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const selectedEpisode = episodes?.find((e) => e.id === selectedEpisodeId);
      const res = await api.post("/qsheet/documents", {
        title: newTitle || "無題のQシート",
        broadcast_date: newBroadcastDate || selectedEpisode?.broadcast_date || null,
        project_id: linkToProject && selectedProjectId ? selectedProjectId : null,
        program_id: !linkToProject && defaultProgramId ? defaultProgramId : null,
        episode_id: linkToProject && selectedEpisodeId ? selectedEpisodeId : null,
        episode_code: linkToProject && selectedEpisode ? selectedEpisode.episode_code : null,
        data: {
          meta: {
            title: newTitle || "無題のQシート",
            draftNumber: 1,
            draftType: "numbered",
            location: newLocation,
            broadcastDate: newBroadcastDate,
            broadcastStartTime: newBroadcastStartTime,
            recordingDate: hasRecording ? newRecordingDate : "",
            rehearsalDate: hasRehearsal ? newRehearsalDate : "",
          },
          blocks: [
            { id: "scenario", type: "scenario", label: "台本", width: 300 },
            { id: "video", type: "video", label: "映像", width: 150 },
            { id: "audio", type: "audio", label: "音声", width: 150 },
          ],
          sections: [],
          masters: { persons: [], video: [], audio: [], telop: [] },
        },
      });
      return res.data.data as { id: string };
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ["qsheet-documents"] });
      onOpenChange(false);
      resetForm();
      notifySuccess("作成しました。このQシートはあなたと管理者のみ閲覧できます（他の人に見せるにはカードの「共有」ボタンから共有してください）");
      onCreated(doc);
    },
    onError: () => {
      notifyError("ドキュメントの作成に失敗しました");
    },
  });

  // **自動入力の作法**（`client/src/contexts/finance/pages/ledger/revenuePrefill.ts` に倣う）:
  // 空欄のときだけ入れる＝ユーザーが打った値は絶対に上書きしない。
  // ただし「前に自動で入れた値」は選び直しに追随してよい（自分で入れたものなので）。
  const canAutofill = useCallback(
    (current: string, field: PrefilledField) => !current || !!prefilled[field],
    [prefilled],
  );

  /**
   * 案件の context が届いたら、空いている欄に入れる。
   *
   * ── 競合をどう防ぐか ──────────────────────────────────
   *
   * ① **世代ガード**: 案件を選び直したあとに前の案件の応答が届いても捨てる
   *    （`ctx.id !== selectedProjectId` なら何もしない）。queryKey も案件ごとに
   *    分かれているが、**入れる直前にもう一度見る**ほうが読んで分かる
   * ② **エピソードが優先**: エピソードは回ごとの日付なので案件の日付より正確。
   *    先にエピソードを選んでいたら（応答が遅れて届いた場合を含む）
   *    放送日・収録日には**触らない**。逆順（案件 → エピソード）は
   *    `canAutofill` が「自分が入れた欄」を許すのでエピソードの値で上書きされる
   * ③ **手で打った値は絶対に上書きしない**: すべて `canAutofill` を通す
   */
  useEffect(() => {
    const ctx = projectContext;
    if (!ctx) return;
    if (ctx.id !== selectedProjectId) return;            // ①
    if (appliedContextRef.current === ctx.id) return;
    appliedContextRef.current = ctx.id;

    if (ctx.venue && canAutofill(newLocation, "location")) {
      setNewLocation(ctx.venue);
      markPrefilled("location", "project");
    }

    // `?.` は保険。壊れた応答（配列でない）でもダイアログを落とさない
    const performanceDate = ctx.performanceDates?.[0] ?? null;
    const episodeOwnsDates = !!selectedEpisodeId;        // ②

    // 放送日は本番日の初日。日程を入れていない案件のために `eventStart` に落とす
    const broadcastDate = performanceDate ?? ctx.eventStart;
    let broadcastAfter = newBroadcastDate;
    if (!episodeOwnsDates && broadcastDate && canAutofill(newBroadcastDate, "broadcastDate")) {
      setNewBroadcastDate(broadcastDate);
      markPrefilled("broadcastDate", "project");
      broadcastAfter = broadcastDate;
    }

    /*
     * 収録日（＝本番日）は**放送日と同じ日になるなら入れない**。
     * 案件からは「本番日」しか分からないので、放送日にも収録日にも同じ日が入る。
     * それは何も教えていないうえに、生放送の案件では
     * 「収録日を設定（生放送の場合はOFF）」を利用者が消して回ることになる。
     * 放送日が本番日と違うとき（後日放送・エピソードで別途決まっているとき）だけ
     * 入れれば、入った値が必ず意味を持つ。
     */
    if (
      !episodeOwnsDates &&
      performanceDate &&
      performanceDate !== broadcastAfter &&
      canAutofill(newRecordingDate, "recordingDate")
    ) {
      setNewRecordingDate(performanceDate);
      markPrefilled("recordingDate", "project");
      setHasRecording(true);
    }

    // リハ日はエピソードが持っていないので、エピソードを選んでいても入れてよい
    const rehearsalDate = ctx.rehearsalDates?.[0];
    if (rehearsalDate && canAutofill(newRehearsalDate, "rehearsalDate")) {
      setNewRehearsalDate(rehearsalDate);
      markPrefilled("rehearsalDate", "project");
      setHasRehearsal(true);
    }
  }, [
    projectContext, selectedProjectId, selectedEpisodeId,
    newLocation, newBroadcastDate, newRecordingDate, newRehearsalDate,
    canAutofill, markPrefilled,
  ]);

  const handleProjectChange = (value: string) => {
    setSelectedProjectId(value);
    setSelectedEpisodeId("");
    // 選び直したら context をもう一度反映する（上の useEffect が入れる）
    appliedContextRef.current = null;
    // 番組名を案件名で埋める（`/lookup/gls-options` が `name` を返している）
    const project = glsProjects?.find((p) => p.id === value);
    if (project?.name && canAutofill(newTitle, "title")) {
      setNewTitle(project.name);
      markPrefilled("title", "project");
    }
  };

  const handleEpisodeChange = (value: string) => {
    setSelectedEpisodeId(value);
    if (!value) return;
    const ep = episodes?.find((e) => e.id === value);
    if (!ep) return;
    if (ep.broadcast_date && canAutofill(newBroadcastDate, "broadcastDate")) {
      setNewBroadcastDate(ep.broadcast_date);
      markPrefilled("broadcastDate", "episode");
    }
    // `/lookup/:projectId/episodes-options` は `recording_date` も返している
    // （server/src/contexts/platform/routes/lookup.routes.ts・`episodes.recording_date` は TEXT の 'YYYY-MM-DD'）
    if (ep.recording_date && canAutofill(newRecordingDate, "recordingDate")) {
      setNewRecordingDate(ep.recording_date);
      markPrefilled("recordingDate", "episode");
      setHasRecording(true);
    }
  };

  // 収録日は任意（サーバーの document-create.service.ts も必須にしていない）。
  // 押せない理由が見えるよう、足りない必須項目だけを名前で出す。
  const missingRequired = [
    !newTitle.trim() && "番組名",
    !newLocation.trim() && "撮影場所",
    !newBroadcastDate && "放送日",
  ].filter(Boolean) as string[];

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新規台本作成</DialogTitle>
          <DialogDescription>
            作成したQシートは最初あなた（と管理者）だけが閲覧できます。他の人に見せるには、作成後にカードの「共有」ボタンから共有してください。
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4 pt-2"
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
        >
          <div>
            <Label className="text-xs text-muted-foreground">番組名 <span className="text-destructive">*</span></Label>
            <Input
              className="mt-1"
              placeholder="例：サンプル情報バラエティ"
              value={newTitle}
              onChange={(e) => { setNewTitle(e.target.value); markPrefilled("title", null); }}
              autoFocus
            />
            <PrefillNote field="title" source={prefilled.title} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">撮影場所 <span className="text-destructive">*</span></Label>
            <Input
              className="mt-1"
              placeholder="例：GMOサムライスタジオ用賀"
              value={newLocation}
              onChange={(e) => { setNewLocation(e.target.value); markPrefilled("location", null); }}
            />
            <PrefillNote field="location" source={prefilled.location} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">放送日 <span className="text-destructive">*</span></Label>
              <Input
                className="mt-1"
                type="date"
                value={newBroadcastDate}
                onChange={(e) => { setNewBroadcastDate(e.target.value); markPrefilled("broadcastDate", null); }}
              />
              <PrefillNote field="broadcastDate" source={prefilled.broadcastDate} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">放送開始時刻</Label>
              <Input className="mt-1" type="time" value={newBroadcastStartTime} onChange={(e) => setNewBroadcastStartTime(e.target.value)} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground">収録日を設定（生放送の場合はOFF）</span>
              <Switch checked={hasRecording} onCheckedChange={(v) => setHasRecording(!!v)} />
            </div>
            {hasRecording && (
              <>
                <Label className="text-xs text-muted-foreground">収録日</Label>
                <Input
                  className="mt-1"
                  type="date"
                  value={newRecordingDate}
                  onChange={(e) => { setNewRecordingDate(e.target.value); markPrefilled("recordingDate", null); }}
                />
                <PrefillNote field="recordingDate" source={prefilled.recordingDate} />
              </>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground">リハーサル日を設定</span>
              <Switch checked={hasRehearsal} onCheckedChange={(v) => setHasRehearsal(!!v)} />
            </div>
            {hasRehearsal && (
              <>
                <Label className="text-xs text-muted-foreground">リハーサル日</Label>
                <Input
                  className="mt-1"
                  type="date"
                  value={newRehearsalDate}
                  onChange={(e) => { setNewRehearsalDate(e.target.value); markPrefilled("rehearsalDate", null); }}
                />
                <PrefillNote field="rehearsalDate" source={prefilled.rehearsalDate} />
              </>
            )}
          </div>

          {/* GLS Project Linking */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">GLS案件に紐付ける</span>
              </div>
              <Switch
                checked={linkToProject}
                onCheckedChange={(v) => {
                  setLinkToProject(!!v);
                  if (!v) {
                    if (!defaultProjectId) setSelectedProjectId("");
                    setSelectedEpisodeId("");
                  }
                }}
              />
            </div>

            {linkToProject && (
              <div className="mt-3 space-y-3 pl-6">
                <div>
                  <Label className="text-xs text-muted-foreground">GLS案件</Label>
                  <Select value={selectedProjectId} onValueChange={handleProjectChange}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="案件を選択..." />
                    </SelectTrigger>
                    <SelectContent>
                      {glsProjects?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.gls_number} — {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedProjectId && episodes && episodes.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">エピソード（任意）</Label>
                    <Select value={selectedEpisodeId} onValueChange={handleEpisodeChange}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="エピソードを選択..." />
                      </SelectTrigger>
                      <SelectContent>
                        {episodes.map((ep) => (
                          <SelectItem key={ep.id} value={ep.id}>
                            {ep.episode_code}
                            {ep.broadcast_date && ` — ${ep.broadcast_date}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>

          {missingRequired.length > 0 && (
            <p className="text-xs text-destructive" role="alert">
              未入力：{missingRequired.join("・")}
            </p>
          )}

          <Button
            type="submit"
            disabled={missingRequired.length > 0 || createMutation.isPending}
            className="w-full py-2.5 text-sm font-semibold min-h-[44px]"
          >
            {createMutation.isPending ? "作成中..." : "台本を作成"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
