/**
 * WEB会議 1件の詳細（インスペクタ）。配信先の `DestinationInspector` と**同じ作り**にしてある。
 *
 * ⚠️ ファイル名は `MeetingCard.tsx` のままにした（並行作業中なのでファイルの移動はしない）。
 *    役割はもう「カード」ではなく、一覧（`MeetingList.tsx`）の隣に出す**詳細**。
 *
 * ⚠️ 直したこと（監査 2026-08-22・実機で確認したもの）:
 *   ① カードの上部が `flex` 1行で、呼び名の `<input>` とコピー2つ＋削除を詰め込んでいた。
 *      375px 幅（iPhone SE）では**呼び名が読めない幅まで潰れて**、現場でいちばん打つ欄が
 *      使えなかった。→ 呼び名は独立した欄にし、操作は縦積み（`sm:` で横並び）にする。
 *   ② 「全部まとめてコピー」がパスコードを**常に**含んでいた。Slack に貼った時点で
 *      会議に誰でも入れる状態が漏れる（会議URL・パスコードは入室の鍵・08 §5-5）。
 *      →「URLだけコピー」と「パスコードも含めてコピー」に割り、後者は押す前に
 *        分かるよう警告色にする。
 *   ③ 会議URLが空でも画面には何も出ず、保存して**サーバーの zod に弾かれて初めて**分かった。
 *      しかも1件でも弾かれると配信先ごと保存されない。→ `meetingIssues()` を欄の下に赤字で出す。
 *   ④ 権限の分岐が無く、閲覧しかできない人（qsheet が reader）でも全部打ててしまい、
 *      最後に「保存に失敗しました」とだけ出て打った内容が捨てられていた。→ `canEdit` で止める。
 *
 * ⚠️ 素の `<input value onChange>` で構わない（親の useState。impl doc §5-2）。
 * ⚠️ `Meeting.meetingId_`（行の id）と `joinId`（会議側のID）を取り違えないこと（08 §5-1）。
 */
import { useState } from 'react';
import { Eye, EyeOff, ChevronLeft, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { notifySuccess, notifyError } from '@/lib/notify';
import type { Meeting } from '@/lib/deviceSettingsApi';
import {
  MEETING_TOOLS, VIDEO_INPUT_OPTIONS, AUDIO_INPUT_OPTIONS,
  showsJoinFields, buildCopyText, toolBadgeClass, toolLabel,
  type MeetingIssue,
} from './meetingFields';

// 高さ 44px（min-h-tap 相当）・角丸は v4 の役割名。⚠️ `rounded-lg` は書かない
const fieldCls =
  'h-11 w-full min-w-0 rounded-control-lg border border-input bg-background px-3 text-sub ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground';
const badFieldCls = 'border-destructive-border bg-destructive-surface';

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    notifySuccess(`${label}をコピーしました`);
  } catch {
    notifyError('コピーできませんでした。', { description: 'URL を選んで、手動でコピーしてください。' });
  }
}

/** 欄の下の注記（理由があれば赤字で出す。`DestinationInspector` と同じ） */
function Note({ children, bad }: { children: React.ReactNode; bad?: boolean }) {
  return (
    <p className={cn('mt-1 text-note', bad ? 'text-destructive' : 'text-muted-foreground')}>
      {children}
    </p>
  );
}

