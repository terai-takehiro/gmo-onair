import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { localDateStr, addMinutesToTimeStr } from "@/lib/format";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Trash2, CloudDownload, Users, Check, CloudUpload, UserMinus } from "lucide-react";
import type { PersonalEvent } from "./scheduleShared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: PersonalEvent | null;
  /** カレンダーの日付選択から渡す初期値 (YYYY-MM-DD, end は inclusive) */
  presetRange?: { start: string; end: string; allDay: boolean } | null;
}

interface OAuthStatus { configured: boolean; connected: boolean; can_write?: boolean; }

// マイカレンダーの個人予定 ダイアログ。
// - 外部同期分 (source='ics' / 'google' / 'outlook') は読み取り専用 (削除のみ可)。
// - 手入力予定は作成者が「共有先メンバー」を選べる (パートナー権限保持者から選択)。
// - 共有された側 (受け手) は内容を編集できるが、共有先の変更・予定の削除はできず
//   「自分のカレンダーから外す」のみ。
//   ⚠️ **文言は「結果の差」が読めるように書く**（2026-09-05 の用語棚卸し）。
//   1つのダイアログに「同期された予定」「共有された予定」「共有から外す」「削除」が同居し、
//   押したあと何が起きるか（自分だけ消えるのか全員から消えるのか）が読めなかった。
//   受け手 = 「自分のカレンダーから外す」／作成者 = 「予定を削除」(全員から消える) と書き分ける。
// - 書き込み連携済みの Google/Outlook があれば、保存時に外部カレンダーにも反映される。
export default function PersonalEventDialog({ open, onOpenChange, editing, presetRange }: Props) {
  const qc = useQueryClient();
  const isExternalSynced = editing?.source === "ics" || editing?.source === "google" || editing?.source === "outlook";
  const isSharedIn = !!editing && editing.is_owner === false; // 自分に共有された (別ユーザー作成)
  const isOwner = !editing || editing.is_owner !== false;      // 新規 or 自分が作成

  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [shareIds, setShareIds] = useState<string[]>([]);
  const [shareSearch, setShareSearch] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // **終了時刻を手で直したか。** 真っさらな新規作成（時刻指定の無いプリセット含む）
  // だけ false から始め、開始時刻を動かすと終了時刻が「開始の1時間後」に追従する。
  // 編集時・時刻付きプリセット（週表の空きマスなぞり）は指定/既存の値を保つ
  const endTimeTouchedRef = useRef(true);

  // 共有先候補 = パートナースケジュール権限保持者
  const { data: partnerUsers = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["partner-schedule-users"],
    queryFn: async () => (await api.get("/users/by-module/partner_schedule")).data.data,
    enabled: open && isOwner && !isExternalSynced,
    staleTime: 5 * 60 * 1000,
  });

  // 書き込み連携の有無 (書き戻し案内の表示判定)
  const { data: google } = useQuery<OAuthStatus>({
    queryKey: ["google-cal-status"],
    queryFn: async () => (await api.get("/schedule/google/status")).data.data,
    enabled: open && isOwner && !isExternalSynced,
    staleTime: 60 * 1000,
  });
  const { data: outlook } = useQuery<OAuthStatus>({
    queryKey: ["ms-cal-status"],
    queryFn: async () => (await api.get("/schedule/ms/status")).data.data,
    enabled: open && isOwner && !isExternalSynced,
    staleTime: 60 * 1000,
  });
  const writeTarget = google?.can_write ? "Google" : outlook?.can_write ? "Outlook" : null;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setShareSearch("");
    endTimeTouchedRef.current = true; // 既定は「触られていない」= true。新規作成の分岐だけ下で false に落とす
    if (editing) {
      setTitle(editing.title);
      setAllDay(!!editing.all_day);
      const [sd, st] = editing.start_time.split("T");
      const [ed, et] = editing.end_time.split("T");
      setStartDate(sd); setEndDate(ed);
      setStartTime(st?.slice(0, 5) || "10:00");
      setEndTime(et?.slice(0, 5) || "11:00");
      setLocation(editing.location || "");
      setNotes(editing.notes || "");
      const ids = (editing.shared_with || []).map((s) => s.id);
      setShareIds(ids);
      setShowShare(ids.length > 0);
    } else {
      // **`toISOString` を使わない** — 深夜0時〜朝9時 (JST) に開くと UTC に寄って前日になる
      const today = localDateStr(new Date());
      setTitle("");
      setAllDay(presetRange?.allDay ?? false);
      setStartDate(presetRange?.start?.split("T")[0] || today);
      setEndDate(presetRange?.end?.split("T")[0] || presetRange?.start?.split("T")[0] || today);
      setStartTime(presetRange?.start?.split("T")[1]?.slice(0, 5) || "10:00");
      setEndTime(presetRange?.end?.split("T")[1]?.slice(0, 5) || "11:00");
      setLocation(""); setNotes(""); setShareIds([]); setShowShare(false);
      // 時刻付きのプリセット（週表の空きマスなぞり）はその時刻を保つ。
      // 日付だけ・真っさらな新規作成は、開始時刻を動かすと終了時刻が追従する
      endTimeTouchedRef.current = !!presetRange?.start?.includes("T");
    }
  }, [open, editing, presetRange]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        all_day: allDay,
        start_time: allDay ? startDate : `${startDate}T${startTime}`,
        end_time: allDay ? (endDate || startDate) : `${endDate || startDate}T${endTime}`,
        location: location.trim() || null,
        notes: notes.trim() || null,
      };
      // 共有先の指定は作成者のみ (受け手は再共有できない)
      if (isOwner) payload.share_user_ids = shareIds;
      if (editing) return api.put(`/schedule/personal/${editing.id}`, payload);
      return api.post("/schedule/personal", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personal-events"] });
      onOpenChange(false);
    },
    onError: (err: any) => setError(err?.response?.data?.error?.message || "予定を保存できませんでした。入力の内容を確かめてもう一度お試しください。"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/schedule/personal/${editing!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personal-events"] });
      onOpenChange(false);
    },
    onError: (err: any) => setError(err?.response?.data?.error?.message || "予定を削除できませんでした。少し時間をおいてもう一度お試しください。"),
  });

  // **UI 側（下の日付欄 onChange）で前後関係を補正しているが、念のためここでも見る。**
  // `min` 属性はカレンダー UI の選択しか止めず、キーボードで日付欄を直接打ち直すと
  // すり抜けるため（HTML5 の制約検証はブラウザの標準吹き出しで止まり、この画面の
  // エラー表示には出てこない）
  const canSubmit = !!title.trim() && !!startDate && (!endDate || endDate >= startDate);

  const filteredUsers = useMemo(() => {
    const q = shareSearch.trim().toLowerCase();
    return partnerUsers.filter((u) => !q || u.name.toLowerCase().includes(q));
  }, [partnerUsers, shareSearch]);

  const toggleShare = (id: string) =>
    setShareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? (isExternalSynced ? "取り込んだ予定" : isSharedIn ? "共有された予定" : "個人予定を編集") : "個人予定を登録"}
      size="lg"
      /* Enterキーで登録できるようにする（`FormDialog` の `onSubmit` は opt-in）。
         送信ボタンは `type="submit"` にして `onClick` を外してある — 両方あると二重送信になる */
      onSubmit={(e) => {
        e.preventDefault();
        if (isExternalSynced || !canSubmit || saveMutation.isPending) return;
        saveMutation.mutate();
      }}
      sub={
        isSharedIn
          ? "ほかの人から共有された予定です。内容は編集できます。消せるのは作成者だけで、あなたは自分のカレンダーから外せます。"
          : "個人予定はあなたと共有先のメンバーにのみ表示されます。"
      }
      footer={
        <FormDialogFooter>
          {editing && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10 sm:mr-auto"
              onClick={() => {
                const msg = isSharedIn
                  ? "この予定を自分のカレンダーから外しますか？（ほかの人のカレンダーには残ります）"
                  : "この予定を削除しますか？全員のカレンダーから消えます。";
                if (confirm(msg)) deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" />
                : isSharedIn ? <UserMinus className="mr-1 h-4 w-4" /> : <Trash2 className="mr-1 h-4 w-4" />}
              {isSharedIn ? "自分のカレンダーから外す" : "予定を削除"}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {isExternalSynced ? "閉じる" : "キャンセル"}
          </Button>
          {!isExternalSynced && (
            <Button type="submit" disabled={!canSubmit || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {editing ? "保存" : "登録"}
            </Button>
          )}
        </FormDialogFooter>
      }
    >
        {isExternalSynced && (
          <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
            <CloudDownload className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {editing?.feed_label || "外部カレンダー"} から取り込んだ予定です。内容の変更は Outlook・Google 側で行ってください
              （ここで削除しても、元のカレンダーに残っていれば次の取り込みで戻ってきます）。
            </span>
          </div>
        )}

        {isSharedIn && (
          <div className="flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-800">
            <Users className="h-4 w-4 shrink-0 mt-0.5" />
            <span>共有元: <b>{editing?.owner_name || "他のメンバー"}</b> ／ この予定はメンバー間で共有されています。</span>
          </div>
        )}

        {/* 外部カレンダーへの書き戻し案内。
            **他の2つの帯と同じくフォーム本体の前に置く。** 「保存先がもう1つ増える」は
            入力を始める前に知りたいことなのに、以前は共有先のさらに下＝最下段にあり、
            全部入力してスクロールしないと読めなかった */}
        {isOwner && !isExternalSynced && writeTarget && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-[11px] text-emerald-800">
            <CloudUpload className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>この予定は連携中の <b>{writeTarget}</b> カレンダーにも自動で反映されます。</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>タイトル</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={isExternalSynced} placeholder="例：歯医者 / 定例会議" />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={allDay} onCheckedChange={setAllDay} id="pe-allday" disabled={isExternalSynced} />
            <Label htmlFor="pe-allday">終日</Label>
          </div>

          {/* 日時は**境界ごとに1行**（開始＝日＋時刻／終了＝日＋時刻）。
              以前は「日付の行／時刻の行」というマトリクス組みで、スマホ（1列）では
              開始日→**終了日**→開始時刻→終了時刻 と落ち、開始日のすぐ下が終了日になっていた。
              同じアプリのスタジオ予約は境界ごとの組みで、日時の読み方が2通りあった
              （`docs/design/v4/_form-order.md` 2-3「期間は開始→終了」） */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>開始</Label>
              <div className="flex gap-2">
                <Input type="date" className="min-w-0 flex-1" value={startDate} disabled={isExternalSynced} onChange={(e) => {
                  const v = e.target.value;
                  setStartDate(v);
                  if (!endDate || endDate < v) setEndDate(v);
                }} />
                {!allDay && (
                  <Input type="time" className="w-28 shrink-0" value={startTime} disabled={isExternalSynced} onChange={(e) => {
                    const v = e.target.value;
                    setStartTime(v);
                    // **終了時刻を手で直していなければ「開始の1時間後」に追従**
                    if (!endTimeTouchedRef.current) setEndTime(addMinutesToTimeStr(v, 60));
                  }} />
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>終了</Label>
              <div className="flex gap-2">
                <Input
                  type="date" className="min-w-0 flex-1" value={endDate} min={startDate} disabled={isExternalSynced}
                  onChange={(e) => {
                    const v = e.target.value;
                    // **`min` はカレンダー UI の選択しか止めない。** キーボードで
                    // 開始日より前の日付を直接打ち込んでもすり抜けるため、ここでも弾く
                    setEndDate(v < startDate ? startDate : v);
                  }}
                />
                {!allDay && (
                  <Input
                    type="time" className="w-28 shrink-0" value={endTime} disabled={isExternalSynced}
                    onChange={(e) => { endTimeTouchedRef.current = true; setEndTime(e.target.value); }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* 共有先 (作成者のみ・手入力予定のみ)。
              **場所・メモより前に置く**（`_form-order.md` 段4「誰が」）。
              共有先は「この予定を誰が見て、誰が直せるか」を決める設定で、
              任意の補足（場所・メモ）より先に決めるもの。以前は末尾の畳んだ枠にあり、
              共有し忘れたまま登録されていた */}
          {isOwner && !isExternalSynced && (
            <div className="space-y-2 rounded-lg border p-3">
              <button
                type="button"
                onClick={() => setShowShare((v) => !v)}
                className="flex w-full items-center gap-2 text-sm font-medium"
              >
                <Users className="h-4 w-4 text-primary" />
                メンバーに共有
                {shareIds.length > 0 && (
                  <span className="rounded-full bg-purple-600/15 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                    {shareIds.length} 名
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{showShare ? "閉じる" : "開く"}</span>
              </button>
              {showShare && (
                <div className="space-y-2">
                  <Input
                    value={shareSearch}
                    onChange={(e) => setShareSearch(e.target.value)}
                    placeholder="メンバーを検索"
                    className="h-9"
                  />
                  <div className="max-h-44 space-y-1 overflow-y-auto">
                    {filteredUsers.length === 0 ? (
                      <p className="py-2 text-center text-xs text-muted-foreground">対象のメンバーがいません</p>
                    ) : (
                      filteredUsers.map((u) => {
                        const on = shareIds.includes(u.id);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => toggleShare(u.id)}
                            className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                              on ? "border-purple-400 bg-purple-50 text-purple-800" : "hover:bg-accent"
                            }`}
                          >
                            <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? "border-purple-500 bg-purple-500 text-white" : "border-muted-foreground/40"}`}>
                              {on && <Check className="h-3 w-3" />}
                            </span>
                            {u.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    共有すると、選んだメンバーのマイカレンダーに表示され、メンバーも内容を編集できます。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 補足（任意）は最後にまとめる（`_form-order.md` 段6） */}
          <div className="space-y-1.5">
            <Label>場所（任意）</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} disabled={isExternalSynced} />
          </div>
          <div className="space-y-1.5">
            <Label>メモ（任意）</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={isExternalSynced} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    </FormDialog>
  );
}
