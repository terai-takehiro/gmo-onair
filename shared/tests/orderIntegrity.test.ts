/**
 * **半分だけ動く並べ替え／付け直されない時間外の印**
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * どちらも**画面に嘘が出ないまま data だけがずれます**。
 *
 * ・**並べ替え**は画面から `PUT` を**2本続けて**投げていました。1本目が通って
 *   2本目が落ちると（通信が切れた・権限が無かった・タブを閉じた）、
 *   **2つが同じ `sort_order`** になります。並びは `sort_order, created_at` なので
 *   **入れ替わったようで入れ替わらない**か**関係ない順**になり、
 *   画面には「並べ替えられませんでした」と出るのに**半分だけ動いています**。
 *   **実測: 1本目だけ通すと、同じ `sort_order` の分類が 2 件**
 * ・**時間外の印**は**作るときだけ**書いていました。直したときに見直さないので、
 *   **14:00 → 22:00 に動かしても印が付きません**（実測）。
 *   一覧は「あとから拾って個別に連絡する」ためのものなので、
 *   **出ないものは無いことになります**。逆に 22:00 → 14:00 では**印が残り続け**ます。
 *
 * v4 の PR で指摘された形です（#52 / #63）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

/** 説明文を外してから探す（前の版の形が注釈に書いてあるため） */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PRICING = code(read('server', 'src', 'contexts', 'sales', 'routes', 'pricing.routes.ts'));
const PRICING_PAGE = code(read('client', 'src', 'contexts', 'sales', 'pages', 'PricingListPage.tsx'));
const STUDIO = code(read('server', 'src', 'contexts', 'production', 'routes', 'studio.routes.ts'));

