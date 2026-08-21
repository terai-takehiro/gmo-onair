// WEB会議 1枚のカード（配信設定の下段）。
// ⚠️ 素の <input> で構わない（useState のローカル状態。impl doc §5-2）。
// ⚠️ Meeting.meetingId_（行の id）と joinId（会議側のID）を取り違えないこと（08 §5-1）。
import { useState } from 'react';
import { Eye, EyeOff, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { notifySuccess, notifyError } from '@/lib/notify';
import type { Meeting } from '@/lib/deviceSettingsApi';
import { MEETING_TOOLS, VIDEO_INPUT_OPTIONS, AUDIO_INPUT_OPTIONS, showsJoinFields, buildCopyText } from './meetingFields';

const fieldCls =
  'h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    notifySuccess(`${label}をコピーしました`);
  } catch {
    notifyError('コピーに失敗しました');
  }
}

export default function MeetingCard({
  meeting,
  onChange,
  onDelete,
}: {
  meeting: Meeting;
  onChange: (next: Meeting) => void;
  onDelete: () => void;
}) {
  const [showPasscode, setShowPasscode] = useState(false);
  const set = <K extends keyof Meeting>(key: K, value: Meeting[K]) => onChange({ ...meeting, [key]: value });
  const showJoin = showsJoinFields(meeting.tool);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <input
          className="min-w-0 flex-1 border-b border-transparent bg-transparent text-sm font-semibold focus-visible:border-input focus-visible:outline-none"
          value={meeting.label ?? ''}
          onChange={(e) => set('label', e.target.value || undefined)}
          placeholder="呼び名（例: 本番用）"
        />
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" className="h-9" onClick={() => copyText(meeting.url, 'URL')}>
            <Copy className="mr-1 h-3.5 w-3.5" /> URLをコピー
          </Button>
          <Button size="sm" variant="ghost" className="h-9" onClick={() => copyText(buildCopyText(meeting, true), '会議情報（パスコード含む）')}>
            全部まとめてコピー
          </Button>
          <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-destructive" onClick={onDelete} aria-label="この会議を削除">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>どのツールか</Label>
          <select className={fieldCls} value={meeting.tool} onChange={(e) => set('tool', e.target.value as Meeting['tool'])}>
            {MEETING_TOOLS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {meeting.tool === 'その他' && (
          <div>
            <Label>ツール名</Label>
            <input className={fieldCls} value={meeting.toolOther ?? ''} onChange={(e) => set('toolOther', e.target.value)} />
          </div>
        )}
        <div className="sm:col-span-2">
          <Label>会議URL</Label>
          <input className={`${fieldCls} cond`} style={{ transform: 'scaleX(0.94)', transformOrigin: 'left' }} value={meeting.url} onChange={(e) => set('url', e.target.value)} placeholder="https://..." />
        </div>

        {showJoin && (
          <>
            <div>
              <Label>会議ID</Label>
              <input className={fieldCls} value={meeting.joinId ?? ''} onChange={(e) => set('joinId', e.target.value)} />
            </div>
            <div>
              <Label>パスコード</Label>
              <div className="flex items-center gap-1">
                <input
                  type={showPasscode ? 'text' : 'password'}
                  className={fieldCls}
                  value={meeting.passcode ?? ''}
                  onChange={(e) => set('passcode', e.target.value)}
                />
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
                  onClick={() => setShowPasscode((v) => !v)}
                  aria-label={showPasscode ? 'パスコードを隠す' : 'パスコードを表示'}
                >
                  {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </>
        )}
        {!showJoin && (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {meeting.tool} は会議ID・パスコードを URL に含みます（電話会議IDなど別の番号は備考へ）。
          </p>
        )}

        <div>
          <Label>入力映像設定</Label>
          <select className={fieldCls} value={meeting.videoInput} onChange={(e) => set('videoInput', e.target.value as Meeting['videoInput'])}>
            {VIDEO_INPUT_OPTIONS.map((v) => <option key={v} value={v}>{v === 'other' ? 'その他' : v}</option>)}
          </select>
        </div>
        {meeting.videoInput === 'other' && (
          <div>
            <Label>入力映像（その他）</Label>
            <input className={fieldCls} value={meeting.videoInputOther ?? ''} onChange={(e) => set('videoInputOther', e.target.value)} />
          </div>
        )}
        <div>
          <Label>入力音声設定</Label>
          <select className={fieldCls} value={meeting.audioInput} onChange={(e) => set('audioInput', e.target.value as Meeting['audioInput'])}>
            {AUDIO_INPUT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label>備考</Label>
          <input className={fieldCls} value={meeting.note ?? ''} onChange={(e) => set('note', e.target.value)} />
        </div>
      </div>
    </div>
  );
}
