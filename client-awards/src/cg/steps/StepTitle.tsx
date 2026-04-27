interface StepTitleProps {
  eventName: string;
  eventSubtitle?: string | null;
  categoryName?: string;
}

export default function StepTitle({ eventName, eventSubtitle, categoryName }: StepTitleProps) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 50%, #0a1428 100%)',
      }}
    >
      {/* Decorative lines */}
      <div className="absolute inset-x-0 top-1/3 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-1/3 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />

      <div className="text-center px-24 relative z-10">
        {categoryName && (
          <p
            className="cg-title-sub text-white/60 uppercase tracking-[0.3em] mb-6"
            style={{ fontSize: 32, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.3em' }}
          >
            {categoryName}
          </p>
        )}

        <h1
          className="cg-title-main text-white leading-tight"
          style={{
            fontSize: 96,
            fontFamily: "'Noto Serif JP', serif",
            fontWeight: 700,
            textShadow: '0 4px 40px rgba(251,191,36,0.3)',
          }}
        >
          {eventName}
        </h1>

        {eventSubtitle && (
          <p
            className="cg-title-sub mt-6 text-white/70"
            style={{ fontSize: 36, fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 300 }}
          >
            {eventSubtitle}
          </p>
        )}

        {/* Trophy icon decoration */}
        <div
          className="cg-title-sub mx-auto mt-10 opacity-30"
          style={{ width: 2, height: 80, background: 'linear-gradient(to bottom, #fbbf24, transparent)' }}
        />
      </div>
    </div>
  );
}
