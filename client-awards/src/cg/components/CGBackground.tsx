interface Props {
  transparent?: boolean;
}

export default function CGBackground({ transparent }: Props) {
  if (transparent) return null;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, #1a1409 0%, #0a0705 55%, #000 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 300,
          background:
            'linear-gradient(180deg, transparent 0%, rgba(245,215,110,0.08) 60%, rgba(245,215,110,0.14) 100%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(rgba(245,215,110,0.18) 1px, transparent 1.2px)',
          backgroundSize: '42px 42px',
          opacity: 0.2,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
