/**
 * 投入口の状態（PC の箱とスマホのシートで**同じものを使う**）
 *
 * 2 つ書くと、片方だけ直した日から「PC では登録できるのにスマホでは落ちる」が
 * 起きます。**投げ方（見た目）だけが違い、投げるものと確認するものは同じ**です。
 */
import { useCallback, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { DEST_INFO, destOf, type IntakeResponse, type Row } from './types';

/** 添付 1 件の上限（サーバーと同じ 20MB）。超えたら**送る前に**断る */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** 添付の件数の上限（サーバーと同じ） */
export const MAX_FILES = 6;

export function useIntake() {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [intake, setIntake] = useState<IntakeResponse | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  /** 録音は解析の直前に渡すだけなので、描き直しを起こさない ref に置く */
  const audioRef = useRef<File | null>(null);

  const addFiles = useCallback((picked: FileList | File[] | null) => {
    if (!picked) return;
    const list = Array.from(picked);
    setError(null);
    setFiles((prev) => {
      const out = [...prev];
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
      return out;
    });
  }, []);

  const removeFile = useCallback((f: File) => {
    setFiles((prev) => prev.filter((x) => x !== f));
  }, []);

  const submit = useMutation({
    mutationFn: async () => {
      const audio = audioRef.current;
      // 添付が無いときは今までどおり JSON で投げる（形を増やさない）
      if (files.length === 0 && !audio) {
        return (await api.post('/dailyops/tasks/intake', { raw_text: text })).data.data as IntakeResponse;
      }
      const fd = new FormData();
      fd.append('raw_text', text);
      for (const f of files) fd.append('files', f);
      if (audio) fd.append('audio', audio);
      return (await api.post('/dailyops/tasks/intake', fd)).data.data as IntakeResponse;
    },
    onSuccess: (data) => {
      audioRef.current = null;
      setIntake(data);
      setRows((data.drafts ?? []).map((d) => ({ ...d, checked: d.suggested_default !== false })));
      setError(null);
    },
    onError: (e: unknown) => setError(apiMessage(e, '読み取りに失敗しました')),
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
        created?: { dest: keyof typeof DEST_INFO; id: string }[];
        created_ids: string[];
      };
    },
    onSuccess: (data) => {
      setDoneMsg(summarize(data.created ?? [], data.created_ids.length));
      reset();
      // 行き先が 4 つに増えたので、**案件・活動記録の一覧も落とす**。
      // タスクの鍵だけ落としていると「登録したのに一覧に出ない」が起きる
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
      qc.invalidateQueries({ queryKey: ['activity-logs'] });
      qc.invalidateQueries({ queryKey: ['project-tasks'] });
      qc.invalidateQueries({ queryKey: ['task-dashboard'] });
    },
    onError: (e: unknown) => setError(apiMessage(e, '登録に失敗しました')),
    meta: { silent: true },
  });

  const discard = useMutation({
    mutationFn: async () => (await api.post(`/dailyops/tasks/intake/${intake!.id}/discard`, {})).data.data,
    onSuccess: () => {
      setDoneMsg('下書きを破棄しました（投げた文は記録に残っています）');
      reset();
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
    onError: (e: unknown) => setError(apiMessage(e, '破棄に失敗しました')),
    meta: { silent: true },
  });

  function reset() {
    setIntake(null);
    setRows([]);
    setText('');
    setFiles([]);
    audioRef.current = null;
    setError(null);
  }

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
    submit, commit, discard, reset, submitWithAudio,
    canSubmit: (text.trim().length > 0 || files.length > 0) && !submit.isPending,
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
