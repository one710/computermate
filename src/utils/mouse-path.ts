/**
 * Represents a point in 2D space.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Options for generating a mouse path.
 */
export interface PathOptions {
  /** Override the spread of anchor points. */
  spreadOverride?: number;
  /** Speed of movement. Lower is slower. Default is random between 0.5 and 0.8. */
  moveSpeed?: number;
}

/**
 * Generates a human-like mouse path between two points using cubic Bezier curves.
 *
 * This replicates the core logic of ghost-cursor's path generation without
 * requiring the ghost-cursor or bezier-js dependencies.
 */
export function generatePath(
  start: Point,
  end: Point,
  options: PathOptions = {},
): Point[] {
  const MIN_SPREAD = 2;
  const MAX_SPREAD = 200;
  const MIN_STEPS = 25;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Spread determines how "curvy" the path is
  const spread =
    options.spreadOverride ??
    Math.max(MIN_SPREAD, Math.min(MAX_SPREAD, distance));

  // Generate two random anchor points for the cubic Bezier curve
  const anchors = generateAnchors(start, end, spread);

  // Fitts's Law approximation for movement time (determines number of steps)
  // Distance / width + 1. Since we don't always have a target width, we use a default.
  const targetWidth = 100;
  const fitts = Math.log2(distance / targetWidth + 1);

  const speed = options.moveSpeed ?? Math.random() * 0.3 + 0.5;
  const steps = Math.ceil((fitts + speed * MIN_STEPS) * 3);

  // Generate steps along the Bezier curve
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(getBezierPoint(t, start, anchors[0], anchors[1], end));
  }

  return points;
}

/**
 * Generates two random anchor points for a cubic Bezier curve.
 */
function generateAnchors(
  start: Point,
  end: Point,
  spread: number,
): [Point, Point] {
  const side = Math.random() > 0.5 ? 1 : -1;
  const p1 = getRandomAnchor(start, end, spread, side);
  const p2 = getRandomAnchor(start, end, spread, side);

  // Sort by x to avoid weird loops (simplified version of ghost-cursor's anchor sorting)
  return [p1, p2].sort((a, b) => a.x - b.x) as [Point, Point];
}

/**
 * Generates a random anchor point offset from the line between start and end.
 */
function getRandomAnchor(
  start: Point,
  end: Point,
  spread: number,
  side: number,
): Point {
  const t = Math.random();
  // Random point on the line
  const onLine = {
    x: start.x + t * (end.x - start.x),
    y: start.y + t * (end.y - start.y),
  };

  // Perpendicular vector
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const mag = Math.sqrt(dx * dx + dy * dy);

  if (mag === 0) return onLine;

  const perp = { x: dy / mag, y: -dx / mag };
  const offset = Math.random() * spread * side;

  return {
    x: onLine.x + perp.x * offset,
    y: onLine.y + perp.y * offset,
  };
}

/**
 * Calculates a point on a cubic Bezier curve at parameter t (0 to 1).
 */
function getBezierPoint(
  t: number,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
): Point {
  const c = 1 - t;
  const c2 = c * c;
  const c3 = c2 * c;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: c3 * p0.x + 3 * c2 * t * p1.x + 3 * c * t2 * p2.x + t3 * p3.x,
    y: c3 * p0.y + 3 * c2 * t * p1.y + 3 * c * t2 * p2.y + t3 * p3.y,
  };
}