export default function MeetingInspector({
  meeting,
  issues,
  canEdit,
  onChange,
  onDelete,
  onBack,
}: {
  meeting: Meeting;
  /** その場の点検結果（`meetingIssues()`）。欄の下に出す */
  issues: MeetingIssue[];
  canEdit: boolean;
  onChange: (next: Meeting) => void;
  onDelete: () => void;
  /** スマホ（1画面ずつ）で一覧に戻る。PC では出さない */
  onBack: () => void;
}) {
  const [showPasscode, setShowPasscode] = useState(false);
  const set = <K extends keyof Meeting>(key: K, value: Meeting[K]) => onChange({ ...meeting, [key]: value });
  const issueOf = (field: string) => issues.find((i) => i.field === field)?.message ?? null;
  const showJoin = showsJoinFields(meeting.tool);
  // ⚠️ パスコードを持たない会議で「パスコードも含めて」と書くと嘘になる。
  //    含めるものが無いときは文言も色も普通に戻す（§5-5「文言で分ける」）
  const hasPasscode = showJoin && !!meeting.passcode;

  return (
    <div className="w-full space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="flex min-h-tap items-center gap-1 rounded-control-md pr-2 text-list text-primary hover:bg-primary-surface sm:hidden"
      >
        <ChevronLeft className="h-5 w-5 shrink-0" /> 会議の一覧へ
      </button>

      <div className="flex items-center gap-2 border-b pb-2">
        <span className={cn('shrink-0 whitespace-nowrap rounded-badge px-2 py-1 text-badge', toolBadgeClass(meeting.tool))}>
          {toolLabel(meeting)}
        </span>
        <span className="min-w-0 flex-1 truncate text-cardtitle">
          {meeting.label || '（表示名なし）'}
        </span>
        {/* ⚠️ 編集できない人には削除を**出さない**（押せてから断られるのが最悪） */}
        {canEdit && (
          <Button size="sm" variant="ghost" className="h-11 shrink-0 text-destructive" onClick={onDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> 削除
          </Button>
        )}
      </div>

      {/* ⚠️ コピーは2つに割る（§5-5）。375px でも潰れないよう縦積み → sm: で横並び */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          className="h-11 flex-1"
          onClick={() => copyText(meeting.url, 'URL だけ（パスコードは含めていません）')}
          disabled={!meeting.url}
        >
          <Copy className="mr-1.5 h-4 w-4 shrink-0" /> URLだけコピー
        </Button>
        <Button
          variant="outline"
          className={cn(
            'h-11 flex-1',
            // 押す前に「鍵ごと配る」と分かる見た目にする
            hasPasscode && 'border-warning-border bg-warning-surface text-warning hover:bg-warning-surface',
          )}
          onClick={() => copyText(buildCopyText(meeting, hasPasscode), hasPasscode ? '会議情報（パスコードを含みます）' : '会議情報')}
        >
          <Copy className="mr-1.5 h-4 w-4 shrink-0" />
          {hasPasscode ? 'パスコードも含めてコピー' : 'まとめてコピー'}
        </Button>
      </div>

      <div>
        <Label htmlFor="mtg-label">表示名</Label>
        <input
          id="mtg-label"
          className={fieldCls}
          value={meeting.label ?? ''}
          onChange={(e) => set('label', e.target.value || undefined)}
          placeholder="本番用 / リハ用（登壇者）"
          disabled={!canEdit}
        />
        <Note>会議が2本以上あるときに、どれか見分けるための名前です。</Note>
        {issueOf('label') && <Note bad>{issueOf('label')}</Note>}
      </div>

      <div>
        <Label htmlFor="mtg-tool">どのツールか</Label>
        <select
          id="mtg-tool"
          className={fieldCls}
          value={meeting.tool}
          onChange={(e) => set('tool', e.target.value as Meeting['tool'])}
          disabled={!canEdit}
        >
          {MEETING_TOOLS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {meeting.tool === 'その他' && (
        <div>
          <Label htmlFor="mtg-tool-other">ツール名</Label>
          <input
            id="mtg-tool-other"
            className={cn(fieldCls, issueOf('toolOther') && badFieldCls)}
            value={meeting.toolOther ?? ''}
            onChange={(e) => set('toolOther', e.target.value)}
            aria-invalid={!!issueOf('toolOther')}
            disabled={!canEdit}
          />
          {issueOf('toolOther') && <Note bad>{issueOf('toolOther')}</Note>}
        </div>
      )}

      <div>
        <Label htmlFor="mtg-url">会議URL</Label>
        <input
          id="mtg-url"
          className={cn(fieldCls, issueOf('url') && badFieldCls)}
          value={meeting.url}
          onChange={(e) => set('url', e.target.value)}
          placeholder="https://..."
          aria-invalid={!!issueOf('url')}
          disabled={!canEdit}
        />
        {issueOf('url')
          ? <Note bad>{issueOf('url')}</Note>
          : <Note>現場で受け取った URL を、そのまま貼ってください。</Note>}
      </div>

      {/* ⚠️ ツールで出す欄を変える（08 §5-2）。**伏せた欄の値は消さない** —
          Zoom で入れた会議IDは Teams に変えても残り、戻せばそのまま出る */}
      {showJoin ? (
        <>
          <div>
            <Label htmlFor="mtg-join">会議ID</Label>
            <input
              id="mtg-join"
              className={cn(fieldCls, issueOf('joinId') && badFieldCls)}
              value={meeting.joinId ?? ''}
              onChange={(e) => set('joinId', e.target.value)}
              inputMode="numeric"
              disabled={!canEdit}
            />
            {issueOf('joinId') && <Note bad>{issueOf('joinId')}</Note>}
          </div>
          <div>
            <Label htmlFor="mtg-pass">パスコード</Label>
            {/* ⚠️ 既定は伏せ字。目のアイコンで出す（ストリームキーと同じ作法・§5-5）。
                誰がいつ出したかは記録しない（書き出しの経路が無いため・§5-5） */}
            <div className="flex items-center gap-1">
              <input
                id="mtg-pass"
                type={showPasscode ? 'text' : 'password'}
                autoComplete="off"
                className={cn(fieldCls, issueOf('passcode') && badFieldCls)}
                value={meeting.passcode ?? ''}
                onChange={(e) => set('passcode', e.target.value)}
                disabled={!canEdit}
              />
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control-lg hover:bg-muted"
                onClick={() => setShowPasscode((v) => !v)}
                aria-label={showPasscode ? 'パスコードを隠す' : 'パスコードを表示'}
              >
                {showPasscode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {issueOf('passcode') && <Note bad>{issueOf('passcode')}</Note>}
          </div>
        </>
      ) : (
        <p className="rounded-note bg-muted px-3 py-2 text-note text-muted-foreground">
          {meeting.tool} は会議ID・パスコードが URL に含まれるので、ここには出しません
          （電話会議IDなど別の番号は「備考」へ）。Zoom・Webex・その他に変えると出てきます。
        </p>
      )}

      <div>
        <Label htmlFor="mtg-video">入力映像設定</Label>
        <select
          id="mtg-video"
          className={fieldCls}
          value={meeting.videoInput}
          onChange={(e) => set('videoInput', e.target.value as Meeting['videoInput'])}
          disabled={!canEdit}
        >
          {VIDEO_INPUT_OPTIONS.map((v) => <option key={v} value={v}>{v === 'other' ? 'その他' : v}</option>)}
        </select>
      </div>

      {meeting.videoInput === 'other' && (
        <div>
          <Label htmlFor="mtg-video-other">入力映像（その他）</Label>
          <input
            id="mtg-video-other"
            className={cn(fieldCls, issueOf('videoInputOther') && badFieldCls)}
            value={meeting.videoInputOther ?? ''}
            onChange={(e) => set('videoInputOther', e.target.value)}
            placeholder="サブ回線 OA2 など"
            aria-invalid={!!issueOf('videoInputOther')}
            disabled={!canEdit}
          />
          {issueOf('videoInputOther') && <Note bad>{issueOf('videoInputOther')}</Note>}
        </div>
      )}

      <div>
        <Label htmlFor="mtg-audio">入力音声設定</Label>
        {/* ⚠️ 綴りを勝手に整えないこと（`UltraStudio` の U と S は大文字・08 §5-3） */}
        <select
          id="mtg-audio"
          className={fieldCls}
          value={meeting.audioInput}
          onChange={(e) => set('audioInput', e.target.value as Meeting['audioInput'])}
          disabled={!canEdit}
        >
          {AUDIO_INPUT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      <div>
        <Label htmlFor="mtg-note">備考</Label>
        <input
          id="mtg-note"
          className={cn(fieldCls, issueOf('note') && badFieldCls)}
          value={meeting.note ?? ''}
          onChange={(e) => set('note', e.target.value)}
          disabled={!canEdit}
        />
        {issueOf('note') && <Note bad>{issueOf('note')}</Note>}
      </div>
    </div>
  );
}
