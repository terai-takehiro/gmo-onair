/**
 * WEB会議の「出し分け」と「判定」を1か所にまとめる（impl doc 08 §5-2 / §5-5）。
 *
 * ⚠️ 伏せた欄の値を消さないこと。出し分けは**描画だけ**で、
 *    Zoom で入れた会議IDは Teams に変えても `meetings[i].joinId` に残る
 *    （配信先の SRT 詳細と同じ扱い・08 §5-2）。「表示しない」と「値を消す」は別。
 *
 * ⚠️ 判定（`meetingIssues` / `meetingBlockingError`）は
 *    `server/src/contexts/qsheet/device-settings-types.ts` の `MeetingSchema` と
 *    **食い違わせないこと**。食い違うと
 *    「画面は緑なのにサーバーに弾かれる」「画面は赤いのに保存は通る」が起きる。
 */
import type { Meeting } from '@/lib/deviceSettingsApi';

export const MEETING_TOOLS: Meeting['tool'][] = ['Zoom', 'Teams', 'Google Meet', 'Webex', 'その他'];

/**
 * 会議ID・パスコードを画面に出すツールか（08 §5-2 の表・モック `showsId()`
 * MeetingMobile.dc.html:126 と同じ）。
 *   Zoom …… 出す（ミーティングID）      Teams ……… 伏せる（URL に含まれる）
 *   Webex … 出す（ミーティング番号）      Google Meet 伏せる（URL の末尾がコード）
 *   その他 … 出す（何が要るか分からないので両方）
 */
export function showsJoinFields(tool: Meeting['tool']): boolean {
  return tool === 'Zoom' || tool === 'Webex' || tool === 'その他';
}

/**
 * ツールの見分けの色（モック MeetingMobile.dc.html:118-124 の `TOOL_TONE` と同じ役割）。
 * ⚠️ 状態の色（success / warning / destructive）は流用しない。
 * 「Google Meet だから緑」を**状態と読み違える**ため、意味を持たない `cat-*` を使う
 * （`destinationHelpers.ts` の `protocolBadgeClass()` と同じ考え方）。
 */
export function toolBadgeClass(tool: Meeting['tool']): string {
  switch (tool) {
    case 'Zoom': return 'bg-cat-2/10 text-cat-2';
    case 'Teams': return 'bg-cat-7/10 text-cat-7';
    case 'Google Meet': return 'bg-cat-4/10 text-cat-4';
    case 'Webex': return 'bg-cat-3/10 text-cat-3';
    default: return 'bg-cat-8/10 text-cat-8';
  }
}

/** 画面・コピー文面に出すツール名（「その他」は打ち込んだ名前を出す） */
export function toolLabel(m: Meeting): string {
  return m.tool === 'その他' ? (m.toolOther || 'その他') : m.tool;
}

export const VIDEO_INPUT_OPTIONS: Meeting['videoInput'][] = ['OA1', 'other'];
/** ⚠️ 音声に「その他」は**作らない**（08 §5-3・要否は §8-8 で確認中）。綴りも変えない */
export const AUDIO_INPUT_OPTIONS: Meeting['audioInput'][] = ['UltraStudio', 'Rubix42'];

export interface MeetingIssue { field: string; message: string }

/**
 * サーバーの `MeetingSchema` が持っている長さの上限。**ここを緩めないこと**
 * （緩めると保存で丸ごと弾かれ、しかも理由が画面に出ない）。
 */
const LENGTH_LIMITS: { field: keyof Meeting; label: string; max: number }[] = [
  { field: 'label', label: '呼び名', max: 64 },
  { field: 'toolOther', label: 'ツール名', max: 64 },
  { field: 'url', label: '会議URL', max: 512 },
  { field: 'joinId', label: '会議ID', max: 64 },
  { field: 'passcode', label: 'パスコード', max: 64 },
  { field: 'videoInputOther', label: '入力映像（その他）', max: 64 },
  { field: 'note', label: '備考', max: 500 },
];

function lengthIssues(m: Meeting): MeetingIssue[] {
  return LENGTH_LIMITS.filter((l) => String(m[l.field] ?? '').length > l.max).map((l) => ({
    field: String(l.field),
    message: `${l.label}は${l.max}文字以内です`,
  }));
}

/**
 * 会議1件の「足りない入力」。`destIssues()`（`deviceSettingsShared.ts`）と同じ形で返し、
 * 欄の下に赤字で出す。
 *
 * ⚠️ **なぜ作ったか**（監査 2026-08-22）
 * これまで会議URLが空でも画面には何も出ず、保存して**サーバーの zod に弾かれて初めて**
 * 分かった。しかも zod は1件でも通らないと `destinations` ごと落とすので、
 * 打ち込んだ配信先まで保存されずに消えていた。押す前にここで気づけるようにする。
 */
export function meetingIssues(m: Meeting): MeetingIssue[] {
  const out: MeetingIssue[] = [];
  // 会議URL は zod でも必須（`url: z.string().min(1)`）
  if (!(m.url ?? '').trim()) out.push({ field: 'url', message: '会議URLを入れてください' });
  // ⚠️ 下の2つは zod では optional。**保存は止めない**が、
  //    無いと現地で意味が通らない（08 §5-1 の必須欄）ので画面では出す
  if (m.tool === 'その他' && !(m.toolOther ?? '').trim()) {
    out.push({ field: 'toolOther', message: 'ツール名を入れてください（「その他」を選んだとき）' });
  }
  if (m.videoInput === 'other' && !(m.videoInputOther ?? '').trim()) {
    out.push({ field: 'videoInputOther', message: '入力映像の内容を入れてください（「その他」を選んだとき）' });
  }
  return [...out, ...lengthIssues(m)];
}

/**
 * **保存を止める**ほどの規則違反だけを返す（`destinationHelpers.ts` の
 * `blockingError()` と同じ役割）。
 *
 * ⚠️ サーバーは1件でも `MeetingSchema` に反すると **配信先も WEB会議もまとめて**
 * 受け付けない。投げる前にここで見つけて、その会議を選んで止める。
 * ⚠️ 逆に、zod が受けるもの（ツール名・入力映像その他の未入力）はここで止めない。
 * 止めると「サーバーは受けるのに画面が拒む」になり、打った内容を出せなくなる。
 */
export function meetingBlockingError(m: Meeting): string | null {
  if (!(m.url ?? '').trim()) return '会議URLを入れてください';
  return lengthIssues(m)[0]?.message ?? null;
}

/**
 * 現場に貼る文面（08 §5-5 の見本）。
 *
 * ⚠️ `includePasscode` は**押したボタンで決める**。以前は「全部まとめてコピー」1つしか
 * なく、パスコードが常に入っていたため、Slack に貼った時点で
 * 「URL を知っている人は誰でも入れる」状態が漏れていた（会議URLとパスコードは
 * それ自体が入室の鍵・§5-5）。押した後では気づけないので、文言でも分ける。
 */
export function buildCopyText(m: Meeting, includePasscode: boolean): string {
  const tool = toolLabel(m);
  const lines = [m.label ? `【${m.label}】${tool}` : tool, `URL: ${m.url}`];
  if (showsJoinFields(m.tool) && m.joinId) lines.push(`会議ID: ${m.joinId}`);
  if (showsJoinFields(m.tool) && includePasscode && m.passcode) lines.push(`パスコード: ${m.passcode}`);
  lines.push(`入力映像: ${m.videoInput === 'other' ? m.videoInputOther || 'その他' : m.videoInput}`);
  lines.push(`入力音声: ${m.audioInput}`);
  return lines.join('\n');
}
