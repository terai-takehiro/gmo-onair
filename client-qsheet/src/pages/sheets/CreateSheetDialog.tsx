// 進行台本の一覧 — 新規作成ダイアログ。旧 DashboardPage.tsx の新規作成フォームをそのまま分割。
//
// ⚠️ 初期値（`data.blocks` の3種・`masters` の空配列）は
// `server/src/contexts/qsheet/services/document-create.service.ts` に置く1本だけを使う
// （01-app-structure.md §7-4「2か所に持たない」）。このコンポーネントはタイトル等の
// メタしか組み立てず、`data` そのものはサーバー任せにする。
import { useEffect, useState } from "react";
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
import { type GlsProject, type EpisodeOption } from "./types";

export function CreateSheetDialog({
  open,
  onOpenChange,
  defaultProjectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** URL の `?project=` フィルタ。渡されていれば「GLS案件に紐付ける」の初期値として使う */
  defaultProjectId?: string | null;
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
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const selectedEpisode = episodes?.find((e) => e.id === selectedEpisodeId);
      const res = await api.post("/qsheet/documents", {
        title: newTitle || "無題のQシート",
        broadcast_date: newBroadcastDate || selectedEpisode?.broadcast_date || null,
        project_id: linkToProject && selectedProjectId ? selectedProjectId : null,
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

  const handleProjectChange = (value: string) => {
    setSelectedProjectId(value);
    setSelectedEpisodeId("");
  };

  const handleEpisodeChange = (value: string) => {
    setSelectedEpisodeId(value);
    if (!newBroadcastDate && value) {
      const ep = episodes?.find((e) => e.id === value);
      if (ep?.broadcast_date) setNewBroadcastDate(ep.broadcast_date);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
              onChange={(e) => setNewTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">撮影場所 <span className="text-destructive">*</span></Label>
            <Input
              className="mt-1"
              placeholder="例：GMOサムライスタジオ用賀"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">放送日 <span className="text-destructive">*</span></Label>
              <Input className="mt-1" type="date" value={newBroadcastDate} onChange={(e) => setNewBroadcastDate(e.target.value)} />
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
              <Input type="date" value={newRecordingDate} onChange={(e) => setNewRecordingDate(e.target.value)} required />
            )}
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground">リハーサル日を設定</span>
              <Switch checked={hasRehearsal} onCheckedChange={(v) => setHasRehearsal(!!v)} />
            </div>
            {hasRehearsal && (
              <Input type="date" value={newRehearsalDate} onChange={(e) => setNewRehearsalDate(e.target.value)} />
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

          <Button
            type="submit"
            disabled={!newTitle.trim() || !newLocation.trim() || !newBroadcastDate || (hasRecording && !newRecordingDate) || createMutation.isPending}
            className="w-full py-2.5 text-sm font-semibold min-h-[44px]"
          >
            {createMutation.isPending ? "作成中..." : "台本を作成"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
