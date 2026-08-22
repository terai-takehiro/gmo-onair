/**
 * 収録設定・配信設定の「判定」を固定する。
 *
 * **画面を見ても間違いに気づけない部分です。**
 * 監査（2026-08-22）で見つかった実害の芯が、すべてここに関わっていました:
 *   ・状態の帯の数え方がモックと違い、「解像度だけ入っている台」がどこにも数えられない
 *   ・「本線から写す」が控え（HD Plus）に持てない値をそのまま写し、
 *     画面は空欄に見えるのに Excel には 4K や DNxHR が出る
 *   ・新規の配信先が「キー不要」と「新規は必須」を同時に言う
 *   ・既定の実施日が UTC 基準で、JST の 0〜9 時は前日になる
 */
import { describe, it, expect } from 'vitest';
import {
  deckState, countDecks, sessionNameError, destIssues, keyStatus, destTarget, jstToday,
} from '../../client-techops/src/lib/deviceSettingsShared';
import { coerceDeck, commonOptions } from '../../client-techops/src/pages/recording/deckOptions';
import type { Deck, Destination } from '../../client-techops/src/lib/deviceSettingsApi';

const deck = (p: Partial<Deck>): Deck => ({ deckId: 'REC1', ...p });
const dest = (p: Partial<Destination>): Destination =>
  ({ destId: 'dst_1', encoderId: 'ENC1', name: 'Sess', ...p });

describe('deckState — モック Main.dc.html:207-210 と同じ数え方', () => {
  it('4項目すべて入っていれば準備完了', () => {
    expect(deckState(deck({ videoFormat: 'a', codec: 'b', audioChannels: 2, slot: 'd' }))).toBe('ready');
  });
  it('1つも入っていなければ未入力', () => {
    expect(deckState(deck({}))).toBe('blank');
  });
  it('⚠️ 解像度だけ入っている台は「一部だけ」（以前はどこにも数えられなかった）', () => {
    expect(deckState(deck({ videoFormat: 'a' }))).toBe('partial');
  });
  it('⚠️ 音声chだけでも「一部だけ」（以前の unfilledCount は audioChannels を見ていなかった）', () => {
    expect(deckState(deck({ audioChannels: 2 }))).toBe('partial');
  });
  it('使わないと決めた台は skip', () => {
    expect(deckState(deck({ skip: true, videoFormat: 'a' }))).toBe('skip');
  });
});

describe('countDecks — 帯の4カウント', () => {
  it('準備完了・一部だけ・未入力・ネットワーク収録を別々に数える', () => {
    const c = countDecks([
      deck({ deckId: 'REC1', videoFormat: 'a', codec: 'b', audioChannels: 2, slot: 'ネットワーク' }),
      deck({ deckId: 'REC2', videoFormat: 'a' }),
      deck({ deckId: 'REC3' }),
      deck({ deckId: 'REC4', skip: true }),
    ]);
    expect(c).toEqual({ ready: 1, partial: 1, blank: 1, network: 1, skip: 1 });
  });
  it('使わない台はネットワーク収録に数えない', () => {
    expect(countDecks([deck({ skip: true, slot: 'ネットワーク' })]).network).toBe(0);
  });
});

describe('coerceDeck — 機種が持てない値を落とす', () => {
  it('⚠️ 本線(4K Pro)→控え(HD Plus) で 4K・DNxHR・SSD・8ch を落とす', () => {
    const src = deck({ deckId: 'REC1', videoFormat: '3840x2160p59.94', codec: 'DNxHR:HQ', audioChannels: 8, slot: 'SSD 1' });
    const { deck: out, dropped } = coerceDeck('REC1-P', src);
    expect(out.videoFormat).toBeUndefined();
    expect(out.codec).toBeUndefined();
    expect(out.audioChannels).toBeUndefined();
    expect(out.slot).toBeUndefined();
    expect(dropped).toEqual(['解像度', 'コーデック', '音声ch', '収録先']);
  });
  it('控えも持てる値はそのまま残す', () => {
    const src = deck({ deckId: 'REC1', videoFormat: '1920x1080p59.94', codec: 'ProRes:422', audioChannels: 2, slot: 'ネットワーク' });
    const { deck: out, dropped } = coerceDeck('REC1-P', src);
    expect(out.videoFormat).toBe('1920x1080p59.94');
    expect(out.slot).toBe('ネットワーク');
    expect(dropped).toEqual([]);
  });
  it('⚠️ 手で打った見慣れない値は落とさない（自由入力を許しているため）', () => {
    const { deck: out, dropped } = coerceDeck('REC1-P', deck({ deckId: 'REC1', videoFormat: '4096x2160p24' }));
    expect(out.videoFormat).toBe('4096x2160p24');
    expect(dropped).toEqual([]);
  });
});

