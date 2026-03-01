import { calculateProfileData } from "../utils/geometry";

export default function FlashingPreview({ folds }) {
  const { points, directions } = calculateProfileData(folds);

  const PAD = 20;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - PAD;
  const maxX = Math.max(...xs) + PAD;
  const minY = Math.min(...ys) - PAD;
  const maxY = Math.max(...ys) + PAD;
  const width = maxX - minX;
  const height = maxY - minY;

  const toSvg = (p) => ({
    x: p.x - minX,
    y: maxY - p.y, // Flip y-axis.
  });

  const svgPoints = points
    .map((p) => {
      const s = toSvg(p);
      return `${s.x},${s.y}`;
    })
    .join(" ");

  const centroid = {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };

  const segments = points.slice(1).map((point, i) => {
    const prev = points[i];
    const dx = point.x - prev.x;
    const dy = point.y - prev.y;
    const length = Math.round(Math.hypot(dx, dy));
    const midX = (prev.x + point.x) / 2;
    const midY = (prev.y + point.y) / 2;
    const dir = directions[i];
    return { length, midX, midY, dir, dx, dy };
  });

  const angleArcs = folds
    .map((_, i) => {
      if (i === folds.length - 1) {
        return null;
      }

      const startDeg = directions[i];
      const endDeg = directions[i + 1];
      const vertex = points[i + 1];

      const diff = ((endDeg - startDeg + 540) % 360) - 180;
      const signedRad = (diff * Math.PI) / 180;
      const turnAngle = Math.min(Math.abs(diff), 360 - Math.abs(diff));
      const bendAngle = 180 - turnAngle;

      const interiorSign = diff > 0 ? 1 : -1;
      const sweepFlag = interiorSign > 0 ? 1 : 0;
      const largeArcFlag = turnAngle > 180 ? 1 : 0;

      const s = toSvg(vertex);
      const startRad = (startDeg * Math.PI) / 180;
      const endRad = (endDeg * Math.PI) / 180;
      const len1 = segments[i]?.length || 0;
      const len2 = segments[i + 1]?.length || len1;
      const rLimit = Math.min(len1, len2) / 2;
      const rAngle = 15 * (turnAngle / 180);
      const r = Math.min(15, rLimit, rAngle);

      const sx = s.x + r * Math.cos(startRad + interiorSign * (Math.PI / 2));
      const sy = s.y - r * Math.sin(startRad + interiorSign * (Math.PI / 2));
      const ex = s.x + r * Math.cos(endRad + interiorSign * (Math.PI / 2));
      const ey = s.y - r * Math.sin(endRad + interiorSign * (Math.PI / 2));

      const midDir = startRad + signedRad / 2;
      const midAngle = midDir + interiorSign * (Math.PI / 2);
      const lx = s.x + (r + 10) * Math.cos(midAngle);
      const ly = s.y - (r + 10) * Math.sin(midAngle);

      return {
        path: `M ${sx} ${sy} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${ex} ${ey}`,
        label: bendAngle.toFixed(0),
        lx,
        ly,
        key: i,
      };
    })
    .filter(Boolean);

  return (
    <svg
      width="600"
      height="450"
      viewBox={`0 0 ${width} ${height}`}
      style={{ border: "1px solid black" }}
    >
      <polyline points={svgPoints} fill="none" stroke="blue" strokeWidth="2" />

      {segments.map((seg, idx) => {
        const s = toSvg({ x: seg.midX, y: seg.midY });
        const outwardVector = {
          x: seg.midX - centroid.x,
          y: seg.midY - centroid.y,
        };
        let nx = -seg.dy;
        let ny = seg.dx;
        if (nx * outwardVector.x + ny * outwardVector.y < 0) {
          nx = -nx;
          ny = -ny;
        }

        const norm = Math.hypot(nx, ny) || 1;
        const scale = 1.25;
        const offset = 12 * scale;
        const ox = (nx / norm) * offset;
        const oy = (ny / norm) * offset;

        return (
          <text key={`len-${idx}`} x={s.x + ox} y={s.y + oy} fontSize={12 * scale} textAnchor="middle">
            {seg.length}
          </text>
        );
      })}

      {angleArcs.map((arc) => (
        <g key={`arc-g-${arc.key}`}>
          <path d={arc.path} fill="none" stroke="red" strokeWidth="1" />
          <text x={arc.lx} y={arc.ly} fontSize={12} textAnchor="middle" fill="red">
            {arc.label}°
          </text>
        </g>
      ))}
    </svg>
  );
}
