import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  ArrowLeft, RefreshCw, Image as ImageIcon, ImageOff, Save, Radio, Check,
  ChevronDown, ChevronRight, CheckCircle2, Link2, Download, Loader2,
} from 'lucide-react';
import { useQuiz, useSyncQuizFromCategory } from '@/quiz/api';
import type { Quiz, QuizChoice } from '@/quiz/types';
import { QUIZ_COLORS } from '@/quiz/types';
import type { CgCategory } from '@/cg/types';
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import { notifyError, notifyWarning } from '@/lib/notify';

interface AwardsEventDetail {
  id: number; name: string;
  categories: CgCategory[];
}

// 選択肢の編集ドラフト (CG 表示用フィールドを含む)
interface ChoiceDraft {
  name: string; name_en: string;
  company: string; company_en: string;
  nomination_title: string; nomination_title_en: string;
  photo_data_url: string;
  vote_count: number;
  is_correct: boolean;
}

function toChoiceDraft(c: QuizChoice): ChoiceDraft {
  return {
    name: c.name ?? '', name_en: c.name_en ?? '',
    company: c.company ?? '', company_en: c.company_en ?? '',
    nomination_title: c.nomination_title ?? '', nomination_title_en: c.nomination_title_en ?? '',
    photo_data_url: c.photo_data_url ?? '',
    vote_count: c.vote_count ?? 0,
    is_correct: !!c.is_correct,
  };
}