describe('commonOptions — 一括変更は機種グループを越えない', () => {
  it('本線だけなら 4K を選べる', () => {
    expect(commonOptions(['REC1', 'REC2'], 'videoFormat')).toContain('3840x2160p59.94');
  });
  it('⚠️ 本線と控えを同時に選ぶと 4K は消える', () => {
    expect(commonOptions(['REC1', 'REC1-P'], 'videoFormat')).not.toContain('3840x2160p59.94');
  });
  it('同時に選んでも 1080 は残る', () => {
    expect(commonOptions(['REC1', 'REC1-P'], 'videoFormat')).toContain('1920x1080p59.94');
  });
});

describe('sessionNameError — サーバーの SESSION_NAME_RE と同じ規則', () => {
  it('半角英数と記号は通る', () => expect(sessionNameError("YouTube_Main-01 (A)")).toBeNull());
  it('⚠️ 全角は弾く（以前は保存を押すまで分からなかった）', () => {
    expect(sessionNameError('記念式典 本線')).toBe("半角の英数と ._-+'[]() と空白のみ使えます");
  });
  it('空は弾く', () => expect(sessionNameError('')).toBe('セッション名を入れてください'));
  it('前後の空白は弾く', () => expect(sessionNameError(' A ')).toBe('前後に空白は使えません'));
  it('33文字は弾く', () => expect(sessionNameError('a'.repeat(33))).toBe('32文字以内です'));
});

describe('keyStatus — 新規の配信先が矛盾しないこと', () => {
  it('⚠️ プロトコル未選択は RTMP 扱い＝「キー未入力」（以前は「キー不要」と出ていた）', () => {
    expect(keyStatus(dest({ protocol: undefined })).label).toBe('キー未入力');
  });
  it('鍵が保存済みなら「設定済み」', () => {
    expect(keyStatus(dest({ protocol: 'RTMP', hasStreamKey: true })).label).toBe('設定済み');
  });
  it('SRT は「キー不要」', () => {
    expect(keyStatus(dest({ protocol: 'SRT Caller' })).label).toBe('キー不要');
  });
});

describe('destIssues — モック Stream.dc.html:187-193 の warnOf と同じ', () => {
  it('RTMP で鍵が無ければ警告', () => {
    const issues = destIssues(dest({ protocol: 'RTMP', url: 'rtmp://a/b' }));
    expect(issues.some((i) => i.field === 'streamKey')).toBe(true);
  });
  it('鍵が保存済みなら警告しない', () => {
    const issues = destIssues(dest({ protocol: 'RTMP', url: 'rtmp://a/b', hasStreamKey: true }));
    expect(issues.some((i) => i.field === 'streamKey')).toBe(false);
  });
  it('SRT でポートが無ければ警告', () => {
    expect(destIssues(dest({ protocol: 'SRT Listener' })).some((i) => i.field === 'port')).toBe(true);
  });
  it('暗号化ありでパスフレーズが無ければ警告', () => {
    const d = dest({ protocol: 'SRT Caller', url: 'h', port: 9000, aes: 'AES-128' });
    expect(destIssues(d).some((i) => i.field === 'passphrase')).toBe(true);
  });
  it('⚠️ 同じ ENC の中で名前が重なったら警告（誰も検査していなかった）', () => {
    const a = dest({ destId: 'a', name: 'Same', protocol: 'RTMP', url: 'u', hasStreamKey: true });
    const b = dest({ destId: 'b', name: 'Same', protocol: 'RTMP', url: 'u', hasStreamKey: true });
    expect(destIssues(a, [a, b]).some((i) => i.field === 'name')).toBe(true);
  });
});

describe('destTarget — 一覧に出す宛先', () => {
  it('SRT Listener は待受ポート', () => {
    expect(destTarget(dest({ protocol: 'SRT Listener', port: 9001 }))).toBe('待受ポート 9001');
  });
  it('それ以外は URL:ポート', () => {
    expect(destTarget(dest({ protocol: 'SRT Caller', url: 'srt.example', port: 9000 }))).toBe('srt.example:9000');
  });
});

describe('jstToday — 実施日の既定値', () => {
  it('⚠️ JST の 0〜9 時でも当日になる（UTC 基準だと前日になっていた）', () => {
    // JST 2026-08-23 00:30 = UTC 2026-08-22 15:30
    const t = new Date('2026-08-22T15:30:00Z');
    expect(jstToday(t)).toBe('2026-08-23');
    expect(t.toISOString().slice(0, 10)).toBe('2026-08-22'); // 以前の実装はこちらを使っていた
  });
  it('JST の日中はそのまま', () => {
    expect(jstToday(new Date('2026-08-22T05:00:00Z'))).toBe('2026-08-22');
  });
});
