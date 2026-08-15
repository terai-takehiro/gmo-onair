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
    expect(PRICING).toMatch(/await withTransaction\(async \(tx\) => \{/);
    expect(PRICING).toMatch(/SET sort_order = \?, updated_at = NOW\(\), updated_by = \? WHERE id = \?/);
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
    expect(STUDIO).toMatch(/hoursCheck \? \{ \.\.\.after, hours_check: hoursCheck \} : after/);
  });
});
