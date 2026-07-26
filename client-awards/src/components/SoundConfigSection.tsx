import { useEffect, useRef, useState, useCallback } from 'react';
import api from '@/lib/api';
import { Music, Upload, Trash2, Play, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { confirmAction } from '@gmo-onair/shared/src/client/ui';

/**
 * 演出SE 設定セクション (イベント編集画面) — v2.9.122
 * 各 CG ステップ (+ RANKS は開始順位別) に wav/mp3 を割り当て / 試聴 / 音量 / 削除。
 */
interface Sound {
  id: number;
  layer: 'ranking' | 'quiz';
  step: string;
  rankStart: number | null;
  url: string;
  volume: number;
  enabled: boolean;
}

const RANKING_SLOTS: { step: string; rankStart: number | null; label: string }[] = [
  { step: 'title', rankStart: null, label: 'タイトル' },
  { step: 'nominees', rankStart: null, label: 'ノミネート一覧' },
  { step: 'ranks52', rankStart: 5, label: 'ランキングバー（5位から）' },
  { step: 'ranks52', rankStart: 4, label: 'ランキングバー（4位から）' },
  { step: 'ranks52', rankStart: 3, label: 'ランキングバー（3位から）' },
  { step: 'ranks52', rankStart: 2, label: 'ランキングバー（2位のみ）' },
  { step: 'top3', rankStart: null, label: 'BEST3' },
  { step: 'final-pitch', rankStart: null, label: 'ファイナルピッチ' },
  { step: 'winner-bar', rankStart: null, label: '1位ランキングバー' },
  { step: 'oneshot', rankStart: null, label: '大賞（ONE SHOT）' },
  { step: 'celebration', rankStart: null, label: '紙吹雪（CELEB）' },
];
// 出題カウントダウン (poll) は秒数別 (rankStart=秒数) に音源を持てるので別 UI で扱う。
const QUIZ_FIXED_SLOTS: { step: string; rankStart: number | null; label: string }[] = [
  { step: 'answer-check', rankStart: null, label: '集計（アンサーチェック）' },
  { step: 'correct-reveal', rankStart: null, label: '正解発表' },
];
const POLL_SEC_PRESETS = [5, 10, 15, 20, 30, 60, 90, 120];

function matchSound(sounds: Sound[], layer: string, step: string, rankStart: number | null): Sound | undefined {
  return sounds.find((s) => s.layer === layer && s.step === step &&
    (rankStart == null ? s.rankStart == null : s.rankStart === rankStart));
}

export default function SoundConfigSection({ eventId }: { eventId: number }) {
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pollSecInput, setPollSecInput] = useState('30');
  const previewRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(() => {
    api.get(`/awards/events/${eventId}/sounds`)
      .then((r) => setSounds((r.data?.data ?? []) as Sound[]))
      .catch(() => { /* noop */ });
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  const flash = (kind: 'ok' | 'err', text: string) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

  const slotKey = (layer: string, step: string, rs: number | null) => `${layer}:${step}:${rs ?? ''}`;

  const onUpload = async (layer: string, step: string, rankStart: number | null, file: File) => {
    if (!/\.(wav|mp3)$/i.test(file.name)) { flash('err', 'wav / mp3 のみ対応です'); return; }
    const key = slotKey(layer, step, rankStart);
    setBusy(key);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('layer', layer);
      fd.append('step', step);
      if (rankStart != null) fd.append('rankStart', String(rankStart));
      await api.post(`/awards/events/${eventId}/sounds`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      flash('ok', '音源を登録しました');
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      flash('err', err?.response?.data?.error?.message || 'アップロードに失敗しました');
    } finally { setBusy(null); }
  };

  const onVolume = async (s: Sound, volume: number) => {
    setSounds((prev) => prev.map((x) => (x.id === s.id ? { ...x, volume } : x)));
    try { await api.put(`/awards/sounds/${s.id}`, { volume }); } catch { /* noop */ }
  };
  const onDelete = async (s: Sound) => {
    if (!(await confirmAction({ title: 'この音源を削除しますか？', confirmLabel: '削除する', tone: 'danger' }))) return;
    try { await api.delete(`/awards/sounds/${s.id}`); flash('ok', '削除しました'); load(); }
    catch { flash('err', '削除に失敗しました'); }
  };
  const preview = (url: string) => {
    if (!previewRef.current) previewRef.current = new Audio();
    const a = previewRef.current;
    a.pause(); a.currentTime = 0; a.src = url; a.volume = 1; a.play().catch(() => {});
  };

  const renderSlots = (layer: 'ranking' | 'quiz', slots: typeof RANKING_SLOTS) => (
    <div className="space-y-1.5">
      {slots.map((slot) => {
        const s = matchSound(sounds, layer, slot.step, slot.rankStart);
        const key = slotKey(layer, slot.step, slot.rankStart);
        return (
          <div key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <span className="flex-1 min-w-0 truncate font-medium text-slate-700">{slot.label}</span>
            {s ? (
              <>
                <button onClick={() => preview(s.url)} className="flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-200 px-2 py-1 text-xs" title="試聴">
                  <Play className="h-3.5 w-3.5" /> 試聴
                </button>
                <input type="range" min={0} max={100} value={Math.round(s.volume * 100)}
                  onChange={(e) => onVolume(s, Number(e.target.value) / 100)}
                  className="w-20 accent-cyan-600" title={`音量 ${Math.round(s.volume * 100)}%`} />
                <label className="flex items-center gap-1 rounded bg-cyan-50 hover:bg-cyan-100 px-2 py-1 text-xs text-cyan-700 cursor-pointer">
                  差し替え
                  <input type="file" accept=".wav,.mp3,audio/wav,audio/mpeg" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(layer, slot.step, slot.rankStart, f); e.currentTarget.value = ''; }} />
                </label>
                <button onClick={() => onDelete(s)} className="rounded p-1 text-red-500 hover:bg-red-50" title="削除">
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : (
              <label className="flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-xs text-slate-600 cursor-pointer">
                {busy === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                wav/mp3 を追加
                <input type="file" accept=".wav,.mp3,audio/wav,audio/mpeg" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(layer, slot.step, slot.rankStart, f); e.currentTarget.value = ''; }} />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );

  // 出題カウントダウン (poll) の秒数別 SE。rankStart = 秒数。
  const renderQuizCountdown = () => {
    const pollSounds = sounds
      .filter((s) => s.layer === 'quiz' && s.step === 'poll' && s.rankStart != null)
      .sort((a, b) => (a.rankStart ?? 0) - (b.rankStart ?? 0));
    const addSec = Math.floor(Number(pollSecInput));
    const addValid = Number.isFinite(addSec) && addSec > 0 && addSec <= 32767;
    return (
      <div className="space-y-1.5">
        {pollSounds.map((s) => {
          const key = slotKey('quiz', 'poll', s.rankStart);
          return (
            <div key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <span className="flex-1 min-w-0 truncate font-medium text-slate-700">出題カウントダウン（{s.rankStart}秒）</span>
              <button onClick={() => preview(s.url)} className="flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-200 px-2 py-1 text-xs" title="試聴">
                <Play className="h-3.5 w-3.5" /> 試聴
              </button>
              <input type="range" min={0} max={100} value={Math.round(s.volume * 100)}
                onChange={(e) => onVolume(s, Number(e.target.value) / 100)}
                className="w-20 accent-cyan-600" title={`音量 ${Math.round(s.volume * 100)}%`} />
              <label className="flex items-center gap-1 rounded bg-cyan-50 hover:bg-cyan-100 px-2 py-1 text-xs text-cyan-700 cursor-pointer">
                差し替え
                <input type="file" accept=".wav,.mp3,audio/wav,audio/mpeg" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload('quiz', 'poll', s.rankStart, f); e.currentTarget.value = ''; }} />
              </label>
              <button onClick={() => onDelete(s)} className="rounded p-1 text-red-500 hover:bg-red-50" title="削除">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {pollSounds.length === 0 && (
          <p className="px-1 text-[11px] text-slate-500">秒数を指定して出題カウントダウンの音源を追加してください（出題クイズの制限秒数に一致する音源が再生されます）。</p>
        )}
        {/* 秒数を指定して追加 */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm">
          <span className="text-xs font-medium text-slate-600">秒数</span>
          <input type="number" min={1} max={32767} value={pollSecInput}
            onChange={(e) => setPollSecInput(e.target.value)}
            className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
          <span className="text-xs text-slate-500">秒</span>
          <label className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs cursor-pointer ${addValid ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-slate-50 text-slate-300 cursor-not-allowed'}`}>
            {busy === slotKey('quiz', 'poll', addValid ? addSec : null) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            この秒数の音源を追加
            <input type="file" accept=".wav,.mp3,audio/wav,audio/mpeg" className="hidden" disabled={!addValid}
              onChange={(e) => { const f = e.target.files?.[0]; if (f && addValid) onUpload('quiz', 'poll', addSec, f); e.currentTarget.value = ''; }} />
          </label>
          <div className="flex flex-wrap items-center gap-1">
            {POLL_SEC_PRESETS.map((n) => (
              <button key={n} onClick={() => setPollSecInput(String(n))}
                className={`rounded px-2 py-0.5 text-[11px] ${addSec === n ? 'bg-cyan-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
                {n}秒
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-sm font-bold text-slate-800">
        <Music className="h-4 w-4 text-cyan-600" />
        演出SE（効果音）
        <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{sounds.length} 件</span>
        <span className="ml-auto text-xs text-slate-500">{open ? '閉じる ▲' : '開く ▼'}</span>
      </button>

      {msg && (
        <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${msg.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-[11px] leading-relaxed text-slate-500">
            CGステップに wav / mp3 を割り当てると、出力URL（OBS）でそのステップに切り替わった瞬間に再生されます。
            音は1チャンネルで、<strong>次のTAKEで前の音は即カットアウト</strong>。鳴らすのは出力URLに <code>?audio=1</code> を付けた1枚だけ。
            ランキングバーは開始順位（5/4/3/2位）ごとに別音源を登録できます（人数に応じて自動で選択）。
            クイズの出題カウントダウンは制限秒数（5/10/…/120 秒など任意）ごとに別音源を登録でき、出題クイズの秒数に一致する音源が再生されます（無ければ汎用にフォールバック）。
          </p>
          <div>
            <div className="mb-1.5 text-xs font-bold tracking-wider text-slate-500">ランキングCG</div>
            {renderSlots('ranking', RANKING_SLOTS)}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-bold tracking-wider text-slate-500">クイズ / アンケートCG</div>
            {renderQuizCountdown()}
            <div className="mt-1.5">{renderSlots('quiz', QUIZ_FIXED_SLOTS)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
