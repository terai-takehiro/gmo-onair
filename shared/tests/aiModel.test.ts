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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * 制作資料 v4 の AI 生成（段8・04-ai.md §7）。
 * ①②は常時 heavy（時刻・尺の誤りは目視で気づけない）、③は既定 light（読めば良し悪しが
 * 分かる典型）、④も既定 light（次のターンで直せる）。
 */
describe('tierFor — 制作資料 v4 の AI 生成（段8）', () => {
  it('①枠 ②骨格は入力が短くても常に heavy', () => {
    expect(tierFor('event_plan', { chars: 10 })).toBe('heavy');
    expect(tierFor('script_outline', { chars: 10 })).toBe('heavy');
  });

  it('③セリフは既定 light・4,000字超で heavy（`activity` と同じ閾値）', () => {
    expect(tierFor('script_line', { chars: 100 })).toBe('light');
    expect(tierFor('script_line', { chars: 4_000 })).toBe('light');
    expect(tierFor('script_line', { chars: 4_001 })).toBe('heavy');
  });

  it('④壁打ちは既定 light。呼び出し側が force で heavy に上げられる', () => {
    expect(tierFor('production_chat', { chars: 20 })).toBe('light');
    expect(tierFor('production_chat', { chars: 20, force: 'heavy' })).toBe('heavy');
  });

  it('機能ごとの環境変数は新設していないが、モデル名は取れる（組み込みの既定に落ちる）', () => {
    expect(modelFor('event_plan', 'heavy', 'openai')).toBe(BUILTIN_MODELS.heavy.openai);
    expect(modelFor('script_outline', 'heavy', 'anthropic')).toBe(BUILTIN_MODELS.heavy.anthropic);
    expect(modelFor('script_line', 'light', 'openai')).toBe(BUILTIN_MODELS.light.openai);
    expect(modelFor('production_chat', 'light', 'openai')).toBe(BUILTIN_MODELS.light.openai);
  });

  it('段ごとの上書き（`AI_MODEL_HEAVY` 等）は制作資料の4機能にも効く', () => {
    process.env.AI_MODEL_HEAVY = 'my-heavy';
    expect(modelFor('event_plan', 'heavy', 'openai')).toBe('my-heavy');
    expect(modelFor('script_outline', 'heavy', 'openai')).toBe('my-heavy');
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

/**
 * **`off` はモデル名ではない**（レビューでの指摘 #96）
 *
 * `AI_MODEL_LIGHT=off` は「軽いモデルを使わない」という印なのに、前の版は
 * **その文字列をそのままモデル名として送って**いました。呼ぶ側は
 * 「軽いので落ちたら上位で1回だけやり直す」作りなので、**必ず1回失敗してから
 * heavy に落ちます** — 待たされ、失敗した呼び出しにも課金され、
 * ログには理由の分からない失敗が並びます。
 */
describe('AI_MODEL_LIGHT=off', () => {
  it('軽い仕事にも heavy のモデル名を返す（"off" を送らない）', () => {
    process.env.AI_MODEL_LIGHT = 'off';
    expect(modelFor('activity', 'light', 'openai')).toBe(BUILTIN_MODELS.heavy.openai);
    expect(modelFor('intake', 'light', 'anthropic')).toBe(BUILTIN_MODELS.heavy.anthropic);
    // 大文字でも同じ（`isLightDisabled` と同じ読み方）
    process.env.AI_MODEL_LIGHT = 'OFF';
    expect(modelFor('activity', 'light', 'openai')).toBe(BUILTIN_MODELS.heavy.openai);
  });

  it('止めた先も `AI_MODEL_HEAVY` の上書きに従う', () => {
    process.env.AI_MODEL_LIGHT = 'off';
    process.env.AI_MODEL_HEAVY = 'my-heavy';
    expect(modelFor('activity', 'light', 'openai')).toBe('my-heavy');
  });

  it('heavy を頼んだときは今までどおり', () => {
    process.env.AI_MODEL_LIGHT = 'off';
    expect(modelFor('minutes', 'heavy', 'openai')).toBe(BUILTIN_MODELS.heavy.openai);
  });
});

describe('環境変数は `process.env.X` の形で読む（検査から見えるように）', () => {
  it('動的に引かない', () => {
    // 動的に引くと `scripts/check-env-passthrough.mjs` から**1つも見えず**、
    // `docker-compose.yml` から消しても検査が通る（＝入れたのに効かない）
    const src = readFileSync(
      join(__dirname, '..', '..', 'server', 'src', 'shared', 'services', 'ai-model.ts'), 'utf8',
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/process\.env\[/);
    for (const name of ['AI_MODEL_HEAVY', 'AI_MODEL_LIGHT', 'INTAKE_AI_MODEL',
      'ACTIVITY_AI_MODEL', 'MINUTES_AI_MODEL', 'KPT_AI_MODEL']) {
      expect(code).toContain(`process.env.${name}`);
    }
  });

  it('検査はサービスごとに見る（片方だけに足しても止まる）', () => {
    const chk = readFileSync(join(__dirname, '..', '..', 'scripts', 'check-env-passthrough.mjs'), 'utf8');
    expect(chk).toMatch(/const SERVICES = \['app_prod', 'app_dev'\];/);
    expect(chk).toMatch(/SERVICES\.some\(\(s\) => !byService\.get\(s\)\.has\(v\)\)/);
    // 片方だけが正しいものは**理由つきで**名指しする
    expect(chk).toMatch(/const ONE_SIDED = \{/);
    expect(chk).toMatch(/SMTP_HOST: 'app_prod — ⚠️ 検証から送ると取引先に本物のメールが届く'/);
  });
});
