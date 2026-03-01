export function calculateProfileData(folds) {
  const points = [{ x: 0, y: 0 }];
  const directions = []; // absolute orientation of each segment (degrees)

  // each fold entry now describes a segment with a given direction
  // (zero degrees is along +x, increasing CCW).
  folds.forEach((fold) => {
    const dir = fold.angle;
    directions.push(dir);
    const radians = (dir * Math.PI) / 180;
    const lastPoint = points[points.length - 1];
    const newX = lastPoint.x + fold.length * Math.cos(radians);
    const newY = lastPoint.y + fold.length * Math.sin(radians);
    points.push({ x: newX, y: newY });
  });

  return { points, directions };
}

export function calculateProfile(folds) {
  // retained for existing callers
  return calculateProfileData(folds).points;
}

export function calculateGirth(folds) {
  return folds.reduce((total, fold) => total + Number(fold.length), 0);
}