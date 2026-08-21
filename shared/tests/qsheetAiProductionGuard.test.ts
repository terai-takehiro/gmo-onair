/**
 * 制作資料 v4 の AI 生成（段8）— 「本番中は AI を1回も呼ばない」を機械で見張る。
 *
 * 04-ai.md §8-2: 本番4画面（進行/OnAir・ランダウン・プロンプター・公開音声）は
 * 提案の生成ボタンを**画面から消す**。ここでは「そもそも AI 関連のモジュールを
 * import していない」ことをソースの静的走査で固定する（`aiFeedback.test.ts` /
 * `sqlPlaceholder.test.ts` と同じ「ソースを読んで守る」やり方）。
 *
 * ⚠️ これは import の有無を見るだけで、実行時の分岐までは追わない。
 * それでも「うっかり `import { AiPanel }` を足す」という最もありがちな事故は防げる。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const CLIENT_QSHEET = join(__dirname, '..', '..', 'client-qsheet', 'src');

const PRODUCTION_PAGES = [
  'pages/OnAirPage.tsx',
  'pages/RundownPage.tsx',
  'pages/PrompterPage.tsx',
  'pages/AudioSupportPage.tsx',
];

describe('本番4画面は AI 生成 UI を import していない（04-ai.md §8-2）', () => {
  for (const rel of PRODUCTION_PAGES) {
    it(rel, () => {
      const src = readFileSync(join(CLIENT_QSHEET, rel), 'utf8');
      expect(src).not.toMatch(/lib\/aiApi/);
      expect(src).not.toMatch(/components\/ai\//);
    });
  }
});

describe('AI 生成サービス（段8）は data / qsheet_schedule_items を直接更新しない', () => {
  it('①②③のサービスファイルに `UPDATE qsheet_documents` / `SET data` が無い', () => {
    const files = [
      'event-plan-ai.service.ts', 'script-outline-ai.service.ts', 'script-line-ai.service.ts',
      'generation-common.ts', 'materials.ts', 'similar.ts',
    ];
    const base = join(__dirname, '..', '..', 'server', 'src', 'contexts', 'qsheet', 'ai');
    for (const f of files) {
      const src = readFileSync(join(base, f), 'utf8');
      expect(src, `${f} に qsheet_documents への UPDATE がある`).not.toMatch(/UPDATE\s+qsheet_documents/i);
      expect(src, `${f} に qsheet_schedule_items への書き込みがある`).not.toMatch(/(INSERT INTO|UPDATE)\s+qsheet_schedule_items/i);
    }
  });

  it('生成サービスは `createProposal`（qsheet_ai_proposals への保存）だけを呼ぶ', () => {
    const base = join(__dirname, '..', '..', 'server', 'src', 'contexts', 'qsheet', 'ai');
    for (const f of ['event-plan-ai.service.ts', 'script-outline-ai.service.ts', 'script-line-ai.service.ts']) {
      const src = readFileSync(join(base, f), 'utf8');
      expect(src).toMatch(/runGeneration/); // runGeneration の中で createProposal を呼ぶ
    }
  });
});

describe('④壁打ちは hasCorrections を使わない（04-ai.md §5-2 F19）', () => {
  it('押し直し（good→reject 等）が2回目を黙って捨てられないよう delete→insert にしてある', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', 'server', 'src', 'contexts', 'qsheet', 'ai', 'chat.service.ts'), 'utf8',
    );
    expect(src).not.toMatch(/hasCorrections\(/);
    expect(src).toMatch(/DELETE FROM ai_corrections/);
  });
});

describe('無人バッチ（締め・期限切れ）に AI 呼び出しが無いこと（既存・段7の確認を維持）', () => {
  it('settle.service.ts / apply.service.ts に openai / anthropic の import が無い', () => {
    const base = join(__dirname, '..', '..', 'server', 'src', 'contexts', 'qsheet', 'ai');
    for (const f of ['settle.service.ts', 'apply.service.ts']) {
      const src = readFileSync(join(base, f), 'utf8');
      expect(src).not.toMatch(/from ['"]openai['"]/);
      expect(src).not.toMatch(/from ['"]@anthropic-ai\/sdk['"]/);
      expect(src).not.toMatch(/callOpenAi|callAnthropic|callStructured/);
    }
  });
});
