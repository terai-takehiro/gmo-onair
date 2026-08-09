/**
 * 録音の拡張子（iPhone / Safari で必ず失敗していた分）
 *
 * **画面を見ても気づけません** — 名前が `.webm` でも録音は普通に見え、
 * 失敗するのは投げたあとの Whisper です。しかも失敗するのは
 * **Safari の人だけ**なので、Chrome で作った側は最後まで気づけません。
 */
import { describe, it, expect } from 'vitest';
import { extensionForAudio, recordingFileName, STT_EXTENSIONS } from '../src/client-v4/recording';
import { normalizeAudioName } from '../../server/src/contexts/sales/services/minutes-ai.service';

describe('extensionForAudio — MediaRecorder の形式から拡張子を決める', () => {
  it('Chrome / Edge / Firefox は webm', () => {
    expect(extensionForAudio('audio/webm')).toBe('webm');
    expect(extensionForAudio('audio/webm;codecs=opus')).toBe('webm');
  });

  it('**Safari / iPhone は mp4**（ここが直したかった所）', () => {
    expect(extensionForAudio('audio/mp4')).toBe('mp4');
    expect(extensionForAudio('audio/mp4;codecs=mp4a.40.2')).toBe('mp4');
  });

  it('大文字・前後の空白でも読める', () => {
    expect(extensionForAudio(' AUDIO/MP4 ')).toBe('mp4');
  });

  it('ほかの形式', () => {
    expect(extensionForAudio('audio/mpeg')).toBe('mp3');
    expect(extensionForAudio('audio/ogg')).toBe('ogg');
    expect(extensionForAudio('audio/x-wav')).toBe('wav');
    expect(extensionForAudio('audio/x-m4a')).toBe('m4a');
  });

  it('知らない形式・空でも**拡張子なしにしない**（無いと確実に断られる）', () => {
    expect(extensionForAudio('audio/flac')).toBe('webm');
    expect(extensionForAudio('')).toBe('webm');
    expect(extensionForAudio(null)).toBe('webm');
    expect(extensionForAudio(undefined)).toBe('webm');
  });

  it('返す拡張子は必ず Whisper が受け付けるもの', () => {
    for (const mime of ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/flac']) {
      expect(STT_EXTENSIONS).toContain(extensionForAudio(mime) as never);
    }
  });

  it('名前を組み立てる', () => {
    expect(recordingFileName('打合せ_2026-08-09', 'audio/mp4')).toBe('打合せ_2026-08-09.mp4');
    expect(recordingFileName('録音_2026-08-09', 'audio/webm;codecs=opus')).toBe('録音_2026-08-09.webm');
  });
});

describe('normalizeAudioName — 受け取る側でも直す（古い画面のため）', () => {
  it('中身が mp4 なのに `.webm` で来たら直す（Safari の古い画面）', () => {
    expect(normalizeAudioName('打合せ_2026-08-09.webm', 'audio/mp4')).toBe('打合せ_2026-08-09.mp4');
  });

  it('合っていれば触らない', () => {
    expect(normalizeAudioName('録音.webm', 'audio/webm;codecs=opus')).toBe('録音.webm');
    expect(normalizeAudioName('録音.mp4', 'audio/mp4')).toBe('録音.mp4');
  });

  it('MIME が分からないとき、受け付けられる拡張子ならそのまま', () => {
    expect(normalizeAudioName('録音.m4a', undefined)).toBe('録音.m4a');
    expect(normalizeAudioName('録音.ogg', 'application/octet-stream')).toBe('録音.ogg');
  });

  it('MIME も拡張子も当てにならないときは webm に倒す', () => {
    expect(normalizeAudioName('録音.bin', 'application/octet-stream')).toBe('録音.webm');
    expect(normalizeAudioName('録音', null)).toBe('録音.webm');
  });

  it('日本語の名前を壊さない', () => {
    expect(normalizeAudioName('打合せ 2026年8月9日.webm', 'audio/mp4')).toBe('打合せ 2026年8月9日.mp4');
  });
});
