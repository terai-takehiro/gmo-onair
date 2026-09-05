/**
 * 投入口の状態（PC の箱とスマホのシートで**同じものを使う**）
 *
 * 2 つ書くと、片方だけ直した日から「PC では登録できるのにスマホでは落ちる」が
 * 起きます。**投げ方（見た目）だけが違い、投げるものと確認するものは同じ**です。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { downscaleImage } from '@gmo-onair/shared/src/client-v4/downscaleImage';
import { DEST_INFO, destOf, type Dest, type IntakeResponse, type Row } from './types';

/** 添付 1 件の上限（サーバーと同じ 20MB）。超えたら**送る前に**断る */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** 添付の件数の上限（サーバーと同じ） */
export const MAX_FILES = 6;

/** commit で作られたもの（行き先つき）。案件への遷移とリンクに使う */
export interface Created { dest: Dest; id: string; title: string }

export function useIntake(opts: { canOpenProject?: boolean } = {}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  /**
   * いまの添付。**送るところはこちらを読む**。
   * `mutationFn` は作られたときの `files` を掴んだままなので、
   * 縮小を待ってから読むと**待つ前の値**（＝空）を見てしまう。
   */
  const filesRef = useRef<File[]>([]);
  const [intake, setIntake] = useState<IntakeResponse | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  /** 作った案件（ネタ）。**2件以上のときだけ**リンクとして出す（下の onSuccess） */
  const [createdProjects, setCreatedProjects] = useState<Created[]>([]);
  /** 録音は解析の直前に渡すだけなので、描き直しを起こさない ref に置く */
  const audioRef = useRef<File | null>(null);
  /**
   * 写真を縮めている最中の件数。**0 でないあいだは送らせない**（レビューでの指摘 #79）。
   *
   * 縮めるのは非同期なので、**選んですぐ送ると `files` がまだ空**です。
   * 前の版は押せてしまい、**添付が1枚も付いていない解析が走って**いました
   * （押した人は付けたつもり、AI は写真を見ていない、画面には何も出ない）。
   */
  const [preparing, setPreparing] = useState(0);
  /**
   * 縮め終わるまでの約束。**送るところが必ずこれを待つ**。
   *
   * ⚠️ **押せなくするだけでは足りません**（実測して分かった）。
   * ボタンの `disabled` は React の描き直しが1回入ってから効くので、
   * **選んだのと同じ瞬間に押すと素通り**します（現場では「選んで即送信」が普通）。
   * `useRef` なら**その場で**見えるので、送る側で待てば取りこぼしません。
   */
  const preparePromise = useRef<Promise<void>>(Promise.resolve());

  const addFiles = useCallback(async (picked: FileList | File[] | null) => {
    if (!picked) return;
    // **送る前に写真を縮める**（AI の費用は画素数で決まる。名刺やホワイトボードは
    // 長辺 1600px で十分に読める）。縮められなかったら元のまま送る
    setPreparing((n) => n + 1);
    const job = Promise.all(Array.from(picked).map((f) => downscaleImage(f)));
    // 送る側が待てるように、いま走っている縮小を数珠つなぎにしておく
    preparePromise.current = preparePromise.current.then(() => job.then(() => undefined, () => undefined));
    let list: File[];
    try {
      list = await job;
    } finally {
      setPreparing((n) => n - 1);
    }
    setError(null);
    const out = [...filesRef.current];
    for (const f of list) {
      if (f.size > MAX_FILE_BYTES) {
        setError(`「${f.name}」が大きすぎます（上限 ${MAX_FILE_BYTES / 1024 / 1024}MB）`);
        continue;
      }
      // 同じものを 2 回選んだときに 2 枚並べない（名前と大きさで見る）
      if (out.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (out.length >= MAX_FILES) {
        setError(`添付は ${MAX_FILES} 件までです`);
        break;
      }
      out.push(f);
    }
    filesRef.current = out;
    setFiles(out);
  }, []);

  const removeFile = useCallback((f: File) => {
    filesRef.current = filesRef.current.filter((x) => x !== f);
    setFiles(filesRef.current);
  }, []);

  /** 下書きが出来たら確認画面に載せる（同期・裏の両方から呼ぶ） */
  const applyIntake = useCallback((data: IntakeResponse) => {
    setIntake(data);
    setRows((data.drafts ?? []).map((d) => ({ ...d, checked: d.suggested_default !== false })));
  }, []);

  /**
   * 録音の待ち受け。**`status` が `transcribing` の間だけ 3 秒ごとに読みに行く。**
   *
   * `useQuery` の `refetchInterval` ではなく手で回しているのは、
   * **シートを閉じても止めたくない**からです（`MobileAiBar` が状態を持つので、
   * 閉じても部品は生きています）。止めるのは終わったときと `reset()` のときだけ。
   */
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPolling = useCallback(() => {
    if (poll.current) { clearInterval(poll.current); poll.current = null; }
  }, []);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    poll.current = setInterval(async () => {
      try {
        const data = (await api.get(`/dailyops/tasks/intakes/${id}`)).data.data as IntakeResponse;
        if (data.status === 'transcribing') { setIntake(data); return; }
        stopPolling();
        if (data.status === 'failed') {
          setIntake(null);
          setError(data.error_message ?? '録音を文字にできませんでした');
          return;
        }
        applyIntake(data);
      } catch (e) {
        // **1 回失敗しても止めない**（通信が一瞬切れただけのことがある）。
        // 本当に駄目なら 30 分で「止まっています」に変わる（サーバー側で判定）
        console.warn('[intake] 文字起こしの様子を読めませんでした:', (e as Error).message);
      }
    }, 3000);
  }, [applyIntake, stopPolling]);

  // 部品ごと消えるときは必ず止める（残すとページを移っても叩き続ける）
  useEffect(() => stopPolling, [stopPolling]);

  const submit = useMutation({
    mutationFn: async () => {
      // **縮め終わるまで待つ。** 待たないと `files` がまだ空で、
      // **添付の無い解析**が走る（押した人は付けたつもりのまま）
      await preparePromise.current;
      const audio = audioRef.current;
      const attached = filesRef.current;   // **待ったあとの値**を読む（上の理由）
      // 添付が無いときは今までどおり JSON で投げる（形を増やさない）
      if (attached.length === 0 && !audio) {
        return (await api.post('/dailyops/tasks/intake', { raw_text: text })).data.data as IntakeResponse;
      }
      const fd = new FormData();
      fd.append('raw_text', text);
      for (const f of attached) fd.append('files', f);
      if (audio) fd.append('audio', audio);
      // ⚠️ **Content-Type は書かないこと。** この axios instance は JSON を既定に
      // しており、**書くと axios が FormData を JSON に変換してファイルが消えます**。
      // 外すのは `shared/src/client/createApi.ts` の request interceptor の仕事
      return (await api.post('/dailyops/tasks/intake', fd)).data.data as IntakeResponse;
    },
    onSuccess: (data) => {
      audioRef.current = null;
      setError(null);
      // 録音は裏で進む。行だけ出来て返ってくるので、出来上がりを待ちに行く
      if (data.status === 'transcribing') {
        setIntake(data);
        setRows([]);
        startPolling(data.id);
        return;
      }
      applyIntake(data);
    },
    onError: (e: unknown) => setError(apiMessage(e, '書いたものを読み取れませんでした。もう一度お試しください。')),
    // 画面が自分で理由を出すので、共通の受け皿は黙らせる
    meta: { silent: true },
  });

  const commit = useMutation({
    mutationFn: async () => {
      const picked = rows.filter((r) => r.checked).map((r) => ({
        draft_key: r.draft_key,
        dest: destOf(r),
        title: r.title,
        assigned_to: r.assigned_to ?? undefined,
        requester_id: r.requester_id ?? undefined,
        due_at: r.due_at ?? undefined,
        importance: r.importance ?? 2,
        urgency: r.due_at ? (r.urgency ?? 2) : 1,
        project_id: r.project_id ?? undefined,
        customer_name: r.customer_name ?? undefined,
        detail: r.detail ?? undefined,
        gls_category: r.gls_category ?? undefined,
        activity_type: r.activity_type ?? undefined,
        next_action: r.next_action ?? undefined,
        next_action_date: r.next_action_date ?? undefined,
        summary: r.summary ?? undefined,
        decisions: r.decisions ?? undefined,
        open_items: r.open_items ?? undefined,
      }));
      return (await api.post(`/dailyops/tasks/intake/${intake!.id}/commit`, { rows: picked })).data.data as {
        created?: Created[];
        created_ids: string[];
      };
    },
    onSuccess: (data) => {
      const created = data.created ?? [];
      /**
       * ── 案件（ネタ）を作ったら、その案件を開く ────────────────────
       *
       * 投入口を1本にして AI が行き先を決めるようになった以上、
       * **「引き合いを貼る」ための別の入口は要りません**（同じ文をどちらに
       * 入れるかを押す人に選ばせることになる）。代わりに、
       * **AI が案件と判断して登録したら、その案件をそのまま開きます** —
       * 引き合いを入れた人が次にやるのは、たいてい中身を足すことだからです。
       *
       * - **`sales` が無い人には遷移しません。** 案件詳細は `sales` を要求するので、
       *   送ると 403 の画面に着きます（`canOpenProject` で見る）
       * - **1件だけのときしか遷移しません。** どれか1つを勝手に開くと、
       *   残りが登録されたことに気づけません。**リンクを並べて選ばせます**
       *
       * ⚠️ **数えるのは「できたもの全部」で、ネタの数ではありません**
       * （レビューでの指摘 #76）。前の版は `netas.length === 1` で遷移していたので、
       * **ネタ1件 ＋ タスク3件**のような回でも案件へ飛んでいました。
       * 「案件（ネタ） 1件・タスク 3件を登録しました」は**この画面の状態**なので、
       * 飛んだ瞬間に画面ごと消えます — つまり**タスク3件が登録されたことは
       * どこにも出ません**（投げた人は案件を1件作ったつもりのままです）。
       */
      const netas = created.filter((c) => c.dest === 'neta');
      // **ネタ1件だけ**が出来たとき以外は残る（下に「開く」を並べる）
      const jumps = opts.canOpenProject && netas.length === 1 && created.length === 1;
      setDoneMsg(summarize(created, data.created_ids.length));
      setCreatedProjects(opts.canOpenProject && !jumps ? netas : []);
      reset();
      if (jumps) navigate(`/sales/projects/${netas[0].id}`);
      // 行き先が 4 つに増えたので、**案件・活動記録の一覧も落とす**。
      // タスクの鍵だけ落としていると「登録したのに一覧に出ない」が起きる
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
      qc.invalidateQueries({ queryKey: ['activity-logs'] });
      qc.invalidateQueries({ queryKey: ['project-tasks'] });
      qc.invalidateQueries({ queryKey: ['task-dashboard'] });
    },
    onError: (e: unknown) => setError(apiMessage(e, '登録できませんでした。もう一度お試しください。')),
    meta: { silent: true },
  });

  const discard = useMutation({
    mutationFn: async () => (await api.post(`/dailyops/tasks/intake/${intake!.id}/discard`, {})).data.data,
    onSuccess: () => {
      setDoneMsg('下書きを破棄しました（投げた文は記録に残っています）');
      reset();
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
    onError: (e: unknown) => setError(apiMessage(e, '破棄できませんでした。もう一度お試しください。')),
    meta: { silent: true },
  });

  function reset() {
    stopPolling();
    setIntake(null);
    setRows([]);
    setText('');
    filesRef.current = [];
    setFiles([]);
    audioRef.current = null;
    setError(null);
  }

  /** 「閉じる」は作ったもののリンクも片づける（登録し直すときに古い案内が残らない） */
  const dismiss = () => {
    reset();
    setDoneMsg(null);
    setCreatedProjects([]);
  };

  const updateRow = useCallback((key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.draft_key === key ? { ...r, ...patch } : r)));
  }, []);

  /** 録音が終わったらこれを呼ぶ。**その場で解析まで進める**（もう一度押させない） */
  const submitWithAudio = useCallback((audio: File) => {
    audioRef.current = audio;
    submit.mutate();
  }, [submit]);

  return {
    text, setText,
    files, addFiles, removeFile,
    intake, rows, updateRow,
    error, setError, doneMsg, setDoneMsg,
    createdProjects,
    submit, commit, discard, reset, dismiss, submitWithAudio,
    /** 録音を裏で文字にしている最中か（画面は待ち受けの表示を出す） */
    transcribing: intake?.status === 'transcribing',
    /** 写真を縮めている最中。**画面はそう書く**（押せない理由が要る） */
    preparingFiles: preparing > 0,
    canSubmit: (text.trim().length > 0 || files.length > 0)
      && preparing === 0 && !submit.isPending,
  };
}

function apiMessage(e: unknown, fallback: string): string {
  const r = e as { response?: { data?: { error?: { message?: string } } } };
  return r?.response?.data?.error?.message ?? fallback;
}

/** 「タスク 2件・活動記録 1件を登録しました」。**行き先ごとに数える** */
function summarize(created: { dest: keyof typeof DEST_INFO }[], total: number): string {
  if (created.length === 0) return `${total} 件を登録しました`;
  const count = new Map<string, number>();
  for (const c of created) {
    const label = DEST_INFO[c.dest]?.label ?? 'タスク';
    count.set(label, (count.get(label) ?? 0) + 1);
  }
  return `${[...count].map(([k, v]) => `${k} ${v}件`).join('・')}を登録しました`;
}
