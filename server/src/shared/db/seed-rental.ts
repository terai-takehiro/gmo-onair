/**
 * seed-rental.ts
 *
 * レンタル機材検索（制作技術支援のミニアプリ）の機材カタログ（qsheet_rental_items）に
 * 開発・検証用のダミーデータを入れる。開発・検証環境で自動実行される（本番は
 * SKIP_SEED=true のため実行されない）。
 *
 * ⚠️ **これは本物のクロール結果ではない。** 2社サイト（東京オフラインセンター・
 * レスター）を実際に取得するスクレイパーは別途 VPS 側の cron で運用する想定
 * （docs/design/v4/rental-search/README.md 参照）。ここは画面の見た目・検索・
 * 絞り込みを手元で確認するための最小限のサンプル行。
 *
 *   npm run db:seed:rental -w server
 */

import { initDb, closeDb, queryOne, execute } from './connection';
import { runMigrations } from './migrate';

interface SeedItem {
  company: '東京オフラインセンター' | 'レスター';
  itemId: string;
  name: string;
  category: string;
  subcategory?: string;
  priceTel?: number;
  priceNet: number;
  specs?: Record<string, string>;
  relatedItemIds?: string[];
  url: string;
  status?: 'listed' | 'missing';
}

const TOC = '東京オフラインセンター' as const;
const RESTAR = 'レスター' as const;

const ITEMS: SeedItem[] = [
  {
    company: TOC,
    itemId: '5043',
    name: 'SONY PXW-FX9 XDCAMメモリーカムコーダー',
    category: 'カメラ',
    subcategory: '大型カムコーダー',
    priceTel: 28000,
    priceNet: 25200,
    specs: {
      センサー: 'フルサイズ 6K Exmor R CMOS',
      レンズマウント: 'Eマウント（レバーロック式）',
      記録フォーマット: 'XAVC-I / XAVC-L ・ 4K 60p',
      質量: '約 2.0kg（本体のみ）',
      付属品: 'ビューファインダー・グリップ・バッテリー×2・充電器',
    },
    relatedItemIds: ['5044', '5045'],
    url: 'https://ec.toc-net.jp/rental/item/5043',
  },
  {
    company: TOC,
    itemId: '4102',
    name: 'SONY PXW-Z280 XDCAMメモリーカムコーダー',
    category: 'カメラ',
    subcategory: 'ハンディカムコーダー',
    priceTel: 15000,
    priceNet: 13500,
    url: 'https://ec.toc-net.jp/rental/item/4102',
    status: 'missing',
  },
  {
    company: TOC,
    itemId: '5121',
    name: 'Blackmagic ATEM Mini Extreme ISO',
    category: 'スイッチャー・収録',
    subcategory: 'ビデオスイッチャー',
    priceTel: 12000,
    priceNet: 10800,
    url: 'https://ec.toc-net.jp/rental/item/5121',
  },
  {
    company: TOC,
    itemId: '4988',
    name: 'SENNHEISER EW 512P G4 ワイヤレスマイクセット',
    category: '音声',
    subcategory: 'ワイヤレス',
    priceTel: 8000,
    priceNet: 7200,
    url: 'https://ec.toc-net.jp/rental/item/4988',
  },
  {
    company: TOC,
    itemId: '5044',
    name: 'SONY BP-U70 バッテリー',
    category: 'カメラ',
    subcategory: 'バッテリー',
    priceTel: 2000,
    priceNet: 1800,
    url: 'https://ec.toc-net.jp/rental/item/5044',
  },
  {
    company: TOC,
    itemId: '5045',
    name: 'SONY SEL24105G レンズ',
    category: 'カメラ',
    subcategory: 'レンズ',
    priceTel: 6000,
    priceNet: 5400,
    url: 'https://ec.toc-net.jp/rental/item/5045',
  },
  {
    company: RESTAR,
    itemId: '277',
    name: 'Panasonic AW-UE150 4Kインテグレーテッドカメラ',
    category: 'カメラ',
    subcategory: 'リモートカメラ',
    priceNet: 33000,
    specs: { description: 'PTZリモートカメラ。三脚・電源ケーブル付属。' },
    url: 'https://www.restargp.com/service/solutions/rental/item277/',
  },
  {
    company: RESTAR,
    itemId: '312',
    name: 'Roland V-160HD ストリーミングビデオスイッチャー',
    category: 'スイッチャー・収録',
    priceNet: 26400,
    url: 'https://www.restargp.com/service/solutions/rental/item312/',
  },
];

export async function seedRental() {
  await initDb();

  const tableExists = await queryOne(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='qsheet_rental_items'`
  );
  if (!tableExists) {
    console.warn('[seed-rental] qsheet_rental_items が未作成のためスキップ');
    return;
  }

  const already = await queryOne(`SELECT 1 FROM qsheet_rental_items LIMIT 1`);
  if (already) {
    console.log('[seed-rental] 既に投入済みのためスキップ');
    return;
  }

  for (const item of ITEMS) {
    await execute(
      `INSERT INTO qsheet_rental_items
         (company, item_id, name, category, subcategory, price_tel, price_net, specs, related_item_ids, url, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (company, item_id) DO NOTHING`,
      [
        item.company,
        item.itemId,
        item.name,
        item.category,
        item.subcategory ?? null,
        item.priceTel ?? null,
        item.priceNet,
        JSON.stringify(item.specs ?? {}),
        JSON.stringify(item.relatedItemIds ?? []),
        item.url,
        item.status ?? 'listed',
      ]
    );
  }

  console.log(`[seed-rental] ${ITEMS.length}件のサンプル機材を投入しました`);
}

// CLI で直接実行した場合
if (process.argv[1]?.endsWith('seed-rental.ts') || process.argv[1]?.endsWith('seed-rental.js')) {
  runMigrations().then(() => seedRental()).then(() => closeDb()).catch(console.error);
}
