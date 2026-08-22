/**
 * WEB会議（配信設定の下段）の判定と出し分けを固定する。
 *
 * **画面を見ても間違いに気づけない部分です。** 監査（2026-08-22）で見つかった実害:
 *   ・会議URLが空でも画面には何も出ず、保存して**サーバーの zod に弾かれて初めて**分かった。
 *     しかも1件でも弾かれると `destinations` ごと落ちるので、打ち込んだ配信先まで消えた。
 *   ・「全部まとめてコピー」がパスコードを常に含んでいて、Slack に貼ると
 *     会議に誰でも入れる状態が漏れていた（会議URL・パスコードは入室の鍵・08 §5-5）。
 *   ・ツール別の出し分け（08 §5-2 の表）は**表示だけ**の話で、伏せた欄の値を消してはいけない。
 *
 * ⚠️ 判定は `server/src/contexts/qsheet/device-settings-types.ts` の `MeetingSchema` と
 *    食い違わせないこと。ここはその線を固定するための試験です。
 */
import { describe, it, expect } from 'vitest';
import {
  showsJoinFields, meetingIssues, meetingBlockingError, buildCopyText, toolLabel,
} from '../../client-techops/src/pages/streaming/meetingFields';
import type { Meeting } from '../../client-techops/src/lib/deviceSettingsApi';

const mtg = (p: Partial<Meeting> = {}): Meeting => ({
  meetingId_: 'mtg_1',
  tool: 'Zoom',
  url: 'https://zoom.us/j/00000000000',
  videoInput: 'OA1',
  audioInput: 'UltraStudio',
  ...p,
});

describe('showsJoinFields — 08 §5-2 の表（モック showsId() と同じ）', () => {
  it('Zoom・Webex・その他は会議IDとパスコードを出す', () => {
    expect(showsJoinFields('Zoom')).toBe(true);
    expect(showsJoinFields('Webex')).toBe(true);
    expect(showsJoinFields('その他')).toBe(true);
  });
  it('Teams・Google Meet は伏せる（URL に含まれるため）', () => {
    expect(showsJoinFields('Teams')).toBe(false);
    expect(showsJoinFields('Google Meet')).toBe(false);
  });
});

describe('meetingIssues — 足りない入力をその場で出す', () => {
  it('全部入っていれば何も出ない', () => {
    expect(meetingIssues(mtg())).toEqual([]);
  });
  it('⚠️ 会議URLが空なら url の不足を出す（以前は保存するまで分からなかった）', () => {
    expect(meetingIssues(mtg({ url: '' }))).toEqual([{ field: 'url', message: '会議URLを入れてください' }]);
  });
  it('空白だけの URL も不足として扱う（現場では使えないため）', () => {
    expect(meetingIssues(mtg({ url: '   ' })).map((i) => i.field)).toEqual(['url']);
  });
  it('ツールが「その他」ならツール名を促す（08 §5-1 の必須欄）', () => {
    expect(meetingIssues(mtg({ tool: 'その他' })).map((i) => i.field)).toEqual(['toolOther']);
    expect(meetingIssues(mtg({ tool: 'その他', toolOther: 'Zoom Phone' }))).toEqual([]);
  });
  it('入力映像が「その他」なら内容を促す', () => {
    expect(meetingIssues(mtg({ videoInput: 'other' })).map((i) => i.field)).toEqual(['videoInputOther']);
    expect(meetingIssues(mtg({ videoInput: 'other', videoInputOther: 'サブ回線 OA2' }))).toEqual([]);
  });
  it('サーバーの zod と同じ長さの上限を見る（会議URLは512字・備考は500字）', () => {
    expect(meetingIssues(mtg({ url: `https://x/${'a'.repeat(512)}` })).map((i) => i.field)).toEqual(['url']);
    expect(meetingIssues(mtg({ note: 'あ'.repeat(501) })).map((i) => i.field)).toEqual(['note']);
    expect(meetingIssues(mtg({ note: 'あ'.repeat(500) }))).toEqual([]);
  });
});

describe('meetingBlockingError — 保存を止めるのは zod が弾くものだけ', () => {
  it('会議URLが空なら止める（1件で配信先ごと保存されなくなるため）', () => {
    expect(meetingBlockingError(mtg({ url: '' }))).toBe('会議URLを入れてください');
  });
  it('長さの上限を超えたら止める', () => {
    expect(meetingBlockingError(mtg({ joinId: '1'.repeat(65) }))).toBe('会議IDは64文字以内です');
  });
  it('⚠️ zod が受けるもの（ツール名・入力映像その他の未入力）では止めない', () => {
    expect(meetingBlockingError(mtg({ tool: 'その他' }))).toBeNull();
    expect(meetingBlockingError(mtg({ videoInput: 'other' }))).toBeNull();
  });
});

describe('buildCopyText — パスコードを含めるかは押したボタンで決まる（08 §5-5）', () => {
  const m = mtg({ label: '本番用', joinId: '000 0000 0000', passcode: 'ev2026' });

  it('含める指定のときだけパスコードの行が出る', () => {
    expect(buildCopyText(m, true)).toBe(
      ['【本番用】Zoom', 'URL: https://zoom.us/j/00000000000', '会議ID: 000 0000 0000',
        'パスコード: ev2026', '入力映像: OA1', '入力音声: UltraStudio'].join('\n'),
    );
  });
  it('⚠️ 含めない指定ならパスコードは1文字も出ない（Slack に貼っても漏れない）', () => {
    expect(buildCopyText(m, false)).not.toContain('ev2026');
    expect(buildCopyText(m, false)).not.toContain('パスコード');
  });
  it('⚠️ 伏せているツール（Teams）では、値が残っていても会議ID・パスコードを出さない', () => {
    const teams = mtg({ tool: 'Teams', joinId: '000 0000 0000', passcode: 'ev2026' });
    expect(buildCopyText(teams, true)).not.toContain('000 0000 0000');
    expect(buildCopyText(teams, true)).not.toContain('ev2026');
    // ⚠️ ただし**値そのものは消さない**。Zoom に戻せばそのまま出る（08 §5-2）
    expect(buildCopyText({ ...teams, tool: 'Zoom' }, true)).toContain('000 0000 0000');
  });
  it('「その他」のツールは打ち込んだ名前で出す', () => {
    expect(toolLabel(mtg({ tool: 'その他', toolOther: 'Zoom Phone' }))).toBe('Zoom Phone');
    expect(buildCopyText(mtg({ tool: 'その他', toolOther: 'Zoom Phone' }), true)).toContain('Zoom Phone');
  });
});
