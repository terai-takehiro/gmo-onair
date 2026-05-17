import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ExternalLink, Send, X, Maximize2, Minimize2, Image as ImageIcon, ImageOff, Hash, Percent, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStandalonePoll } from '@/standalonePoll/usePoll';
import { POLL_DURATION_MS, POLL_REVERT_DELAY_MS } from '@/standalonePoll/types';
import type { PollStep, PollChoice } from '@/standalonePoll/types';
import StandalonePollCG from '@/standalonePoll/StandalonePollCG';
import { CG_W, CG_H } from '@/cg/types';
import { useFullscreen } from '@/hooks/useFullscreen';

const STEP_LABELS: { step: PollStep; label: string; desc: string }[] = [
  { step: 'idle',   label: 'IDLE',     desc: '透過' },
  { step: 'poll',   label: 'POLL',     desc: 'アンケート画面 (30s)' },
  { step: 'reveal', label: 'RESULT',   desc: '投票結果 (棒グラフ → 自動 No.1)' },
  { step: 'winner', label: 'No.1',     desc: '大賞フルスクリーン' },
];

export default function StandalonePollPage() {
  const { room = 'main' } = useParams<{ room: string }>();
  const navigate = useNavigate();
  const { state, update, clear } = useStandalonePoll(room);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

  const pollTimerRef = useRef<number | null>(null);
  const growTimerRef = useRef<number | null>(null);
  const cancelTimers = useCallback(() => {
    if (pollTimerRef.current) { window.clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
    if (growTimerRef.current) { window.clearTimeout(growTimerRef.current); growTimerRef.current = null; }
  }, []);
  useEffect(() => () => cancelTimers(), [cancelTimers]);

  // ── TAKE: step に応じて適切な遷移を発火
  const take = useCallback(() => {
    cancelTimers();
    if (state.step === 'reveal' && state.revealPhase === 0) {
      // shake → grow → 自動 winner
      update({ revealPhase: 1 });
      growTimerRef.current = window.setTimeout(() => {
        update({ step: 'winner', revealPhase: 2 });
      }, 2800);
      return;
    }
    if (state.step === 'reveal' && state.revealPhase === 1) {
      update({ step: 'winner', revealPhase: 2 });
      return;
    }
    if (state.step === 'idle') {
      // idle → poll
      const startedAt = Date.now();
      update({ step: 'poll', pollStartedAt: startedAt, revealPhase: 0 });
      pollTimerRef.current = window.setTimeout(() => {
        update({ step: 'reveal', revealPhase: 0, pollStartedAt: null });
      }, POLL_DURATION_MS + POLL_REVERT_DELAY_MS);
      return;
    }
    if (state.step === 'poll') {
      // 強制終了 → reveal
      update({ step: 'reveal', revealPhase: 0, pollStartedAt: null });
      return;
    }
    if (state.step === 'winner') {
      // ループ的に最初に戻す
      update({ step: 'idle', revealPhase: 0, pollStartedAt: null });
    }
  }, [state.step, state.revealPhase, update, cancelTimers]);

  const goClear = useCallback(() => {
    cancelTimers();
    update({ step: 'idle', pollStartedAt: null, revealPhase: 0 });
  }, [update, cancelTimers]);

  // PROGRAM scale
  const programRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const [off, setOff] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = programRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.offsetWidth, h = el.offsetHeight;
      if (!w || !h) return;
      const s = Math.min(w / CG_W, h / CG_H);
      setScale(s);
      setOff({ x: Math.floor((w - CG_W * s) / 2), y: Math.floor((h - CG_H * s) / 2) });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="h-full flex flex-col bg-black text-slate-100 overflow-hidden">
      <header className="flex items-center gap-2 px-4 h-12 shrink-0 border-b border-slate-800">
        <button onClick={() => navigate('/')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700">
          <ChevronLeft className="h-4 w-4 text-slate-300" />
        </button>
        <Sparkles className="h-4 w-4 text-amber-400" />
        <span className="text-[11px] font-black text-slate-300 tracking-widest">余興ポール</span>
        <span className="text-xs text-slate-400 truncate hidden sm:block">/ Room: {room}</span>
        <div className="flex-1" />
        <a
          href={`/awards/output/standalone-poll/${room}`}
          target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200"
        >
          <ExternalLink className="h-3 w-3" />出力
        </a>
        <button onClick={toggleFullscreen} className="flex items-center justify-center h-8 w-8 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700">
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* PROGRAM プレビュー */}
        <div ref={programRef} className="w-full aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 relative bg-black border-b lg:border-b-0 lg:border-r border-slate-800">
          <div
            style={{
              position: 'absolute',
              left: off.x, top: off.y,
              width: CG_W * scale, height: CG_H * scale,
              overflow: 'hidden',
            }}
          >
            <div style={{ width: CG_W, height: CG_H, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute' }}>
              <StandalonePollCG state={state} />
            </div>
          </div>
          <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase bg-slate-900/80 border border-slate-700/60 text-slate-300">
            OA · {state.step.toUpperCase()}
          </div>
        </div>

        {/* 右ペイン: コントロール */}
        <div className="w-full lg:w-[420px] xl:w-[460px] flex-1 min-h-0 lg:flex-none lg:shrink-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* タイトル / 質問 */}
            <Section title="タイトル / 質問">
              <LabeledInput label="タイトル (JA)" value={state.title} onChange={(v) => update({ title: v })} placeholder="最優秀新人賞 / お題タイトル" />
              <LabeledInput label="タイトル (EN)" value={state.titleEn} onChange={(v) => update({ titleEn: v })} />
              <LabeledInput label="質問文 (JA)" value={state.question} onChange={(v) => update({ question: v })} placeholder="Q. もっともふさわしいのは？" />
              <LabeledInput label="質問文 (EN)" value={state.questionEn} onChange={(v) => update({ questionEn: v })} />
            </Section>

            {/* 3 つの選択肢 */}
            <Section title="3 つの選択肢">
              {state.choices.slice(0, 3).map((c, i) => (
                <ChoiceEditor
                  key={i}
                  index={i + 1}
                  choice={c}
                  onChange={(patch) => {
                    const next = [...state.choices];
                    next[i] = { ...c, ...patch };
                    update({ choices: next });
                  }}
                />
              ))}
            </Section>

            {/* 表示モード */}
            <Section title="投票結果の表示">
              <div className="flex gap-2">
                <button onClick={() => update({ display: 'count' })} className={cn('flex-1 flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-bold', state.display === 'count' ? 'border-amber-500 bg-amber-900/40 text-amber-200' : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800')}>
                  <Hash className="h-3.5 w-3.5" />投票数
                </button>
                <button onClick={() => update({ display: 'percent' })} className={cn('flex-1 flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-bold', state.display === 'percent' ? 'border-amber-500 bg-amber-900/40 text-amber-200' : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800')}>
                  <Percent className="h-3.5 w-3.5" />パーセント
                </button>
              </div>
            </Section>

            {/* 言語 */}
            <Section title="表示言語">
              <div className="flex gap-2">
                {(['ja','en'] as const).map((l) => (
                  <button key={l} onClick={() => update({ lang: l })}
                    className={cn('flex-1 rounded-md border px-3 py-2 text-xs font-black tracking-widest',
                      state.lang === l ? 'border-amber-500 bg-amber-900/40 text-amber-200' : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800')}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </Section>
          </div>

          {/* 下部: ステップ + TAKE */}
          <div className="shrink-0 border-t border-slate-800 bg-slate-900/50 p-3 space-y-2">
            <div className="text-[10px] font-black tracking-widest text-slate-400">フロー</div>
            <div className="grid grid-cols-4 gap-1.5">
              {STEP_LABELS.map(({ step, label, desc }) => (
                <div key={step}
                  className={cn('rounded-lg border px-2 py-1.5 text-left',
                    state.step === step ? 'border-amber-500 bg-amber-950/40 ring-1 ring-amber-700/40' : 'border-slate-800 bg-slate-900/40 opacity-60')}>
                  <div className={cn('text-[10px] font-black tracking-wider leading-none', state.step === step ? 'text-amber-300' : 'text-slate-300')}>{label}</div>
                  <div className="text-[9px] font-medium text-slate-400 mt-1 leading-tight">{desc}</div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-slate-400 leading-snug">
              {state.step === 'idle'   && <>「TAKE」で 30 秒のアンケートを開始 (33s 後に自動で結果へ)</>}
              {state.step === 'poll'   && <>カウントダウン中。「TAKE」で結果画面へ強制移行</>}
              {state.step === 'reveal' && state.revealPhase === 0 && <>SHAKE 中 — 「TAKE」で確定 → 棒伸びきり後に自動で No.1 1S</>}
              {state.step === 'reveal' && state.revealPhase === 1 && <>RESULT 表示中 — まもなく自動で No.1 1S へ</>}
              {state.step === 'winner' && <>GRAND PRIX 表示中 — 「TAKE」でリセット</>}
            </div>
            <div className="flex gap-2">
              <button onClick={take} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 text-sm font-black tracking-widest uppercase">
                <Send className="h-4 w-4" />TAKE
              </button>
              <button onClick={goClear} disabled={state.step === 'idle'} className={cn('flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black tracking-widest uppercase', state.step !== 'idle' ? 'bg-slate-700 hover:bg-slate-600 text-slate-100' : 'bg-slate-900/40 text-slate-500 cursor-not-allowed')}>
                <X className="h-4 w-4" />CLEAR
              </button>
              <button onClick={() => clear()} className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-2.5 text-xs font-bold text-slate-300" title="部屋を完全リセット">
                RESET
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-2">
      <div className="text-[10px] font-black tracking-widest text-slate-400">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function LabeledInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold text-slate-400">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500" />
    </label>
  );
}

function ChoiceEditor({ index, choice, onChange }: { index: number; choice: PollChoice; onChange: (patch: Partial<PollChoice>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const onFile = (f: File) => {
    if (!f) return;
    // 200KB を超える画像は適度に圧縮 (canvas resize)
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // 縮小処理
      const img = new Image();
      img.onload = () => {
        const max = 480;
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * r), h = Math.round(img.height * r);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { onChange({ photoDataUrl: dataUrl }); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL('image/jpeg', 0.82);
        onChange({ photoDataUrl: out });
      };
      img.onerror = () => onChange({ photoDataUrl: dataUrl });
      img.src = dataUrl;
    };
    reader.readAsDataURL(f);
  };

  const COLORS = ['#5db4ff', '#ff8c7a', '#7eea9c'];
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2.5">
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-base font-black text-white" style={{ background: COLORS[index - 1] ?? '#888' }}>
          {index}
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <input value={choice.name} onChange={(e) => onChange({ name: e.target.value })} placeholder={`選択肢${index} 名前 (必須)`}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm font-semibold text-slate-100 focus:outline-none focus:border-amber-500" />
          <input value={choice.nameEn} onChange={(e) => onChange({ nameEn: e.target.value })} placeholder="Name (EN)"
            className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-amber-500" />
          <input value={choice.company} onChange={(e) => onChange({ company: e.target.value })} placeholder="会社名・所属 (任意)"
            className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-amber-500" />
          <input value={choice.companyEn} onChange={(e) => onChange({ companyEn: e.target.value })} placeholder="Company (EN, 任意)"
            className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-400 focus:outline-none focus:border-amber-500" />
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] font-semibold text-slate-400">投票数</span>
            <input
              type="text" inputMode="numeric"
              value={String(choice.voteCount)}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d]/g, '');
                const n = cleaned === '' ? 0 : parseInt(cleaned, 10);
                onChange({ voteCount: isNaN(n) ? 0 : Math.max(0, n) });
              }}
              onFocus={(e) => e.target.select()}
              className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-sm font-bold text-slate-100 focus:outline-none focus:border-amber-500"
              placeholder="0"
            />
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-center gap-1">
          <button
            onClick={() => fileRef.current?.click()}
            className="relative w-16 h-16 rounded-md overflow-hidden bg-slate-800 border border-slate-700 hover:border-amber-500 transition-all flex items-center justify-center"
            title="画像をアップロード (任意)"
          >
            {choice.photoDataUrl
              ? <img src={choice.photoDataUrl} alt="" className="w-full h-full object-cover" />
              : <ImageIcon className="h-5 w-5 text-slate-500" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
          {choice.photoDataUrl && (
            <button onClick={() => onChange({ photoDataUrl: null })} className="text-[9px] text-slate-400 hover:text-red-400 inline-flex items-center gap-0.5">
              <ImageOff className="h-2.5 w-2.5" />削除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
