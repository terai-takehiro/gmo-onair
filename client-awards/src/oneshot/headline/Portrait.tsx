import type { Nominee } from '../types';

export default function Portrait({ n }: { n: Nominee }) {
  return (
    <div className="portrait">
      <img src={n.image} alt="" />
      <div className="portrait-meta">
        <span className="entry-no">No.{n.entryNo}</span>
      </div>
    </div>
  );
}
