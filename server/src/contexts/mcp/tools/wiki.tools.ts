/**
 * Wiki の MCP ツール6本（段E・設計 `docs/design/v4/wiki.md` §7-6）。
 *
 * 外の AI（Claude Code・claude.ai のコネクタ・`mail-intake` などのスキル）が
 * **会社のルールを読んでから動く**ための口です。プロンプトに手書きしていた
 * 仕分け表を Wiki のページに移せるようにするのが目的なので、読み取り4本を先に置き、
 * 書き込みは2本だけにしてあります。
 *
 * | ツール | 何をするか | 権限 |
 * | --- | --- | --- |
 * | `search_wiki` | 検索（§5-4）。題・一致した見出し・抜粋を返す | wiki reader |
 * | `get_wiki_page` | ページ1本を Markdown（YAML の見出し付き）で返す | wiki reader |
 * | `list_wiki_pages` | スペースのツリー（id・題・親・更新日） | wiki reader |
 * | `create_wiki_page` | **下書き**として作る（`ai_outputs` kind `wiki_draft` に記録） | wiki editor |
 * | `update_wiki_page` | 下書きの本文の置き換え／末尾への追記（取り合いは 409） | wiki editor |
 * | `query_wiki_database` | データベースの行を項目で絞って返す | wiki reader |
 *
 * 中身は3つに分けてあります（1ファイル 400 行の決まり）:
 *   - `wiki-read.tools.ts`  … 読む4本
 *   - `wiki-write.tools.ts` … 書く2本（`ai_outputs` への記録もここ）
 *   - `wiki.access.ts`      … 権限と閲覧範囲の入口（6本すべてが通る）
 *
 * ⚠️ **`server.registerTool(...)` はこのファイルにだけ置きます。**
 * `scripts/generate-mcp-tools.mjs` は `*.tools.ts` の**ファイル名でカテゴリを切る**ので、
 * 登録を `wiki-read.tools.ts` 側へ移すと「MCP コネクタ」の画面に Wiki が2つ並び、
 * 表に無いキー（`wiki-read`）がそのまま利用者に出ます。あちらは**呼ばれる関数だけ**を
 * 持ち、登録が1件も無いので走査から外れます。
 *
 * ⚠️ **書き込みは必ず下書きです。公開する口はありません**（§7-6）。
 * 公開は人が Wiki の画面で押します（メール取込の「AI は起票まで・確定は人」と同じ）。
 *
 * ⚠️ **閲覧できる範囲は画面と同じ**（`wiki.access.ts` の表）。読めないページは
 * 404 で、存在ごと隠します（§8）。
 *
 * ⚠️ **ここの説明文（`.describe()` と `description`）は、外の AI にとっての
 * プロンプトそのものです。** 文面を直したら `wiki-write.tools.ts` の
 * `WIKI_DRAFT_PROMPT_VERSION` を上げること（上げないと、契約を直した効果を
 * 後から数字で言えません。`activity_intake` で決めた作法）。
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { REQUESTED_BY } from '../helpers';
import { runWikiTool } from './wiki.access';
import {
  searchWiki, getWikiPage, listWikiPages, queryWikiDatabase,
} from './wiki-read.tools';
import { createWikiPage, updateWikiPage, MAX_BODY } from './wiki-write.tools';

/** 絞り込みの演算子（`wiki-database-schema.ts` の `WIKI_FILTER_OPS` と同じ7つ） */
const FILTER_OPS = ['is', 'is_not', 'contains', 'is_empty', 'is_not_empty', 'before', 'after'] as const;

