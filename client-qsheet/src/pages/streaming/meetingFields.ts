// WEB会議: ツールによって出す欄を変える（08 §5-2）。
// ⚠️ 伏せた欄の値を消さない。出し分けは描画だけで、meetings[i].joinId の値は保持する。
import type { Meeting } from '@/lib/deviceSettingsApi';

export const MEETING_TOOLS: Meeting['tool'][] = ['Zoom', 'Teams', 'Google Meet', 'Webex', 'その他'];

/** 会議ID・パスコードを画面に出すツールか（08 §5-2 の表） */
export function showsJoinFields(tool: Meeting['tool']): boolean {
  return tool === 'Zoom' || tool === 'Webex' || tool === 'その他';
}

export const VIDEO_INPUT_OPTIONS: Meeting['videoInput'][] = ['OA1', 'other'];
export const AUDIO_INPUT_OPTIONS: Meeting['audioInput'][] = ['UltraStudio', 'Rubix42'];

/** 「全部まとめてコピー」用の文面（08 §5-5） */
export function buildCopyText(m: Meeting, includePasscode: boolean): string {
  const lines = [
    m.label ? `【${m.label}】${m.tool === 'その他' ? m.toolOther || 'その他' : m.tool}` : (m.tool === 'その他' ? m.toolOther || 'その他' : m.tool),
    `URL: ${m.url}`,
  ];
  if (showsJoinFields(m.tool) && m.joinId) lines.push(`会議ID: ${m.joinId}`);
  if (showsJoinFields(m.tool) && includePasscode && m.passcode) lines.push(`パスコード: ${m.passcode}`);
  lines.push(`入力映像: ${m.videoInput === 'other' ? m.videoInputOther || 'その他' : m.videoInput}`);
  lines.push(`入力音声: ${m.audioInput}`);
  return lines.join('\n');
}
