/**
 * どの仕事にどのモデルを使うか（`shared/services/ai-model.ts`）
 *
 * **なぜここをテストするか**: 間違えても**画面には何も出ません**。
 * 軽いモデルに落ちすぎれば読み落としが増え、上位に張り付けば費用だけ増えます。
 * どちらも「なんとなく精度が落ちた / 請求が増えた」としか気づけないので、
 * 決め方そのものを固定します。
 *
 * server は `shared` を import しない構成なので、**server のファイルを直接読みます**
 * （`dueDate.test.ts` と同じやり方）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  modelFor, tierFor, isLightDisabled, BUILTIN_MODELS,
} from '../../server/src/shared/services/ai-model';

const KEYS = [
  'AI_MODEL_HEAVY', 'AI_MODEL_LIGHT',
  'INTAKE_AI_MODEL', 'ACTIVITY_AI_MODEL', 'MINUTES_AI_MODEL', 'KPT_AI_MODEL',
];
afterEach(() => { for (const k of KEYS) delete process.env[k]; });

describe('tierFor — 段の決め方', () => {
  it('議事録と KPT は入力が短くても常に heavy', () => {
    // 難しさは長さではなく「間違いに気づけるか」で決まる
    expect(tierFor('minutes', { chars: 10 })).toBe('heavy');
    expect(tierFor('kpt', { chars: 10 })).toBe('heavy');
  });

  it('やり取りの整形と投入口は既定が light', () => {
    expect(tierFor('activity', { chars: 500 })).toBe('light');
    expect(tierFor('intake', { chars: 100 })).toBe('light');
  });

  it('長い入力は heavy に上がる（機能ごとに上限が違う）', () => {
    expect(tierFor('intake', { chars: 401 })).toBe('heavy');
    expect(tierFor('intake', { chars: 400 })).toBe('light');   // 境界は light 側
    expect(tierFor('activity', { chars: 4_001 })).toBe('heavy');
    expect(tierFor('activity', { chars: 4_000 })).toBe('light');
  });

  it('添付があれば heavy（写真・PDF は読む力が要る）', () => {
    expect(tierFor('activity', { chars: 10, attachments: 1 })).toBe('heavy');
  });

  it('呼ぶ側が段を決めているときはそれに従う', () => {
    expect(tierFor('activity', { chars: 10, force: 'heavy' })).toBe('heavy');
  });

  it('材料を何も渡さなければ、その機能の既定の段', () => {
    expect(tierFor('activity')).toBe('light');
    expect(tierFor('minutes')).toBe('heavy');
  });
});

describe('modelFor — モデル名の決め方', () => {
  it('何も設定しなければ組み込みの既定', () => {
    expect(modelFor('activity', 'light', 'openai')).toBe(BUILTIN_MODELS.light.openai);
    expect(modelFor('minutes', 'heavy', 'openai')).toBe(BUILTIN_MODELS.heavy.openai);
    expect(modelFor('minutes', 'heavy', 'anthropic')).toBe(BUILTIN_MODELS.heavy.anthropic);
  });

  it('段ごとの上書きは機能をまたいで効く', () => {
    process.env.AI_MODEL_LIGHT = 'my-light';
    expect(modelFor('activity', 'light', 'openai')).toBe('my-light');
    expect(modelFor('intake', 'light', 'openai')).toBe('my-light');
    // heavy 側は巻き添えにならない
    expect(modelFor('activity', 'heavy', 'openai')).toBe(BUILTIN_MODELS.heavy.openai);
  });

  it('機能ごとの上書きが段より先に効く（名指しした人の指定が勝つ）', () => {
    process.env.AI_MODEL_LIGHT = 'my-light';
    process.env.ACTIVITY_AI_MODEL = 'named';
    expect(modelFor('activity', 'light', 'openai')).toBe('named');
    expect(modelFor('activity', 'heavy', 'openai')).toBe('named');   // 段を無視する
    expect(modelFor('intake', 'light', 'openai')).toBe('my-light');  // 他の機能には効かない
  });

  it('**`MINUTES_AI_MODEL` がやり取りと KPT を巻き添えにしない**（着手前はしていた）', () => {
    process.env.MINUTES_AI_MODEL = 'minutes-only';
    expect(modelFor('minutes', 'heavy', 'openai')).toBe('minutes-only');
    expect(modelFor('activity', 'light', 'openai')).toBe(BUILTIN_MODELS.light.openai);
    expect(modelFor('kpt', 'heavy', 'openai')).toBe(BUILTIN_MODELS.heavy.openai);
  });

  it('空白だけの環境変数は「設定していない」として扱う', () => {
    process.env.ACTIVITY_AI_MODEL = '   ';
    expect(modelFor('activity', 'light', 'openai')).toBe(BUILTIN_MODELS.light.openai);
  });
});

describe('isLightDisabled — 軽いモデルを全部止める', () => {
  it('`off` のときだけ true', () => {
    expect(isLightDisabled()).toBe(false);
    process.env.AI_MODEL_LIGHT = 'off';
    expect(isLightDisabled()).toBe(true);
    process.env.AI_MODEL_LIGHT = 'OFF';
    expect(isLightDisabled()).toBe(true);
    process.env.AI_MODEL_LIGHT = 'gpt-5.6-luna';
    expect(isLightDisabled()).toBe(false);
  });
});

describe('組み込みの既定', () => {
  it('light と heavy が別のモデルであること（同じなら段を分ける意味がない）', () => {
    expect(BUILTIN_MODELS.light.openai).not.toBe(BUILTIN_MODELS.heavy.openai);
    expect(BUILTIN_MODELS.light.anthropic).not.toBe(BUILTIN_MODELS.heavy.anthropic);
  });
});
