/**
 * 案件フォームの「日程」だけを持つフック (v4)
 *
 * ── `datesTouched` が要る理由（実データが消えた不具合） ─────────────
 *
 * サーバーは `dates` を受け取ると `project_dates` を**全 DELETE → 再 INSERT** し、
 * さらに `event_start=MIN` / `event_end=MAX` を送られた日付だけで上書きします。
 * 編集モードでは本番日・リハ日の欄が空のまま始まっていたので、
 * **日程が3つ以上ある案件を開いて何も変えずに保存すると日程が消えていました**
 * （実 DB で再現: 11/13 リハ・11/14 本番・11/15 撤去 → 11/14 の1行だけになり、
 *   期間も 11/13〜11/15 から 11/14〜11/14 になった）。
 *
 * 対処は2段です。
 *   1. 開いたときに**ラベルで**欄へ読み戻す（保存時に付けているのと同じラベル）
 *   2. **人が日程の欄に触っていないときは `dates` を送らない**
 *
 * 読み戻しだけだと、ラベルの付いていない古いデータで同じ事故が起きます。
 * **この2つを崩さないこと。** 分割でいちばん壊しやすいのがここです。
 */
import { useEffect, useState } from 'react';
import type { ExtraDate } from './types';

const LOCATION_NOTE_KEY = 'studio_location_note_history';

export function getLocationHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(LOCATION_NOTE_KEY) || '[]'); } catch { return []; }
}

export function saveLocationNote(note: string): void {
  const history = getLocationHistory().filter((h) => h !== note).slice(0, 14);
  localStorage.setItem(LOCATION_NOTE_KEY, JSON.stringify([note, ...history]));
}

export interface ProjectSchedule {
  roomIds: string[];
  setRoomIds: React.Dispatch<React.SetStateAction<string[]>>;
  locationNote: string;
  setLocationNote: (v: string) => void;

  productionStart: string;
  productionEnd: string;
  productionMultiDay: boolean;
  hasRehearsal: boolean;
  rehearsalStart: string;
  rehearsalEnd: string;
  rehearsalMultiDay: boolean;
  extraDates: ExtraDate[];

  /** 日程の欄に人が触ったか。**触っていないなら `dates` を送らない** */
  touched: boolean;

  setProductionStart: (v: string) => void;
  setProductionEnd: (v: string) => void;
  setProductionMultiDay: (v: boolean) => void;
  setHasRehearsal: (v: boolean) => void;
  setRehearsalStart: (v: string) => void;
  setRehearsalEnd: (v: string) => void;
  setRehearsalMultiDay: (v: boolean) => void;
  addExtraDate: () => void;
  updateExtraDate: (index: number, patch: Partial<ExtraDate>) => void;
  removeExtraDate: (index: number) => void;

  /** 保存に渡す日付の配列を組み立てる（重複日は最初のラベルを優先） */
  buildDates: () => Array<{ date: string; label: string | null }>;
  /** 本番の最終日（複数日でなければ本番日そのもの） */
  productionLastDay: string;
}

