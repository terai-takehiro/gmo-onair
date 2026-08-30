/**
 * 配信先プリセット（`client-techops/src/pages/streaming/streamPresets.ts`）の判定を固定する。
 *
 * ここは**現地の GMO ONAiR Assistant（`stream/presets.ts`）と同じ中身・同じ判断**にする決めごと。
 * URL が1字でもずれると（a と b のホスト違いなど）現地で別の配信先になるため、
 * URL そのものをテストで固定する。
 */
import { describe, it, expect } from 'vitest';
import {
  CUSTOM_PRESET, RTMP_PRESETS, YOUTUBE_BITRATES,
  isYouTubeUrl, presetLabelOf, presetOf, urlForPreset,
} from '../../client-techops/src/pages/streaming/streamPresets';

describe('RTMP_PRESETS — Assistant と同じ2本（URL を1字も変えない）', () => {
  it('YouTube のプライマリとバックアップ', () => {
    expect(RTMP_PRESETS).toEqual([
      { label: 'YouTube（プライマリ）', url: 'rtmp://a.rtmp.youtube.com/live2' },
      { label: 'YouTube（バックアップ）', url: 'rtmp://b.rtmp.youtube.com/live2?backup=1' },
    ]);
  });

  it('キーはプリセットに入れない（例示のキーを置く場所ではない）', () => {
    for (const p of RTMP_PRESETS) expect(Object.keys(p)).toEqual(['label', 'url']);
  });
});

describe('presetOf — 選んだ値を覚えず、URL から逆引きする', () => {
  it('一致すればプリセット名', () => {
    expect(presetOf('rtmp://a.rtmp.youtube.com/live2')).toBe('YouTube（プライマリ）');
  });
  it('手で書き換えた URL は「カスタム入力」に戻る', () => {
    expect(presetOf('rtmp://a.rtmp.youtube.com/live2x')).toBe(CUSTOM_PRESET);
    expect(presetOf(undefined)).toBe(CUSTOM_PRESET);
  });
});

describe('urlForPreset — 「カスタム入力」は URL を消さない', () => {
  it('プリセット名 → URL', () => {
    expect(urlForPreset('YouTube（バックアップ）')).toBe('rtmp://b.rtmp.youtube.com/live2?backup=1');
  });
  it('「カスタム入力」は null（呼ぶ側は何もしない）', () => {
    expect(urlForPreset(CUSTOM_PRESET)).toBeNull();
  });
});

describe('presetLabelOf — 一覧の短い呼び名（a と b の1字違いは一覧では読めない）', () => {
  it('一致すれば呼び名、外れれば null（呼ぶ側は URL を出す）', () => {
    expect(presetLabelOf('rtmp://b.rtmp.youtube.com/live2?backup=1')).toBe('YouTube（バックアップ）');
    expect(presetLabelOf('rtmp://example.invalid/live')).toBeNull();
  });
});

describe('isYouTubeUrl — 「YouTube 配信の決めごと」を出す判定', () => {
  it('rtmp / rtmps・プライマリ / バックアップの両方に当たる', () => {
    expect(isYouTubeUrl('rtmp://a.rtmp.youtube.com/live2')).toBe(true);
    expect(isYouTubeUrl('rtmp://b.rtmp.youtube.com/live2?backup=1')).toBe(true);
    expect(isYouTubeUrl('rtmps://a.rtmps.youtube.com:443/live2')).toBe(true);
  });
  it('他所の URL・youtube を含むだけのホストには当たらない', () => {
    expect(isYouTubeUrl('rtmp://example.invalid/live')).toBe(false);
    expect(isYouTubeUrl('rtmp://youtube.com.evil.example/live2')).toBe(false);
    expect(isYouTubeUrl(undefined)).toBe(false);
  });
});

describe('YOUTUBE_BITRATES — 公式の推奨値（2853702 ja・2026-08 時点）を1桁も変えない', () => {
  it('現場でいちばん使う 1080p の2段', () => {
    expect(YOUTUBE_BITRATES.find((b) => b.quality === '1080p 60fps')?.kbps).toBe('4,500〜9,000');
    expect(YOUTUBE_BITRATES.find((b) => b.quality === '1080p 30fps')?.kbps).toBe('3,000〜6,000');
  });
});
