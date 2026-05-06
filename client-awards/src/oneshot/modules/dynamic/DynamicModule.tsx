import { Fragment, type ReactNode } from 'react';
import type { Lang, ModuleDef, Nominee, SlotDef } from '../../types';
import { asList, asText, resolveBinding } from './resolveBinding';

// 動的モジュールレンダラ。ModuleDef.slots[] を順番に走査して .lt-module 内の JSX を生成。
// header-label と header-byline が連続している場合は <div class="lt-module-head"> で
// グループ化する (RespectModule / RecCommentModule の構造を再現)。

interface Props {
  def: ModuleDef;
  nominee: Nominee;
  lang: Lang;
}

export default function DynamicModule({ def, nominee, lang }: Props) {
  const groups = groupHeaderSlots(def.slots);

  return (
    <>
      {groups.map((g, i) => {
        if (g.kind === 'head-group') {
          return (
            <div key={`head-${i}`} className="lt-module-head">
              {g.slots.map((s) => (
                <Fragment key={s.id}>{renderSlot(s, nominee, lang)}</Fragment>
              ))}
            </div>
          );
        }
        return <Fragment key={g.slot.id}>{renderSlot(g.slot, nominee, lang)}</Fragment>;
      })}
    </>
  );
}

// ── スロットグループ化 ────────────────────────────────────
type SlotGroup =
  | { kind: 'head-group'; slots: SlotDef[] }
  | { kind: 'single'; slot: SlotDef };

function groupHeaderSlots(slots: SlotDef[]): SlotGroup[] {
  const out: SlotGroup[] = [];
  let i = 0;
  while (i < slots.length) {
    const cur = slots[i];
    const next = slots[i + 1];
    if (cur.kind === 'header-label' && next?.kind === 'header-byline') {
      out.push({ kind: 'head-group', slots: [cur, next] });
      i += 2;
    } else {
      out.push({ kind: 'single', slot: cur });
      i++;
    }
  }
  return out;
}

// ── 個別スロット描画 ──────────────────────────────────────
function renderSlot(slot: SlotDef, n: Nominee, lang: Lang): ReactNode {
  const value = resolveBinding(slot.binding, n, lang);
  const isJa = lang === 'ja';

  switch (slot.kind) {
    case 'header-label':
      return <span className="lt-module-label">{asText(value)}</span>;

    case 'header-byline': {
      // recommender 既定: name + position を組み立てて描画。
      // (binding.field は将来 'name' / 'position' 単独指定にも拡張可能だが、
      //  段階2 では推薦者の標準 byline を再現する固定実装。)
      const r = n.recommender;
      return (
        <span className="lt-module-byline">
          <span className="lt-byline-divider" />
          <span className="lt-byline-by">{isJa ? '推薦' : 'by'}</span>
          <span className="lt-byline-name">{isJa ? r.name : r.nameEn}</span>
          <span className="lt-byline-pos">{isJa ? r.position : r.positionEn}</span>
        </span>
      );
    }

    case 'body-title':
      return <div className="lt-module-title">{asText(value)}</div>;

    case 'body-text':
      return <div className="lt-module-body">{asText(value)}</div>;

    case 'body-ism-text':
      return <div className="lt-tags-ism">{asText(value)}</div>;

    case 'body-large-quote':
      // CSS .lt-respect::before / ::after が「」を自動で付ける
      return <div className="lt-respect">{asText(value)}</div>;

    case 'body-rec-quote':
      return (
        <div className="lt-rec-body">
          <span className="lt-rec-quote-l">“</span>
          {asText(value)}
          <span className="lt-rec-quote-r">”</span>
        </div>
      );

    case 'body-tags': {
      const list = asList(value).slice(0, 8);
      return (
        <div className="lt-tags">
          {list.map((s, i) => (
            <span
              key={i}
              className="lt-tag flap-block"
              style={{ animationDelay: `${i * 40 + 150}ms` }}
            >
              {s}
            </span>
          ))}
        </div>
      );
    }

    case 'body-members-grid': {
      const list = Array.isArray(value)
        ? (value as Array<{ role: string; name: string; company: string }>)
        : [];
      return (
        <div className="lt-members">
          {list.map((m, i) => (
            <div
              key={i}
              className="lt-member flap-block"
              style={{ animationDelay: `${i * 70 + 120}ms` }}
            >
              <div className="lt-member-role">{m.role}</div>
              <div className="lt-member-name">{m.name}</div>
              <div className="lt-member-co">{m.company}</div>
            </div>
          ))}
        </div>
      );
    }

    default:
      return null;
  }
}
