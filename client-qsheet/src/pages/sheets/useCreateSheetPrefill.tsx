// 新規台本作成ダイアログ — 「案件・エピソードから自動で入れる」仕組みだけを集めたもの。
//
// なぜ CreateSheetDialog.tsx から分けたか:
//   自動入力は「どの欄に・どこから・いつ入れてよいか」という規則の塊で、
//   フォームの見た目（入力欄の並び）とは別の関心事。同居させると
//   ダイアログが 400 行を超え、1か所直すのに全部読むことになる
//   （scripts/check-file-size.mjs）。ここに規則を閉じ込め、
//   ダイアログ側は「いまの値と setter を渡してフックを呼ぶ」だけにする。
//
// ⚠️ ここに書いてある規則（手入力を上書きしない・エピソード優先・世代ガード）は
//    どれも**実際に壊れた順番**を防ぐためにある。消すと再発するので、
//    直すときは下のコメントを読んでから。
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { type EpisodeOption, type GlsProject, type ProjectContext } from "./types";

/** 案件・エピソードから自動で入れた欄。**入れたことを画面に出すため**に持つ
 * （黙って入ると誤りに気づけない。`client/src/contexts/finance/.../HandoffDialog.tsx` に倣う）。
 * ユーザーが手で直したらその欄の印を落とす＝注記も消える。 */
export type PrefilledField = "title" | "location" | "broadcastDate" | "recordingDate" | "rehearsalDate";

/** どこから入れたか。**放送日・収録日は案件からもエピソードからも入る**ので、
 * 真偽値ではなく出どころを持つ（注記に「どこから来た値か」を出すため）。 */
export type PrefillSource = "project" | "episode";

/** 自動入力の注記。エピソードのほうが回ごとに正確なので、そう分かる文言にする。 */
export function prefillNote(field: PrefilledField, source: PrefillSource | undefined): string | null {
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

export function PrefillNote({ field, source }: { field: PrefilledField; source: PrefillSource | undefined }) {
  const text = prefillNote(field, source);
  return text ? <p className="mt-1 text-xs text-info">{text}</p> : null;
}

/** フックに渡すもの。**いまの値**（上書きしてよいかの判定に要る）と
 * **setter**（入れるため）を素通しで受け取る。フォームの state は
 * ダイアログ側に置いたままにして、このフックは「規則」だけを持つ。 */
export interface CreateSheetPrefillArgs {
  selectedProjectId: string;
  selectedEpisodeId: string;
  values: {
    title: string;
    location: string;
    broadcastDate: string;
    recordingDate: string;
    rehearsalDate: string;
  };
  setTitle: (v: string) => void;
  setLocation: (v: string) => void;
  setBroadcastDate: (v: string) => void;
  setRecordingDate: (v: string) => void;
  setRehearsalDate: (v: string) => void;
  setHasRecording: (v: boolean) => void;
  setHasRehearsal: (v: boolean) => void;
}

export function useCreateSheetPrefill({
  selectedProjectId,
  selectedEpisodeId,
  values,
  setTitle,
  setLocation,
  setBroadcastDate,
  setRecordingDate,
  setRehearsalDate,
  setHasRecording,
  setHasRehearsal,
}: CreateSheetPrefillArgs) {
  const { title: newTitle, location: newLocation, broadcastDate: newBroadcastDate,
    recordingDate: newRecordingDate, rehearsalDate: newRehearsalDate } = values;

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
      setLocation(ctx.venue);
      markPrefilled("location", "project");
    }

    // `?.` は保険。壊れた応答（配列でない）でもダイアログを落とさない
    const performanceDate = ctx.performanceDates?.[0] ?? null;
    const episodeOwnsDates = !!selectedEpisodeId;        // ②

    // 放送日は本番日の初日。日程を入れていない案件のために `eventStart` に落とす
    const broadcastDate = performanceDate ?? ctx.eventStart;
    let broadcastAfter = newBroadcastDate;
    if (!episodeOwnsDates && broadcastDate && canAutofill(newBroadcastDate, "broadcastDate")) {
      setBroadcastDate(broadcastDate);
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
      setRecordingDate(performanceDate);
      markPrefilled("recordingDate", "project");
      setHasRecording(true);
    }

    // リハ日はエピソードが持っていないので、エピソードを選んでいても入れてよい
    const rehearsalDate = ctx.rehearsalDates?.[0];
    if (rehearsalDate && canAutofill(newRehearsalDate, "rehearsalDate")) {
      setRehearsalDate(rehearsalDate);
      markPrefilled("rehearsalDate", "project");
      setHasRehearsal(true);
    }
  }, [
    projectContext, selectedProjectId, selectedEpisodeId,
    newLocation, newBroadcastDate, newRecordingDate, newRehearsalDate,
    canAutofill, markPrefilled,
    setLocation, setBroadcastDate, setRecordingDate, setRehearsalDate,
    setHasRecording, setHasRehearsal,
  ]);

  /** 案件を選び直したとき。**世代ガードの印を落とす**のが要点
   * （落とさないと、選び直した案件の context が届いても入らない）。 */
  const onProjectSelected = (project: GlsProject | undefined) => {
    // 選び直したら context をもう一度反映する（上の useEffect が入れる）
    appliedContextRef.current = null;
    // 番組名を案件名で埋める（`/lookup/gls-options` が `name` を返している）
    if (project?.name && canAutofill(newTitle, "title")) {
      setTitle(project.name);
      markPrefilled("title", "project");
    }
  };

  /** エピソードを選んだとき。エピソードの日付は回ごとに正確なので、
   * 案件から入れた値（＝`canAutofill` が許す欄）は上書きしてよい。 */
  const onEpisodeSelected = (ep: EpisodeOption | undefined) => {
    if (!ep) return;
    if (ep.broadcast_date && canAutofill(newBroadcastDate, "broadcastDate")) {
      setBroadcastDate(ep.broadcast_date);
      markPrefilled("broadcastDate", "episode");
    }
    // `/lookup/:projectId/episodes-options` は `recording_date` も返している
    // （server/src/contexts/platform/routes/lookup.routes.ts・`episodes.recording_date` は TEXT の 'YYYY-MM-DD'）
    if (ep.recording_date && canAutofill(newRecordingDate, "recordingDate")) {
      setRecordingDate(ep.recording_date);
      markPrefilled("recordingDate", "episode");
      setHasRecording(true);
    }
  };

  /** フォームを空に戻すとき。注記と世代ガードの印を両方消す
   * （片方だけ消すと、次に同じ案件を選んだときに入らない）。 */
  const resetPrefill = useCallback(() => {
    setPrefilled({});
    appliedContextRef.current = null;
  }, []);

  return { prefilled, markPrefilled, onProjectSelected, onEpisodeSelected, resetPrefill };
}
