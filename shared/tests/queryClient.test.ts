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
 * **`mutate(..., { onError })` の形で渡した画面**（レビューでの指摘 #48）
 *
 * ── 何が起きているか（測って確かめた）────────────────────────
 *
 * `onError` の渡し方は2つあります:
 *
 *   ①  `useMutation({ onError })`      … 受け皿から**見えます**（`mutation.options.onError`）
 *   ②  `mutate(vars, { onError })`     … 受け皿から**見えません**
 *
 * ② は react-query が**観測者の側**に持つもの（`mutateOptions`）で、
 * `mutation.options` には入りません。つまり受け皿の「画面が自分で知らせているなら黙る」は
 * **② には効かず、受け皿も一緒に走ります**。指摘はここを言っています。
 *
 * ── それでも画面には1つしか出ない ──────────────────────────
 *
 * 実測すると、**受け皿が先・画面があと**の順で、`setNotice` は帯を**1つしか持たない**ので
 * **画面の文言が残ります**（利用者が見るのは正しいほうです）。
 *
 *   受け皿が先に出した帯 = 「保存できませんでした」
 *   最後に残った帯       = 「確定できませんでした」（画面の文言）
 *
 * ⚠️ **だから「直っている」ではなく「順番のおかげ」です。** 順番が入れ替わると
 * **共通の文言が画面の文言を上書きします**（何が失敗したか分からなくなる）。
 * 画面を見ても気づけないので、**順番をここで固定します**。
 *
 * ⚠️ **画面が何も出さないときは受け皿の帯が残ります。これは正しい振る舞い**です
 * （黙って失敗するのを止めるのが受け皿の役目）。黙らせたいときは `meta.silent`。
 */
describe('`mutate(..., { onError })` の画面（指摘 #48・順番を固定する）', () => {
  /** ② の形で1回失敗させ、**呼ばれた順**と最後に残った帯を返す */
  async function runWithPerCallOnError(screenNotifies: boolean) {
    const order: string[] = [];
    const observer = new MutationObserver(queryClient, {
      mutationFn: async () => {
        throw httpError(500);
      },
    });
    // ⚠️ **観測者を購読しないと ② は呼ばれません**（購読していない観測者には通知が届かない）。
    // ここを忘れると「② は呼ばれない」という**逆の結論**が出ます（実際に一度出しました）
    const unsubscribe = observer.subscribe(() => {});
    await observer
      .mutate(undefined, {
        onError: () => {
          order.push(`受け皿=${getNotice()?.title ?? 'なし'}`);
          if (screenNotifies) setNotice({ tone: 'error', title: '確定できませんでした' });
        },
      })
      .catch(() => {});
    unsubscribe();
    return { order, last: getNotice()?.title ?? null };
  }

  it('受け皿も走る（`mutation.options.onError` には入らないので黙れない）', async () => {
    const { order } = await runWithPerCallOnError(true);
    expect(order).toEqual(['受け皿=保存できませんでした']);
  });

  it('**受け皿が先・画面があと**なので、画面の文言が残る', async () => {
    const { last } = await runWithPerCallOnError(true);
    expect(last).toBe('確定できませんでした');
  });

  it('画面が何も出さないときは受け皿の帯が残る（黙って失敗させない）', async () => {
    const { last } = await runWithPerCallOnError(false);
    expect(last).toBe('保存できませんでした');
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