export default function QuizEditPage() {
  const { id, quizId: quizIdRaw } = useParams<{ id: string; quizId: string }>();
  const eventId = parseInt(id!);
  const quizId = parseInt(quizIdRaw!);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: event } = useQuery({
    queryKey: ['awards-event', eventId],
    queryFn: async () => {
      const res = await api.get(`/awards/events/${eventId}`);
      return res.data.data as AwardsEventDetail;
    },
  });
  const { data: quiz } = useQuiz(quizId);
  const sync = useSyncQuizFromCategory(quizId);

  // インタラクティブ演出 連携状態 (取込/自動送信の可否判定に使う)
  const { data: iaLink } = useQuery({
    queryKey: ['interactive-link', eventId],
    queryFn: async () => (await api.get(`/quiz/events/${eventId}/interactive-link`)).data.data as { configured: boolean },
  });
  const [pulling, setPulling] = useState(false);

  const [draft, setDraft] = useState<Partial<Quiz>>({});
  // 選択肢ドラフト: position をキーに 1 つの保存ボタンでまとめて保存する
  const [choiceDrafts, setChoiceDrafts] = useState<Record<number, ChoiceDraft>>({});
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!quiz) return;
    setDraft({
      title: quiz.title, title_en: quiz.title_en,
      question: quiz.question, question_en: quiz.question_en,
      choice_count: quiz.choice_count,
      countdown_seconds: quiz.countdown_seconds,
      link_category_id: quiz.link_category_id,
      display: quiz.display,
      mode: quiz.mode,
      has_answer_check: quiz.has_answer_check,
      survey_pattern: quiz.survey_pattern,
      cover_image_data_url: quiz.cover_image_data_url,
    });
    const m: Record<number, ChoiceDraft> = {};
    for (const c of quiz.choices) m[c.position] = toChoiceDraft(c);
    setChoiceDrafts(m);
  }, [quiz]);

  if (!quiz) return <div className="p-6 text-sm text-muted-foreground">読み込み中…</div>;

  const isQuiz = (draft.mode ?? quiz.mode) === 'quiz';
  const choiceCount = draft.choice_count ?? quiz.choice_count;
  // この quiz が連携中の Interactive 問題 ID (API は返すが型に無いため cast)
  const iqId = (quiz as unknown as { interactive_question_id?: string | null }).interactive_question_id ?? null;

  // 取込 (Interactive → リアルタイムCG): 連携中の問題の本文・選択肢・正解で上書き
  const onPull = async () => {
    if (!iqId) return;
    if (!(await confirmAction({ title: 'インタラクティブ演出側の本文・選択肢・正解で、この問題を上書きします。よろしいですか？', confirmLabel: '上書きする', tone: 'danger' }))) return;
    setPulling(true);
    try {
      await api.post(`/quiz/events/${eventId}/interactive-link/pull/${quizId}`);
      await qc.invalidateQueries({ queryKey: ['quizzes'] });
    } catch {
      notifyError('取込に失敗しました（連携先の問題が見つからない可能性があります）。');
    } finally {
      setPulling(false);
    }
  };

  const setChoice = (position: number, patch: Partial<ChoiceDraft>) => {
    setChoiceDrafts((prev) => ({ ...prev, [position]: { ...prev[position], ...patch } }));
  };

  // ── 1 つの「保存」で quiz 本体 + 全選択肢 + Interactive 送信をまとめて実行 ──
  const onSave = async () => {
    setSaving(true);
    try {
      await api.put(`/quiz/quizzes/${quizId}`, draft);
      // 表示中の各選択肢を保存 (choice_count 内のみ)
      for (let pos = 1; pos <= choiceCount; pos++) {
        const cd = choiceDrafts[pos];
        if (cd) await api.put(`/quiz/quizzes/${quizId}/choices/${pos}`, cd);
      }
      // 保存時に自動で Interactive へ送信 (本文・選択肢・正解)。
      // 連携設定済みなら新規作成 or 更新、未設定なら 400 を握りつぶす (保存はブロックしない)。
      // 既に連携済みの場合は interactive_question_id 経由で同じ問題を更新する。
      try { await api.post(`/quiz/events/${eventId}/interactive-link/push/${quizId}`); } catch { /* 連携未設定/失敗は無視 */ }
      await qc.invalidateQueries({ queryKey: ['quizzes'] });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 space-y-4 sm:space-y-5 pb-12">
      {/* Header — インタラクティブ QuizManagerPage と同じ構成 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/event/${eventId}/quiz`)}
          aria-label="戻る"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold truncate">{draft.title || quiz.title || '(タイトル未設定)'}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              isQuiz ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              {isQuiz ? 'クイズ' : 'アンケート'}
            </span>
            <span className="text-xs text-muted-foreground">{choiceCount} 択 / {draft.countdown_seconds ?? quiz.countdown_seconds} 秒</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {savedFlash && (
            <span className="hidden sm:flex items-center gap-1 text-xs font-semibold text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />保存しました
            </span>
          )}
          <button onClick={() => navigate(`/event/${eventId}/quiz-stack/control`)}
            className="flex items-center gap-1.5 rounded-lg border border-border hover:bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <Radio className="h-3.5 w-3.5" />送出
          </button>
          <button onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 px-4 py-1.5 text-xs font-bold text-white">
            <Save className="h-3.5 w-3.5" />{saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      {/* 種別タブ (アンケート / クイズ) — インタラクティブ側のタブ UI に合わせる */}
      <div className="flex gap-1 border-b">
        {(['survey', 'quiz'] as const).map((m) => {
          const active = (draft.mode ?? 'survey') === m;
          return (
            <button key={m}
              onClick={() => {
                // クイズ→アンケート切替時: survey_pattern が未設定なら top-reveal を既定に
                // アンケート→クイズ切替時: survey_pattern は無視されるが null にして整合性を保つ
                setDraft({
                  ...draft,
                  mode: m,
                  survey_pattern: m === 'survey'
                    ? (draft.survey_pattern ?? quiz.survey_pattern ?? 'top-reveal')
                    : null,
                });
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {m === 'quiz' ? 'クイズ' : 'アンケート'}
            </button>
          );
        })}
      </div>

      {/* インタラクティブ演出 連携 (双方向) — 設定済みのときのみ表示 */}
      {iaLink?.configured && (
        <div className="rounded-xl border border-info bg-info/10/40 p-3 flex flex-wrap items-center gap-2">
          <Link2 className="h-4 w-4 text-info shrink-0" />
          <span className="text-xs font-bold text-info">インタラクティブ演出 連携</span>
          {iqId
            ? <span className="rounded-full bg-success-surface px-2 py-0.5 text-[10px] font-semibold text-success">連携中</span>
            : <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">未連携</span>}
          <div className="flex-1" />
          <button onClick={onPull} disabled={!iqId || pulling}
            className="flex items-center gap-1.5 rounded-lg bg-info hover:bg-info/90 disabled:opacity-40 px-3 py-1.5 text-xs font-bold text-white"
            title="インタラクティブ演出の内容をこの問題に取り込む">
            {pulling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Interactive から取込
          </button>
          <p className="w-full text-[11px] text-info">
            ⬆ 送信 (CG → Interactive) は<strong>保存時に自動</strong>で実行されます。
            ⬇ 取込 (Interactive → CG) は上のボタンで実行します。
            {!iqId && '（一覧ページで連携先の問題を選ぶと有効になります）'}
          </p>
        </div>
      )}

      {/* 基本設定 */}
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="text-sm font-bold">基本設定</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Field label="タイトル (JA)">
            <input value={draft.title ?? ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="例: 最優秀新人賞"
              className="w-full rounded-lg border px-3 py-2"/>
          </Field>
          <Field label="タイトル (EN)">
            <input value={draft.title_en ?? ''} onChange={(e) => setDraft({ ...draft, title_en: e.target.value })}
              className="w-full rounded-lg border px-3 py-2"/>
          </Field>
          <Field label="質問文 (JA)">
            <input value={draft.question ?? ''} onChange={(e) => setDraft({ ...draft, question: e.target.value })}
              placeholder="例: もっともふさわしいのは？"
              className="w-full rounded-lg border px-3 py-2"/>
          </Field>
          <Field label="質問文 (EN)">
            <input value={draft.question_en ?? ''} onChange={(e) => setDraft({ ...draft, question_en: e.target.value })}
              className="w-full rounded-lg border px-3 py-2"/>
          </Field>
          <Field label="択数">
            <select value={draft.choice_count ?? 3} onChange={(e) => setDraft({ ...draft, choice_count: parseInt(e.target.value) })}
              className="w-full rounded-lg border px-3 py-2">
              {[2,3,4,5,6].map((n) => <option key={n} value={n}>{n} 択</option>)}
            </select>
          </Field>
          <Field label="カウントダウン (秒)">
            <input type="number" value={draft.countdown_seconds ?? 60} min={5} max={600}
              onChange={(e) => setDraft({ ...draft, countdown_seconds: parseInt(e.target.value) || 60 })}
              className="w-full rounded-lg border px-3 py-2"/>
          </Field>
          <Field label="表示モード">
            <select value={draft.display ?? 'count'} onChange={(e) => setDraft({ ...draft, display: e.target.value as 'count' | 'percent' })}
              className="w-full rounded-lg border px-3 py-2">
              <option value="count">票数</option>
              <option value="percent">パーセント</option>
            </select>
          </Field>
          <Field label="連動カテゴリ (任意)">
            <div className="flex gap-2">
              <select value={draft.link_category_id ?? ''}
                onChange={(e) => setDraft({ ...draft, link_category_id: e.target.value ? parseInt(e.target.value) : null })}
                className="flex-1 rounded-lg border px-3 py-2">
                <option value="">手入力 (連動なし)</option>
                {(event?.categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} / {c.description || '-'}</option>
                ))}
              </select>
              <button onClick={async () => {
                if (!quiz.link_category_id) { notifyWarning('先に連動カテゴリを保存してください'); return; }
                if (!(await confirmAction({ title: '連動カテゴリの TOP-N で choices を上書きします。よろしいですか？', confirmLabel: '上書きする', tone: 'danger' }))) return;
                await sync.mutateAsync();
              }}
                disabled={!quiz.link_category_id || sync.isPending}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 hover:bg-muted disabled:opacity-50 text-xs">
                <RefreshCw className="h-3.5 w-3.5" />取込
              </button>
            </div>
          </Field>
        </div>

        {/* v2.9.36: 演出パターン ピッカー — 種別により選択肢が変わる階層型 UI */}
        <div className="rounded-xl border border-primary bg-accent/30 p-3 space-y-3">
          <div className="text-sm font-bold text-primary flex items-center gap-1.5">
            演出パターン
            <span className="text-xs font-normal text-primary">
              (TAKE で進む CG 演出のフローを決めます)
            </span>
          </div>
          {(() => {
            const mode = draft.mode ?? quiz.mode;
            if (mode === 'quiz') {
              return (
                <div className="rounded-lg border-2 border-primary bg-accent/60 p-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-white text-[10px] font-black">✓</span>
                    <span className="text-sm font-bold text-primary">正解発表 (クイズ固定)</span>
                  </div>
                  <p className="mt-1 ml-7 text-xs text-primary">
                    正解選択肢をハイライト表示。クイズ種別では常にこの演出になります。
                  </p>
                </div>
              );
            }
            // mode === 'survey'
            const pattern = draft.survey_pattern ?? quiz.survey_pattern ?? 'top-reveal';
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  { v: 'answer-check', emoji: '📊', label: 'アンサーチェック', desc: '各選択肢の票数を集計してアニメ表示し、そこで終了 (No.1 発表なし)', color: 'emerald' },
                  { v: 'top-reveal',   emoji: '🏆', label: 'No.1 発表',         desc: 'アンケートCGは投票+集計まで。No.1 はランキングCG側で、連動カテゴリの賞の最後にフルスクリーン発表', color: 'amber' },
                ] as const).map(({ v, emoji, label, desc, color }) => {
                  const active = pattern === v;
                  const colorCls = active
                    ? (color === 'emerald'
                        ? 'border-success bg-success-surface/80 text-success'
                        : 'border-warning bg-warning-surface/80 text-warning-strong')
                    : 'border-border bg-white text-muted-foreground hover:border-border';
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setDraft({ ...draft, survey_pattern: v })}
                      className={`rounded-lg border-2 p-3 text-left transition-colors ${colorCls}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{emoji}</span>
                        <span className="text-sm font-bold">{label}</span>
                        {active && (
                          <span className={`ml-auto inline-flex items-center justify-center h-5 w-5 rounded-full text-white text-[10px] font-black ${
                            color === 'emerald' ? 'bg-success' : 'bg-warning'
                          }`}>✓</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs">{desc}</p>
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* アンサーチェック前段オプション — quiz (正解発表) のみ。
              アンケートは「投票 → 集計 (answer-check)」固定なので前段オプションは非表示。 */}
          {(() => {
            const mode = draft.mode ?? quiz.mode;
            if (mode !== 'quiz') return null;
            return (
              <label className="flex items-start gap-2 text-sm rounded-lg border bg-muted/60 px-3 py-2 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={!!draft.has_answer_check}
                  onChange={(e) => setDraft({ ...draft, has_answer_check: e.target.checked })}/>
                <span>
                  <strong>アンサーチェック演出を前段に挿入する</strong>
                  <span className="block text-xs text-muted-foreground">
                    正解発表の前に「票数集計アニメ」を 1 ステップ追加します。
                  </span>
                </span>
              </label>
            );
          })()}
        </div>

        <CoverImageEditor
          value={draft.cover_image_data_url ?? null}
          onChange={(v) => setDraft({ ...draft, cover_image_data_url: v })}
        />
      </section>

      {/* 選択肢 */}
      <section className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">選択肢 ({choiceCount} 件)</h2>
          {isQuiz && (
            <span className="text-[11px] text-success font-medium flex items-center gap-1">
              <Check className="h-3 w-3" />正解を選択 (複数可)
            </span>
          )}
        </div>
        <div className="space-y-2">
          {Array.from({ length: choiceCount }, (_, i) => i + 1).map((pos) => (
            <ChoiceEditor
              key={pos}
              position={pos}
              value={choiceDrafts[pos] ?? toChoiceDraft({ position: pos } as QuizChoice)}
              onChange={(patch) => setChoice(pos, patch)}
              showCorrectFlag={isQuiz}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          ※ 変更は上部の「保存」ボタンでまとめて保存されます (選択肢ごとの保存は不要)。
        </p>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}

interface ChoiceEditorProps {
  position: number;
  value: ChoiceDraft;
  onChange: (patch: Partial<ChoiceDraft>) => void;
  showCorrectFlag: boolean;
}

function ChoiceEditor({ position, value, onChange, showCorrectFlag }: ChoiceEditorProps) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const color = QUIZ_COLORS[(position - 1) % QUIZ_COLORS.length];

  const handleFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const max = 480;
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * r), h = Math.round(img.height * r);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { onChange({ photo_data_url: dataUrl }); return; }
        ctx.drawImage(img, 0, 0, w, h);
        onChange({ photo_data_url: canvas.toDataURL('image/jpeg', 0.82) });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(f);
  };

  return (
    <div className="rounded-lg border bg-card p-3">
      {/* 基本行: 番号 + 名前 + 正解トグル + 写真 */}
      <div className="flex items-center gap-2.5">
        <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white"
          style={{ background: color.core }}>
          {position}
        </div>

        {/* 正解トグル (クイズ時のみ) — インタラクティブ側と同じ緑チェック */}
        {showCorrectFlag && (
          <button type="button" aria-pressed={value.is_correct}
            aria-label={`選択肢 ${position} を正解にする`}
            onClick={() => onChange({ is_correct: !value.is_correct })}
            className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
              value.is_correct ? 'border-success bg-success text-white' : 'border-border text-transparent hover:border-success'
            }`}>
            <Check className="h-4 w-4" />
          </button>
        )}

        <input value={value.name} onChange={(e) => onChange({ name: e.target.value })}
          placeholder={`選択肢 ${position}`} className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"/>

        <button onClick={() => fileRef.current?.click()}
          className="relative w-9 h-9 rounded-lg overflow-hidden bg-muted border hover:border-primary flex items-center justify-center shrink-0"
          title="画像をアップロード">
          {value.photo_data_url
            ? <img src={value.photo_data_url} alt="" className="w-full h-full object-cover"/>
            : <ImageIcon className="h-4 w-4 text-muted-foreground"/>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}/>
      </div>

      {/* 詳細 (CG 表示用) — 折りたたみでシンプルさを維持 */}
      <button onClick={() => setOpen((o) => !o)}
        className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        詳細 (CG 表示用: 英語名 / 会社 / ノミネートタイトル / 票数)
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <input value={value.name_en} onChange={(e) => onChange({ name_en: e.target.value })}
            placeholder="Name (EN)" className="rounded-lg border px-3 py-2"/>
          <input value={value.company} onChange={(e) => onChange({ company: e.target.value })}
            placeholder="会社・所属" className="rounded-lg border px-3 py-2"/>
          <input value={value.company_en} onChange={(e) => onChange({ company_en: e.target.value })}
            placeholder="Company (EN)" className="rounded-lg border px-3 py-2"/>
          <input value={value.nomination_title} onChange={(e) => onChange({ nomination_title: e.target.value })}
            placeholder="ノミネートタイトル" className="rounded-lg border px-3 py-2"/>
          <input value={value.nomination_title_en} onChange={(e) => onChange({ nomination_title_en: e.target.value })}
            placeholder="Nomination Title (EN)" className="rounded-lg border px-3 py-2"/>
          <label className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground shrink-0">投票数/回答数</span>
            <input type="text" inputMode="numeric" value={String(value.vote_count)}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d]/g, '');
                const n = cleaned === '' ? 0 : parseInt(cleaned, 10);
                onChange({ vote_count: isNaN(n) ? 0 : Math.max(0, n) });
              }}
              onFocus={(e) => e.target.select()}
              className="w-full rounded-lg border px-3 py-2"/>
          </label>
          {value.photo_data_url && (
            <button onClick={() => onChange({ photo_data_url: '' })}
              className="text-[11px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1 justify-self-start">
              <ImageOff className="h-3.5 w-3.5"/>画像を削除
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── 16:9 カバー画像エディタ (poll 段階のカメラ枠内に差し替え表示) ───────────
function CoverImageEditor({ value, onChange }: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        // 16:9 で 1280x720 にリサイズ + crop
        const targetW = 1280, targetH = 720;
        const canvas = document.createElement('canvas');
        canvas.width = targetW; canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) { onChange(dataUrl); return; }
        // cover 計算
        const srcRatio = img.width / img.height;
        const dstRatio = targetW / targetH;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (srcRatio > dstRatio) {
          sw = img.height * dstRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / dstRatio;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
        const out = canvas.toDataURL('image/jpeg', 0.82);
        onChange(out);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(f);
  };
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="text-[11px] font-bold text-muted-foreground mb-2">カバー画像 (16:9, アンケート画面のカメラ枠内に表示)</div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          className="relative w-48 aspect-video rounded-lg overflow-hidden bg-accent border border-border hover:border-primary flex items-center justify-center"
        >
          {value
            ? <img src={value} alt="" className="w-full h-full object-cover"/>
            : <span className="text-xs text-muted-foreground">クリックで画像を選択</span>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}/>
        {value && (
          <button onClick={() => onChange(null)}
            className="text-xs text-muted-foreground hover:text-destructive">削除</button>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground mt-2">
        ※ 自動的に 1280×720 (16:9) にクロップされます。未設定の場合はアルファ透過枠のままです。
      </div>
    </div>
  );
}
