export default function StepTitle() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        textAlign: 'center',
        paddingBottom: 220,
      }}
    >
      <FrameCorners />
    </div>
  );
}

function FrameCorners() {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 120,
    height: 120,
    pointerEvents: 'none',
  };
  return (
    <>
      <div
        className="cg-corner-tl"
        style={{ ...base, top: 70, left: 70, borderTop: '2px solid #F5D76E', borderLeft: '2px solid #F5D76E' }}
      />
      <div
        className="cg-corner-tr"
        style={{ ...base, top: 70, right: 70, borderTop: '2px solid #F5D76E', borderRight: '2px solid #F5D76E' }}
      />
      <div
        className="cg-corner-bl"
        style={{ ...base, bottom: 90, left: 70, borderBottom: '2px solid #F5D76E', borderLeft: '2px solid #F5D76E' }}
      />
      <div
        className="cg-corner-br"
        style={{ ...base, bottom: 90, right: 70, borderBottom: '2px solid #F5D76E', borderRight: '2px solid #F5D76E' }}
      />
    </>
  );
}
