/**
 * ケーブル・コネクタの印刷用の表。
 *
 * ── 直したこと: **印刷すると白紙だった** ──────────────────────
 *
 * 元の `CablePage` / `ConnectorPage` は `hidden print:block` の表を持っていましたが、
 * `index.css` の `@media print` は **`body * { visibility: hidden }`** を掛けたうえで
 * `#eq-print-area-wrapper` の中だけを見えるようにしています。
 * ケーブルの表はその外側にあったので `display:block` にはなっても
 * **`visibility:hidden` のまま**で、押すと白紙が出ていました。
 *
 * 印刷の CSS は `index.css` (ラック図と共用) なので**触らず**、
 * 出す側をその入れ物の中に移しています。
 */
import { KIND_LABELS, type CatalogConfig, type CatalogItem } from './types';

export function CatalogPrintTable({
  config, items, title, filterLabel,
}: {
  config: CatalogConfig;
  items: CatalogItem[];
  title: string;
  filterLabel: string;
}) {
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div id="eq-print-area-wrapper">
      <div id="eq-print-area">
        <div className="print-title">{title}</div>
        <div className="print-meta">
          {today}　全 {items.length} 件{filterLabel ? `　絞り込み: ${filterLabel}` : ''}
        </div>
        <table>
          <thead>
            <tr>
              <th className="check-col">✓</th>
              <th>用途</th>
              <th>設置場所</th>
              <th className="col-name">商品名</th>
              <th>メーカー</th>
              <th className="col-id">型名</th>
              {config.hasLength && <th>m</th>}
              {config.hasLength && <th>色</th>}
              <th>{config.unit}数</th>
              <th>収納方法</th>
              <th className="col-notes">備考</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="depth-0">
                <td className="check-col">
                  <span style={{ display: 'block', width: 13, height: 13, border: '1px solid #000', margin: '0 auto' }} />
                </td>
                <td>{KIND_LABELS[it.kind] ?? it.kind}</td>
                <td>{it.location_name || ''}</td>
                <td className="col-name">{it.name}</td>
                <td>{it.manufacturer_name || ''}</td>
                <td className="col-id">{it.model_number || ''}</td>
                {config.hasLength && <td>{it.length_m ?? ''}</td>}
                {config.hasLength && <td>{it.color || ''}</td>}
                <td>{it.quantity}</td>
                <td>{it.storage_method || ''}</td>
                <td className="col-notes">{it.notes || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