export function registerWikiTools(server: McpServer): void {
  /* ── 読む4本 ─────────────────────────────────────────── */

  server.registerTool(
    'search_wiki',
    {
      title: 'Wiki の検索（手順書・ルール）',
      description:
        '社内 Wiki のページを検索し、題・道（スペース ＞ 親 ＞ …）・一致した見出し・本文の抜粋・更新日を返す。' +
        '**会社のルールや手順が関わる作業の前に、まずここを引くこと。** ' +
        'プロンプトに書いてある仕分け表より、Wiki のページのほうが新しい。' +
        '2語以上を渡すと AND で絞る。`total` は上限で切る前の当たりの数。' +
        '**出るのは公開ページだけ**で、下書きと閲覧範囲が限られたスペースは件数にも入らない。',
      inputSchema: {
        q: z.string().min(1).max(200).describe('探す語。2語以上は空白で区切ると AND'),
        space: z.string().max(100).optional().describe('スペース（短い英数字の key でも id でもよい）'),
        tags: z.array(z.string().max(60)).max(10).optional().describe('タグ（すべて持つページだけ）'),
        owner_user_id: z.string().max(60).optional().describe('担当のユーザー id'),
        updated_within_days: z.number().int().min(1).max(3650).optional().describe('この日数以内に更新されたものだけ'),
        limit: z.number().int().min(1).max(100).optional().describe('返す件数（既定 20）'),
      },
    },
    async (args) => runWikiTool(() => searchWiki(args)),
  );

  server.registerTool(
    'get_wiki_page',
    {
      title: 'Wiki のページを Markdown で取得',
      description:
        'ページ1本を **Markdown（先頭に YAML の見出し付き）**で返す。' +
        '画面の `.md` 書き出し・zip の書き出しとまったく同じ形。' +
        '見出しの `updated` は `update_wiki_page` の `expected_updated_at` にそのまま渡せる。' +
        '読めないページは 404（存在ごと隠す）。',
      inputSchema: {
        page_id: z.string().min(1).max(60).describe('ページ id（`wp-…`。検索やツリーが返す値）'),
      },
    },
    async (args) => runWikiTool(() => getWikiPage(args)),
  );

  server.registerTool(
    'list_wiki_pages',
    {
      title: 'Wiki のスペース一覧・ページのツリー',
      description:
        '`space` を渡すとそのスペースのツリー（id・題・親・種類・状態・更新日）を平らな配列で返す。' +
        '**渡さないと読めるスペースの一覧**（key・名前・ページ数）を返すので、' +
        'どこを見ればよいか分からないときは先に引数なしで呼ぶ。' +
        '`kind` が `database` の行は `query_wiki_database` で中身を読む。',
      inputSchema: {
        space: z.string().max(100).optional().describe('スペース（key でも id でもよい）。省略すると一覧'),
      },
    },
    async (args) => runWikiTool(() => listWikiPages(args)),
  );

  server.registerTool(
    'query_wiki_database',
    {
      title: 'Wiki のデータベースの行を絞って取得',
      description:
        'データベース（`kind` が `database` のページ）の行を絞って返す。' +
        '返すのは 題・項目の値・**本文の先頭200字**・更新日。' +
        '`filters` の `item` は項目の id でも名前でもよい（無い項目を指すとエラーで知らせる）。' +
        '`view` を渡すと、そのビューの絞り込みと並べ替えを先に当ててから `filters` を重ねる。' +
        '行を足すのは `create_wiki_page` に `parent_id`（このページ）と `props` を渡す。',
      inputSchema: {
        page_id: z.string().min(1).max(60).describe('データベースのページ id'),
        view: z.string().max(60).optional().describe('ビューの id か名前（省略すると既定のビュー）'),
        filters: z.array(z.object({
          item: z.string().max(60).describe('項目の id か名前'),
          op: z.enum(FILTER_OPS).describe('比べ方'),
          value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional()
            .describe('比べる値（`is_empty` / `is_not_empty` では要らない）'),
        })).max(10).optional().describe('絞り込み（すべてを満たす行だけ）'),
        limit: z.number().int().min(1).max(100).optional().describe('返す行数（既定 50）'),
      },
    },
    async (args) => runWikiTool(() => queryWikiDatabase(args)),
  );

  /* ── 書く2本（**必ず下書き**）───────────────────────────── */

  server.registerTool(
    'create_wiki_page',
    {
      title: 'Wiki のページを下書きとして作成',
      description:
        'Wiki のページを**下書きとして**作る（公開はしない。人が Wiki の画面で「公開する」を押す）。' +
        '本文は Markdown の文字列で渡す。**HTML タグは書かない**（描くのは画面）。' +
        '見出しは `#`〜`###` まで、注意書きは `> [!CAUTION]` の行で始める。' +
        '**材料に無いことを書かないこと** — 読む人はこの手順どおりに現場で手を動かす。' +
        '`space` か `parent_id` のどちらかが要る（`parent_id` を渡せばスペースはそこから決まる）。' +
        '`parent_id` にデータベースのページを渡し `props` を添えると、その行として作られる' +
        '（値は親の項目定義で検査し、合わない値は黙って落とさずエラーにする）。' +
        'ONAiR ログイン連携（OAuth）が必須で、共有APIキーでは 403。',
      inputSchema: {
        title: z.string().min(1).max(200).describe('ページの題。何の手順書かが分かる短い名前'),
        space: z.string().max(100).optional().describe('スペース（key でも id でもよい）'),
        parent_id: z.string().max(60).optional().describe('親ページ id。データベースのページなら行になる'),
        body_md: z.string().max(MAX_BODY).optional().describe('本文（Markdown の文字列）'),
        tags: z.array(z.string().max(60)).max(20).optional().describe('タグ'),
        props: z.record(z.string(), z.unknown()).optional()
          .describe('データベースの行の項目の値（項目の id か名前がキー）'),
        sources: z.array(z.string().max(500)).max(20).optional()
          .describe('材料にしたもの（メールの件名・議事録の id など）。記録に残り、あとで読み違えを確かめられる'),
        ...REQUESTED_BY,
      },
    },
    /*
     * ⚠️ **書き込みの記録（`audit(`）は `createWikiPage()` の中で呼んでいます。**
     * `scripts/generate-mcp-tools.mjs` の `extractTools()` は「`registerTool(...)` の
     * ソーステキストに `audit(` という文字列があるか」で参照／書き込みを静的に判定するので、
     * この注記が無いと「参照」と誤って表示されます（`production.tools.ts` 冒頭と同じ罠）。
     * 権限ゲートそのものは `gate.ts` の `WRITE_TOOL_PERMISSIONS` を直接見るので別に効きます。
     */
    async (args) => runWikiTool(() => createWikiPage(args)),
  );

  server.registerTool(
    'update_wiki_page',
    {
      title: 'Wiki の下書きの本文を置き換え／追記',
      description:
        '**下書きの**本文を置き換える（`mode: "replace"`）か、末尾に足す（`mode: "append"`）。' +
        '**公開済みのページは直せない**（人が Wiki の画面で直す）。' +
        '`expected_updated_at` には直前に `get_wiki_page` で受け取った `updated` をそのまま渡す。' +
        '食い違うと **409（CONFLICT）** を返すので、**読み直してから出し直すこと**' +
        '（そのまま押し通すと、人が書いた分を消す）。' +
        'ONAiR ログイン連携（OAuth）が必須で、共有APIキーでは 403。',
      inputSchema: {
        page_id: z.string().min(1).max(60).describe('ページ id（下書きだけ）'),
        mode: z.enum(['replace', 'append']).describe('replace=本文を置き換える / append=末尾に足す'),
        body_md: z.string().min(1).max(MAX_BODY).describe('本文（Markdown の文字列。HTML は書かない）'),
        expected_updated_at: z.string().min(1).max(40)
          .describe('直前に読んだ更新日時（ISO8601）。取り合いの検出に使う'),
        note: z.string().max(200).optional().describe('何を変えたか（履歴の1行に残る）'),
        ...REQUESTED_BY,
      },
    },
    // ⚠️ `audit(` は `updateWikiPage()` の中。理由は `create_wiki_page` 側の注記と同じ
    async (args) => runWikiTool(() => updateWikiPage(args)),
  );
}
