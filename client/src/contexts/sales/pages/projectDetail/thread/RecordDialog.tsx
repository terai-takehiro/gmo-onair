/**
 * 打合せを録音する / 音声ファイルを投げる (v4 ⑥ やり取りタブ)
 *
 * ── その場で録るのと、ファイルを選ぶのの両方 ────────────────
 *
 * オンライン会議は**録画ツール側に音声が残る**ことが多いので、
 * 「その場で録る」だけだと使えません。両方置きます。
 *
 * ── 録音の設定 ──────────────────────────────────────────────
 *
 * `audioBitsPerSecond: 32000`。Whisper の上限が 25MB なので、
 * **32kbps なら約100分**入ります。既定 (128kbps) だと 25 分で頭打ちになり、
 * 長い打合せの後半が丸ごと消えます。会話の聞き取りに 32kbps で足ります。
 *
 * ── 録っていることを伝える ────────────────────────────────
 *
 * 取引先の声が入るので、**画面に「相手に伝えてください」と出します**。
 * ここを書かないと、黙って録る運用が既定になってしまいます。
 */
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { StatValue } from '@gmo-onair/shared/src/client/ui/numbers';
import { localDateStr } from '@/lib/format';
import { recordingFileName } from '@gmo-onair/shared/src/client-v4/recording';

/** Whisper の上限。サーバー側 (`minutes-ai.service`) と同じ値 */
const MAX_BYTES = 25 * 1024 * 1024;
/** 32kbps。**既定の 128kbps だと 25 分で上限に当たる** */
const BITRATE = 32_000;

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function RecordDialog({
  open, onOpenChange, onSubmit, busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (file: File, metOn: string) => void;
  busy: boolean;
}) {
  const [metOn, setMetOn] = useState(localDateStr(new Date()));
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 開き直すたびに前回の録音が残らないようにする */
  useEffect(() => {
    if (open) return;
    setRecording(false); setSeconds(0); setFile(null); setError(null);
    recorder.current?.state === 'recording' && recorder.current.stop();
    if (timer.current) clearInterval(timer.current);
  }, [open]);

  // **画面を離れてもマイクを掴んだままにしない。** 掴みっぱなしだと
  // ブラウザの録音インジケータが消えず、録られ続けていると思われる
  useEffect(() => () => {
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
    if (timer.current) clearInterval(timer.current);
  }, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { audioBitsPerSecond: BITRATE });
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' });
        // ⚠️ 拡張子は **`mr.mimeType` から決める** — `.webm` 決め打ちだと
        // **iPhone / Safari（mp4）で必ず文字起こしに失敗する**（Whisper は拡張子で判断する）
        setFile(new File(
          [blob],
          recordingFileName(`打合せ_${metOn}`, mr.mimeType || blob.type),
          { type: blob.type },
        ));
      };
      mr.start(1000);
      recorder.current = mr;
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      // 権限を断られた / マイクが無い。**理由を出す** — 押しても何も起きないのが最悪
      setError('マイクを使えませんでした。ブラウザの許可を確認するか、音声ファイルを選んでください。');
    }
  };

  const stop = () => {
    recorder.current?.stop();
    setRecording(false);
    if (timer.current) clearInterval(timer.current);
  };

  const pick = (f: File | null) => {
    setError(null);
    if (f && f.size > MAX_BYTES) {
      setError(`音声が大きすぎます（${Math.round(f.size / 1024 / 1024)}MB / 上限 25MB）。分けて録ってください。`);
      setFile(null);
      return;
    }
    setFile(f);
  };

  const tooBig = !!file && file.size > MAX_BYTES;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="打合せを録音して議事録にする"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button
            disabled={!file || recording || busy || tooBig}
            onClick={() => file && onSubmit(file, metOn)}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            文字起こしをはじめる
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sub text-muted-foreground">
          文字起こし（Whisper）のあと、AI が決定事項と持ち帰りを下書きします。
          <strong className="font-bold">確定するのは自分で</strong>、直した内容は AI の直しに使われます。
        </p>

        {/* **黙って録らない。** ここを書かないと黙って録る運用が既定になる */}
        <p className="rounded-note text-sub flex items-start gap-2 bg-warning-surface px-3 py-2 text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-bold">録音することを相手にお伝えください。</strong>
            音声はこのあと文字にしたら<strong className="font-bold">保存せずに捨てます</strong>（残るのは文字だけです）。
          </span>
        </p>

        <div>
          <Label>打合せの日</Label>
          <Input type="date" value={metOn} onChange={(e) => setMetOn(e.target.value)} />
        </div>

        <div className="rounded-card flex flex-col items-center gap-3 border border-border bg-surface-subtle p-4">
          {recording ? (
            <>
              <StatValue size="lg" className="text-destructive" aria-live="polite">
                {mmss(seconds)}
              </StatValue>
              <span className="text-sub text-muted-foreground">録音しています（約100分まで）</span>
              <Button variant="outline" onClick={stop}>
                <Square className="mr-2 h-4 w-4 text-destructive" aria-hidden="true" />止める
              </Button>
            </>
          ) : (
            <>
              <Button onClick={start} disabled={busy} className="h-12 px-6">
                <Mic className="mr-2 h-5 w-5" aria-hidden="true" />その場で録音する
              </Button>
              <span className="text-note text-muted-foreground">または</span>
              <label className="min-h-tap rounded-control inline-flex cursor-pointer items-center gap-2 border border-border bg-card px-4 text-sub font-bold text-secondary-foreground hover:border-primary-border">
                <Upload className="h-4 w-4" aria-hidden="true" />音声ファイルを選ぶ
                <input
                  type="file"
                  accept="audio/*,video/mp4,video/webm"
                  className="sr-only"
                  onChange={(e) => pick(e.target.files?.[0] ?? null)}
                />
              </label>
            </>
          )}
        </div>

        {file && !recording && (
          <p className="text-sub text-secondary-foreground">
            <strong className="font-bold">{file.name}</strong>
            <span className="font-number ml-2 text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(1)}MB
            </span>
          </p>
        )}
        {error && <p className="text-sub text-destructive">{error}</p>}

        <p className="text-note text-muted-foreground">
          文字起こしは<strong className="font-bold">1時間の録音で数分</strong>かかります。
          投げたあとは画面を閉じても進みます（できたらこのタブに出ます）。
        </p>
      </div>
    </FormDialog>
  );
}
