/**
 * 制作資料 v4 の AI 生成（段8）— `llm.ts`（共通呼び出しレイヤー）。
 *
 * **LLM 呼び出し部分はモックする**（実際に呼べる API キーが無い環境が前提）。
 * OpenAI / Anthropic の SDK をまるごと差し替え、
 * - プロバイダ未設定なら即座に例外（呼び出し側が 503 に変換する材料）
 * - 例外時だけ light→heavy に1回上げる（`retryHeavyOnError`。③④のみが使う）
 * - 内容が気に入らない（例外ではない）ときはやり直さない
 * ことを固定する。
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as z from 'zod/v4';

const parseMock = vi.fn();
const messagesParseMock = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({ responses: { parse: parseMock } })),
}));
vi.mock('openai/helpers/zod', () => ({ zodTextFormat: vi.fn(() => ({ type: 'mock' })) }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { parse: messagesParseMock } })),
}));
vi.mock('@anthropic-ai/sdk/helpers/zod', () => ({ zodOutputFormat: vi.fn(() => ({ type: 'mock' })) }));

// vi.mock はモジュール解決より前に効くため、対象は動的 import で読む
async function loadLlm() {
  return import('../../server/src/contexts/qsheet/ai/llm');
}

const TestSchema = z.object({ ok: z.boolean() });

const ENV_KEYS = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'INTAKE_AI_PROVIDER', 'AI_MODEL_LIGHT', 'AI_MODEL_HEAVY'];

beforeEach(() => {
  parseMock.mockReset();
  messagesParseMock.mockReset();
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe('callStructured — プロバイダ未設定', () => {
  it('OPENAI_API_KEY / ANTHROPIC_API_KEY のどちらも無ければ即座に例外', async () => {
    const { callStructured } = await loadLlm();
    await expect(callStructured({
      job: 'script_line', tier: 'light', system: 's', user: 'u',
      schema: TestSchema, schemaName: 'test',
    })).rejects.toThrow(/OPENAI_API_KEY.*ANTHROPIC_API_KEY|ANTHROPIC_API_KEY.*OPENAI_API_KEY/);
    expect(parseMock).not.toHaveBeenCalled();
  });
});

describe('callStructured — OpenAI 経路', () => {
  it('正常時はそのモデルの結果をそのまま返す（やり直さない）', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    parseMock.mockResolvedValue({ status: 'completed', output_parsed: { ok: true }, usage: { input_tokens: 10, output_tokens: 5 } });
    const { callStructured } = await loadLlm();
    const result = await callStructured({
      job: 'script_outline', tier: 'heavy', system: 's', user: 'u',
      schema: TestSchema, schemaName: 'test',
    });
    expect(result.raw).toEqual({ ok: true });
    expect(result.provider).toBe('openai');
    expect(result.usage).toEqual({ inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 });
    expect(parseMock).toHaveBeenCalledTimes(1);
  });

  it('応答が `incomplete` なら例外にする（尻切れの構造化出力を成功と見せない）', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    parseMock.mockResolvedValue({ status: 'incomplete', output_parsed: null, usage: {} });
    const { callStructured } = await loadLlm();
    await expect(callStructured({
      job: 'script_line', tier: 'light', system: 's', user: 'u', schema: TestSchema, schemaName: 'test',
    })).rejects.toThrow(/途中で切れました/);
  });

  it('retryHeavyOnError=false（①②の既定）: 例外はそのまま外へ（やり直さない）', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    parseMock.mockRejectedValue(new Error('rate limited'));
    const { callStructured } = await loadLlm();
    await expect(callStructured({
      job: 'event_plan', tier: 'heavy', system: 's', user: 'u', schema: TestSchema, schemaName: 'test',
    })).rejects.toThrow('rate limited');
    expect(parseMock).toHaveBeenCalledTimes(1); // 1回しか呼んでいない
  });

  it('retryHeavyOnError=true（③④）: light が例外を投げたら heavy で1回だけやり直す', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    parseMock
      .mockRejectedValueOnce(new Error('light failed'))
      .mockResolvedValueOnce({ status: 'completed', output_parsed: { ok: true }, usage: {} });
    const { callStructured } = await loadLlm();
    const result = await callStructured({
      job: 'script_line', tier: 'light', system: 's', user: 'u',
      schema: TestSchema, schemaName: 'test', retryHeavyOnError: true,
    });
    expect(result.raw).toEqual({ ok: true });
    expect(parseMock).toHaveBeenCalledTimes(2); // light で1回失敗 → heavy で1回成功
  });

  it('heavy が2回目も落ちたら、その例外をそのまま外へ返す', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    parseMock.mockRejectedValue(new Error('always fails'));
    const { callStructured } = await loadLlm();
    await expect(callStructured({
      job: 'script_line', tier: 'light', system: 's', user: 'u',
      schema: TestSchema, schemaName: 'test', retryHeavyOnError: true,
    })).rejects.toThrow('always fails');
    expect(parseMock).toHaveBeenCalledTimes(2);
  });
});

describe('callStructured — Anthropic 経路（OpenAI キーが無いとき）', () => {
  it('ANTHROPIC_API_KEY だけがあれば anthropic 側を呼ぶ', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    messagesParseMock.mockResolvedValue({ parsed_output: { ok: true }, usage: { input_tokens: 3, output_tokens: 2 } });
    const { callStructured } = await loadLlm();
    const result = await callStructured({
      job: 'production_chat', tier: 'light', system: 's', user: 'u', schema: TestSchema, schemaName: 'test',
    });
    expect(result.provider).toBe('anthropic');
    expect(result.raw).toEqual({ ok: true });
    expect(messagesParseMock).toHaveBeenCalledTimes(1);
    expect(parseMock).not.toHaveBeenCalled();
  });
});

describe('人が待つ経路は maxRetries: 0（04-ai.md §8-1）', () => {
  it('llm.ts のソースに maxRetries: 0 が2か所（openai / anthropic）ある', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(
      join(__dirname, '..', '..', 'server', 'src', 'contexts', 'qsheet', 'ai', 'llm.ts'), 'utf8',
    );
    const matches = src.match(/maxRetries:\s*0/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/maxRetries:\s*1/);
  });
});
