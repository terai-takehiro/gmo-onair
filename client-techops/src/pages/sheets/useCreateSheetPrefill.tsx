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
//
// ⚠️ **判断は純関数（`planProjectPrefill` / `planProjectSwitch`）に出してある。**
//    自動入力の壊れ方は「どの欄に入るか」ではなく**状態の移り変わり**
//    （案件を選び直す・エピソードを挟む）で出る。React のフックのままだと
//    その順番を機械で固定できないので、判断だけを純関数にして
//    `shared/tests/qsheetCreateSheetPrefill.test.ts` で押さえている。
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { type EpisodeOption, type ProjectContext } from "./types";

/** 案件・エピソードから自動で入れた欄。**入れたことを画面に出すため**に持つ
 * （黙って入ると誤りに気づけない。`client/src/contexts/finance/.../HandoffDialog.tsx` に倣う）。
 * ユーザーが手で直したらその欄の印を落とす＝注記も消える。 */
export type PrefilledField = "title" | "location" | "broadcastDate" | "recordingDate" | "rehearsalDate";

/** どこから入れたか。**放送日・収録日は案件からもエピソードからも入る**ので、
 * 真偽値ではなく出どころを持つ（注記に「どこから来た値か」を出すため）。 */
export type PrefillSource = "project" | "episode";

/** 欄の並び。消す順・入れる順をここ1か所で決める（テストの期待値もこの順）。 */
export const PREFILL_FIELDS: PrefilledField[] = [
  "title", "location", "broadcastDate", "recordingDate", "rehearsalDate",
];

/** いまフォームに入っている値（判断に要るのは「空かどうか」だけ）。 */
export type PrefillValues = Record<PrefilledField, string>;
/** 自動入力の印。付いていない欄＝ユーザーが手で打った（or 空）。 */
export type PrefillMarks = Partial<Record<PrefilledField, PrefillSource>>;

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
  return text ? <p className="mt-1 text-note text-info">{text}</p> : null;
}

/**
 * **自動入力の作法**（`client/src/contexts/finance/pages/ledger/revenuePrefill.ts` に倣う）:
 * 空欄のときだけ入れる＝ユーザーが打った値は絶対に上書きしない。
 * ただし「前に自動で入れた値」は選び直しに追随してよい（自分で入れたものなので）。
 */
export function canPrefill(values: PrefillValues, marks: PrefillMarks, field: PrefilledField): boolean {
  return !values[field] || !!marks[field];
}

/** 1つの欄に入れる指示。呼ぶ側が setter と印を同時に動かす。 */
export interface PrefillWrite { field: PrefilledField; value: string; source: PrefillSource }

/** 案件の context を反映したときにやること。
 * トグルは**触る必要があるときだけ**入れる（`undefined` ＝ そのまま）。 */
export interface PrefillPlan {
  writes: PrefillWrite[];
  hasRecording?: boolean;
  hasRehearsal?: boolean;
}

/**
 * 案件1件の事実（`GET /lookup/:projectId/context`）から、どの欄に何を入れるかを決める。
 *
 * ── 規則 ────────────────────────────────────────────────
 *
 * ① **手で打った値は絶対に上書きしない**: すべて `canPrefill` を通す
 * ② **エピソードが優先**: エピソードは回ごとの日付なので案件の日付より正確。
 *    先にエピソードを選んでいたら放送日・収録日には**触らない**
 *    （逆順＝案件 → エピソードは `canPrefill` が「自分が入れた欄」を許すので上書きされる）
 * ③ **番組名も案件の事実から入れる**: `/lookup/gls-options` の一覧ではなく
 *    `ctx.name` を使う。一覧はまだ届いていないことがあり、
 *    「会場と日付だけ入って番組名（必須）が空」＝作成ボタンが押せない、
 *    という一貫しない状態になっていた（`?project=` 付きで開いた経路で実際に起きた）
 */
