/**
 * 「保存が黙って失敗しない」ことのテスト。
 *
 * ── なぜここをテストするか ──────────────────────────────────
 *
 * `queryClient.ts` の MutationCache に置いた**最後の受け皿**は、
 * **間違っても何も起きない**種類のコードです:
 *
 *   ・`onError` の引数の並びを取り違えると (4番目が mutation)、
 *     `mutation.options.onError` が常に `undefined` になり **常に二重に出る**、
 *     または常に truthy になり **常に黙る**
 *   ・どちらも**画面を見ただけでは分からない**。二重表示は「たまたま気づく」、
 *     常に黙るのは**元の不具合と見分けが付かない**
 *   ・型でも lint でも出ない (どちらの並びでも型は通る)
 *
 * 書き込みは7アプリで 296 か所あり、この受け皿が効かないと
 * そのうち 240 か所以上が**押しても何も起きない**ままになります。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { MutationObserver } from '@tanstack/react-query';
import { queryClient } from '../src/client/queryClient';
import { getNotice, setNotice } from '../src/client/ui/notice';

/** サーバーからの失敗を模す (axios の形) */
function httpError(status: number, message?: string) {
  const err = new Error(`Request failed with status code ${status}`) as Error & {
    response: { status: number; data?: unknown };
  };
  err.response = { status, data: message ? { error: { message } } : undefined };
  return err;
}

/** 書き込みを1回実行して失敗させる */
async function runFailingMutation(
  error: unknown,
  options: { own?: boolean; meta?: Record<string, unknown> } = {},
) {
  const observer = new MutationObserver(queryClient, {
    mutationFn: async () => {
      throw error;
    },
    meta: options.meta,
    // 画面が自分でエラーを描いている場合を模す
    onError: options.own ? () => {} : undefined,
  });
  await observer.mutate().catch(() => {});
}

beforeEach(() => setNotice(null));

describe('MutationCache の最後の受け皿', () => {
  it('画面が何もしていない書き込みが失敗したら、帯を出す', async () => {
    await runFailingMutation(httpError(500));
    expect(getNotice()).toMatchObject({ tone: 'error', title: '保存できませんでした' });
  });

  it('`meta.action` があれば「〜に失敗しました」にする', async () => {
    await runFailingMutation(httpError(500), { meta: { action: '案件の保存' } });
    expect(getNotice()?.title).toBe('案件の保存に失敗しました');
  });

  it('サーバーの日本語メッセージをそのまま出す (技術用語を出さない)', async () => {
    await runFailingMutation(httpError(400, '締め済みの月は変更できません'));
    expect(getNotice()?.description).toBe('締め済みの月は変更できません');
  });

  it('メッセージが無いときは次の一手を出す (HTTP コードは出さない)', async () => {
    await runFailingMutation(httpError(500));
    expect(getNotice()?.description).toBe('もう一度お試しください。続くときは管理者に連絡してください。');
    expect(getNotice()?.description).not.toMatch(/500|status/i);
  });

  it('**画面が自分で `onError` を持っているときは黙る** (同じ失敗を2回出さない)', async () => {
    await runFailingMutation(httpError(500), { own: true });
    expect(getNotice()).toBeNull();
  });

  it('`meta.silent` のときは黙る', async () => {
    await runFailingMutation(httpError(500), { meta: { silent: true } });
    expect(getNotice()).toBeNull();
  });

  it('401 は黙る (api クライアントがログイン画面に送るので二重になる)', async () => {
    await runFailingMutation(httpError(401));
    expect(getNotice()).toBeNull();
  });

  it('書き込みは retry しない (同じ登録が2件できるほうが害が大きい)', async () => {
    let calls = 0;
    const observer = new MutationObserver(queryClient, {
      mutationFn: async () => {
        calls += 1;
        throw httpError(500);
      },
    });
    await observer.mutate().catch(() => {});
    expect(calls).toBe(1);
  });
});

/**
 * **同じ文言を続けて出しても、出たことが分かる**（レビューでの指摘 #62）
 *
 * 帯の鍵が中身（`tone:title`）だったので、**いちばん多い「同じ操作を続けたとき」**
 * （「記録しました」→「記録しました」）に鍵が変わらず、React が要素を使い回して
 * **動きが再生されません**でした。前の帯と同じ位置に黙って差し替わるので、
 * 押した人には**2回目が出たのかどうか分かりません**（そしてもう一度押されます）。
 */
describe('お知らせの帯は、出すたびに別の回として扱う', () => {
  it('同じ文言でも通し番号が変わる', () => {
    setNotice({ tone: 'success', title: '記録しました' });
    const first = getNotice()?.seq;
    setNotice({ tone: 'success', title: '記録しました' });
    const second = getNotice()?.seq;
    expect(first).toBeTypeOf('number');
    expect(second).toBe((first as number) + 1);
  });

  it('画面は通し番号を鍵にする（中身ではない）', () => {
    const src = readFileSync(
      join(__dirname, '..', 'src', 'client', 'ui', 'notice.tsx'), 'utf8',
    );
    expect(src).toMatch(/key=\{n\.seq \?\? `\$\{n\.tone\}:\$\{n\.title\}`\}/);
  });
});