export function useProjectSchedule(project: { dates?: unknown } | undefined): ProjectSchedule {
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [locationNote, setLocationNote] = useState('');

  const [productionStart, setProdStart] = useState('');
  const [productionEnd, setProdEnd] = useState('');
  const [productionMultiDay, setProdMulti] = useState(false);
  const [hasRehearsal, setHasReh] = useState(false);
  const [rehearsalStart, setRehStart] = useState('');
  const [rehearsalEnd, setRehEnd] = useState('');
  const [rehearsalMultiDay, setRehMulti] = useState(false);
  const [extraDates, setExtraDates] = useState<ExtraDate[]>([]);
  const [touched, setTouched] = useState(false);

  /**
   * 日程の欄を書き換える。**印を付けるのを忘れられない形**にしてある
   * （素の setter を直接呼ぶと、上の「触っていないなら送らない」が効かなくなる）。
   */
  const touch = <T,>(setter: (v: T) => void) => (v: T) => { setTouched(true); setter(v); };

  useEffect(() => {
    if (!project || !Array.isArray(project.dates)) return;
    // **ラベルで本番・リハに振り分ける**（保存時に付けているのと同じラベル）。
    // 振り分けないと欄が空のまま始まり、保存したときに日程が消えます。
    const rows = project.dates as Array<{ date: string; label: string | null }>;
    const pick = (label: string) => rows.find((d) => d.label === label)?.date || '';
    const prodStart = pick('本番');
    const prodEnd = pick('本番（最終日）');
    const rehStart = pick('リハ');
    const rehEnd = pick('リハ（最終日）');
    setProdStart(prodStart);
    setProdEnd(prodEnd);
    setProdMulti(!!prodEnd);
    setHasReh(!!rehStart);
    setRehStart(rehStart);
    setRehEnd(rehEnd);
    setRehMulti(!!rehEnd);
    // 上の4つに当てはまらない日付だけが「追加の日程」。
    // **event_start / event_end では振り分けない** — 同じ日に本番とリハがあると
    // 片方が消えるうえ、ラベルを持つ日程が「追加の日程」に落ちる
    const used = new Set([prodStart, prodEnd, rehStart, rehEnd].filter(Boolean));
    setExtraDates(rows.filter((d) => !used.has(d.date)).map((d) => ({ date: d.date, label: d.label || '' })));
    setTouched(false);
  }, [project]);

  const buildDates = (): Array<{ date: string; label: string | null }> => {
    const all: Array<{ date: string; label: string | null }> = [];
    if (productionStart) {
      all.push({ date: productionStart, label: '本番' });
      if (productionMultiDay && productionEnd && productionEnd !== productionStart) {
        all.push({ date: productionEnd, label: '本番（最終日）' });
      }
    }
    if (hasRehearsal && rehearsalStart) {
      all.push({ date: rehearsalStart, label: 'リハ' });
      if (rehearsalMultiDay && rehearsalEnd && rehearsalEnd !== rehearsalStart) {
        all.push({ date: rehearsalEnd, label: 'リハ（最終日）' });
      }
    }
    extraDates.forEach((d) => { if (d.date) all.push({ date: d.date, label: d.label || null }); });
    return all;
  };

  return {
    roomIds, setRoomIds, locationNote, setLocationNote,
    productionStart, productionEnd, productionMultiDay,
    hasRehearsal, rehearsalStart, rehearsalEnd, rehearsalMultiDay,
    extraDates, touched,

    setProductionStart: touch(setProdStart),
    setProductionEnd: touch(setProdEnd),
    setProductionMultiDay: (v: boolean) => { setTouched(true); setProdMulti(v); if (!v) setProdEnd(''); },
    setHasRehearsal: (v: boolean) => {
      setTouched(true);
      setHasReh(v);
      if (!v) { setRehStart(''); setRehEnd(''); setRehMulti(false); }
    },
    setRehearsalStart: touch(setRehStart),
    setRehearsalEnd: touch(setRehEnd),
    /**
     * リハの「複数日程」。**本番側と同じく `touched` を立てます。**
     *
     * 分割前はここだけ立てていませんでした（本番側は立てていた）。
     * そのままだと、**リハの複数日程を切り替えただけの編集が保存されません** —
     * `touched` が立たないので `dates` を送らず、サーバーは何も書き換えないためです。
     * 押した人には「保存しました」と出るのに次に開くと元に戻っている、という形になります。
     */
    setRehearsalMultiDay: (v: boolean) => { setTouched(true); setRehMulti(v); if (!v) setRehEnd(''); },
    addExtraDate: () => { setTouched(true); setExtraDates((prev) => [...prev, { date: '', label: '' }]); },
    updateExtraDate: (index, patch) => {
      setTouched(true);
      setExtraDates((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
    },
    removeExtraDate: (index) => {
      setTouched(true);
      setExtraDates((prev) => prev.filter((_, i) => i !== index));
    },

    buildDates,
    productionLastDay: productionMultiDay ? productionEnd : productionStart,
  };
}