export function planProjectPrefill(args: {
  ctx: ProjectContext;
  values: PrefillValues;
  marks: PrefillMarks;
  /** エピソードを選んでいるか（＝放送日・収録日はエピソードのもの） */
  episodeSelected: boolean;
}): PrefillPlan {
  const { ctx, values, marks, episodeSelected } = args;
  const writes: PrefillWrite[] = [];
  const plan: PrefillPlan = { writes };
  const can = (field: PrefilledField) => canPrefill(values, marks, field);

  if (ctx.name && can("title")) writes.push({ field: "title", value: ctx.name, source: "project" });
  if (ctx.venue && can("location")) writes.push({ field: "location", value: ctx.venue, source: "project" });

  // `?.` は保険。壊れた応答（配列でない）でもダイアログを落とさない
  const performanceDate = ctx.performanceDates?.[0] ?? null;

  // 放送日は本番日の初日。日程を入れていない案件のために `eventStart` に落とす
  const broadcastDate = performanceDate ?? ctx.eventStart;
  let broadcastAfter = values.broadcastDate;
  if (!episodeSelected && broadcastDate && can("broadcastDate")) {
    writes.push({ field: "broadcastDate", value: broadcastDate, source: "project" });
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
  if (!episodeSelected && performanceDate && performanceDate !== broadcastAfter && can("recordingDate")) {
    writes.push({ field: "recordingDate", value: performanceDate, source: "project" });
    plan.hasRecording = true;
  }

  // リハ日はエピソードが持っていないので、エピソードを選んでいても入れてよい
  const rehearsalDate = ctx.rehearsalDates?.[0];
  if (rehearsalDate && can("rehearsalDate")) {
    writes.push({ field: "rehearsalDate", value: rehearsalDate, source: "project" });
    plan.hasRehearsal = true;
  }
  return plan;
}

/**
 * エピソードを選んだとき。エピソードは回ごとの日付を持つので
 * **案件から入れた値（＝`canPrefill` が許す欄）は上書きしてよい**。
 * 手で打った欄はここでも触らない。
 */
export function planEpisodePrefill(args: {
  ep: EpisodeOption;
  values: PrefillValues;
  marks: PrefillMarks;
}): PrefillPlan {
  const { ep, values, marks } = args;
  const writes: PrefillWrite[] = [];
  const plan: PrefillPlan = { writes };
  if (ep.broadcast_date && canPrefill(values, marks, "broadcastDate")) {
    writes.push({ field: "broadcastDate", value: ep.broadcast_date, source: "episode" });
  }
  // `/lookup/:projectId/episodes-options` は `recording_date` も返している
  // （server/src/contexts/platform/routes/lookup.routes.ts・`episodes.recording_date` は TEXT の 'YYYY-MM-DD'）
  if (ep.recording_date && canPrefill(values, marks, "recordingDate")) {
    writes.push({ field: "recordingDate", value: ep.recording_date, source: "episode" });
    plan.hasRecording = true;
  }
  return plan;
}

/** 案件を選び直したときに空にする欄と、戻すトグル。 */
export interface PrefillClearPlan {
  cleared: PrefilledField[];
  hasRecording?: boolean;
  hasRehearsal?: boolean;
}

/**
 * 案件を選び直したときに**前の案件が入れたものを消す**。
 *
 * ── なぜ「印を落とすだけ」では足りないか ──────────────────────
 *
 * 反映側（`planProjectPrefill`）は**新しい案件が値を持っているときだけ**入れる。
 * 新しい案件がスタジオ予約も日程も持っていないと**前の案件の値がそのまま残り**、
 * しかも注記は「GLS案件から入れました」と主張し続ける。
 * ＝「案件Bの台本なのに会場と日程は案件A」という誤りが、
 * **自動入力を名乗った状態で**保存される。値ごと消してから入れ直す。
 *
 * - **印が付いている欄だけ消す**＝ユーザーが手で打った欄は触らない
 * - エピソードが入れた値も消す（案件を選び直すとエピソードの選択自体が外れるため）
 * - **消した日付のトグルは一緒に戻す。** 自動入力が ON にしたものを戻すだけだが、
 *   ここを忘れると「トグルだけ ON で日付が空」が残る。収録日が隠れ必須になって
 *   作成ボタンが押せなくなった元の不具合と同じ形なので、必ず揃える
 */
export function planProjectSwitch(marks: PrefillMarks): PrefillClearPlan {
  const cleared = PREFILL_FIELDS.filter((f) => marks[f] === "project" || marks[f] === "episode");
  const plan: PrefillClearPlan = { cleared };
  if (cleared.includes("recordingDate")) plan.hasRecording = false;
  if (cleared.includes("rehearsalDate")) plan.hasRehearsal = false;
  return plan;
}

/** フックに渡すもの。**いまの値**（上書きしてよいかの判定に要る）と
 * **setter**（入れるため）を素通しで受け取る。フォームの state は
 * ダイアログ側に置いたままにして、このフックは「規則」だけを持つ。 */
export interface CreateSheetPrefillArgs {
  selectedProjectId: string;
  selectedEpisodeId: string;
  values: PrefillValues;
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

  const [prefilled, setPrefilled] = useState<PrefillMarks>({});

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

  /** 欄の名前で setter を引く（純関数が返す指示をそのまま流し込むため）。 */
  const setValue = useCallback((field: PrefilledField, value: string) => {
    switch (field) {
      case "title": setTitle(value); break;
      case "location": setLocation(value); break;
      case "broadcastDate": setBroadcastDate(value); break;
      case "recordingDate": setRecordingDate(value); break;
      case "rehearsalDate": setRehearsalDate(value); break;
    }
  }, [setTitle, setLocation, setBroadcastDate, setRecordingDate, setRehearsalDate]);

  /** いまの値を純関数に渡す形にまとめる（`values` は毎描画で作り直されるので、
   * 依存には中身の文字列を並べる）。 */
  const currentValues = useCallback((): PrefillValues => ({
    title: newTitle, location: newLocation, broadcastDate: newBroadcastDate,
    recordingDate: newRecordingDate, rehearsalDate: newRehearsalDate,
  }), [newTitle, newLocation, newBroadcastDate, newRecordingDate, newRehearsalDate]);

  /** 判断（純関数）の結果をフォームに流し込む。印も同時に付け替える。 */
  const applyPlan = useCallback((plan: PrefillPlan) => {
    for (const w of plan.writes) {
      setValue(w.field, w.value);
      markPrefilled(w.field, w.source);
    }
    if (plan.hasRecording !== undefined) setHasRecording(plan.hasRecording);
    if (plan.hasRehearsal !== undefined) setHasRehearsal(plan.hasRehearsal);
  }, [setValue, markPrefilled, setHasRecording, setHasRehearsal]);

  /**
   * 案件1件の「台本に要る事実」（名前・会場・本番日・リハ日）。
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

  /**
   * 案件の context が届いたら、空いている欄に入れる。
   *
   * **世代ガード**: 案件を選び直したあとに前の案件の応答が届いても捨てる
   * （`ctx.id !== selectedProjectId` なら何もしない）。queryKey も案件ごとに
   * 分かれているが、**入れる直前にもう一度見る**ほうが読んで分かる。
   * 何を入れるかの規則は `planProjectPrefill`（上）に書いてある。
   */
  useEffect(() => {
    const ctx = projectContext;
    if (!ctx) return;
    if (ctx.id !== selectedProjectId) return;
    if (appliedContextRef.current === ctx.id) return;
    appliedContextRef.current = ctx.id;
    applyPlan(planProjectPrefill({
      ctx,
      values: currentValues(),
      marks: prefilled,
      episodeSelected: !!selectedEpisodeId,
    }));
  }, [projectContext, selectedProjectId, selectedEpisodeId, currentValues, prefilled, applyPlan]);

  /**
   * 案件を選び直したとき。**前の案件が入れた値と注記を消してから**
   * 世代ガードの印を落とす（落とさないと、選び直した案件の context が届いても入らない）。
   * 消したあとは空欄なので、上の effect の「空欄に入れる」通常経路にそのまま乗る。
   */
  const onProjectSelected = () => {
    const plan = planProjectSwitch(prefilled);
    for (const field of plan.cleared) {
      setValue(field, "");
      markPrefilled(field, null);
    }
    if (plan.hasRecording !== undefined) setHasRecording(plan.hasRecording);
    if (plan.hasRehearsal !== undefined) setHasRehearsal(plan.hasRehearsal);
    appliedContextRef.current = null;
  };

  /** エピソードを選んだとき。規則は `planEpisodePrefill`（上）に書いてある。 */
  const onEpisodeSelected = (ep: EpisodeOption | undefined) => {
    if (!ep) return;
    applyPlan(planEpisodePrefill({ ep, values: currentValues(), marks: prefilled }));
  };

  /** フォームを空に戻すとき。注記と世代ガードの印を両方消す
   * （片方だけ消すと、次に同じ案件を選んだときに入らない）。 */
  const resetPrefill = useCallback(() => {
    setPrefilled({});
    appliedContextRef.current = null;
  }, []);

  return { prefilled, markPrefilled, onProjectSelected, onEpisodeSelected, resetPrefill };
}