describe('並べ替えは取引の中で入れ替える', () => {
  it('⚠️ 画面から2本続けて投げない', () => {
    // 1本目が通って2本目が落ちると、2つが同じ `sort_order` になる
    expect(PRICING_PAGE).toMatch(
      /api\.put\(`\/pricing\/categories\/\$\{p\.id\}\/move`, \{ dir: p\.dir \}\)/);
    expect(PRICING_PAGE).not.toMatch(/await api\.put\(`\/pricing\/categories\/\$\{p\.a\.id\}`/);
  });

  it('サーバーは1つの取引で2行だけ書き換える', () => {
    expect(PRICING).toMatch(/withTransaction\(async \(tx\) => \{/);
    expect(PRICING).toMatch(/SET sort_order = \?, updated_at = NOW\(\), updated_by = \? WHERE id = \?/);
  });

  it('⚠️ 読むのも取引の中（位置を取引の外で読まない）', () => {
    /*
     * レビューでの指摘 #138（P1）。2本の UPDATE が原子的でも、
     * **読んだ位置が古ければ古い位置を書きます**。隣り合う行に同時に届くと
     * A=10 / B=20 / C=30 が **A=20 / C=20 / B=30** になり、`sort_order` が重複します。
     */
    const fn = PRICING.slice(PRICING.indexOf('async function moveRow'), PRICING.indexOf('const dirOf'));
    const body = fn.slice(fn.indexOf('withTransaction'));
    // 位置と隣を読むのは、取引に入ったあと
    expect(body).toMatch(/tx\.queryOne\([\s\S]*?sort_order FROM/);
    expect(body).toMatch(/tx\.queryOne\(\s*\n?\s*dir === 'up'/);
    // 取引の外に読み取りを残さない
    const beforeTx = fn.slice(0, fn.indexOf('withTransaction'));
    expect(beforeTx).not.toMatch(/queryOne\(/);
  });

  it('⚠️ 束の親を1行だけ押さえる（向かい合わせでも行き詰まらない）', () => {
    /*
     * `me` と `neighbor` を順に `FOR UPDATE` するだけだと、「A を下へ」と
     * 「B を上へ」で**押さえる順が逆**になり行き詰まります（Postgres が片方を
     * 落とすので壊れはしませんが、押した人には理由の分からない失敗が出ます）。
     * 押さえる先が1つなら、その順番は1通りしかありません。
     */
    expect(PRICING).toMatch(/const PARENT_OF = \{/);
    expect(PRICING).toMatch(/pricing_categories: 'studio_locations'/);
    expect(PRICING).toMatch(/pricing_items: 'pricing_categories'/);
    expect(PRICING).toMatch(/FROM \$\{PARENT_OF\[table\]\} WHERE id = \? FOR UPDATE/);
  });

  it('隣を探すのはサーバー（画面は向きだけ渡す）', () => {
    expect(PRICING).toMatch(/dir === 'up'/);
    expect(PRICING).toMatch(/ORDER BY sort_order DESC LIMIT 1/);
    expect(PRICING).toMatch(/ORDER BY sort_order ASC LIMIT 1/);
    // **消した行を隣にしない**（消えた分類を飛び越えられなくなる）
    expect((PRICING.match(/deleted_at IS NULL AND sort_order/g) ?? []).length).toBe(2);
  });

  it('端では何もしない（400 にしない）', () => {
    // 400 を返すと、いちばん上の分類で押した人にだけ赤い札が出る
    expect(PRICING).toMatch(/if \(!neighbor\) return \[\];/);
  });

  it('分類と品目で同じ関数を通す（片方だけ直らないように）', () => {
    expect(PRICING).toMatch(/moveRow\('pricing_categories', 'location_id'/);
    expect(PRICING).toMatch(/moveRow\('pricing_items', 'category_id'/);
  });
});

describe('予約を直したら時間外の印を付け直す', () => {
  it('⚠️ 時刻を直したときと部屋を替えたときの両方で見直す', () => {
    // 部屋を替えると拠点が変わる（拠点ごとに営業時間が違う）
    expect(STUDIO).toMatch(/const timeChanged = b\.start_time !== undefined \|\| b\.end_time !== undefined;/);
    expect(STUDIO).toMatch(/const roomsChanged = Array\.isArray\(room_details\) \|\| Array\.isArray\(room_ids\);/);
    expect(STUDIO).toMatch(/if \(timeChanged \|\| roomsChanged\) \{/);
  });

  it('部屋を入れ替えたあとの拠点で判定する', () => {
    // 入れ替え前の拠点で見ると、部屋を移した予約が古い拠点の営業時間で判定される
    expect(STUDIO).toMatch(/const loc = await locationOfBooking\(String\(req\.params\.id\)\);/);
    expect(STUDIO).toMatch(/hoursCheck = await checkBooking\(/);
  });

  it('中に戻したときは印が外れる（false も書く）', () => {
    expect(STUDIO).toMatch(/await stampOutOfHours\(String\(req\.params\.id\), hoursCheck\);/);
  });

  it('判定の結果は行とは別に返す（作るときと同じ形）', () => {
    // 列に入れた文言をそのまま出すと、設定を直しても古い文が残る
    expect(STUDIO).toMatch(/\.\.\.\(hoursCheck \? \{ hours_check: hoursCheck \} : \{\}\)/);
  });
});

describe('予約を直したら重複疑いの印も付け直す', () => {
  it('⚠️ 題名・時刻・部屋・案件のどれが変わっても見直す', () => {
    // 表記揺らぎだけ直しても（題名が変わっても）、案件を付け替えても見直さないと
    // 「重複が解消したのに印が残る／新しく重複したのに印が付かない」が起きる
    expect(STUDIO).toMatch(/const titleChanged = b\.title !== undefined;/);
    expect(STUDIO).toMatch(/const projectChanged = b\.project_id !== undefined;/);
    expect(STUDIO).toMatch(/if \(timeChanged \|\| roomsChanged \|\| titleChanged \|\| projectChanged\) \{/);
  });

  it('中に戻したとき（重複が解消したとき）は印が外れる（false も書く）', () => {
    expect(STUDIO).toMatch(/await stampPossibleDuplicate\(String\(req\.params\.id\), duplicateCheck\);/);
  });
});
