// Geometry cleanup for draw strokes: validate, fit to frame, and simplify.
// Find the raw bounding box of a stroke set.
function getBounds(strokes) {
  if (!Array.isArray(strokes) || !strokes.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    for (const point of stroke) {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

//Scale and center strokes into the unit square while preserving aspect ratio.
function fitToUnit(strokes, padding = 0.08) {
  const bounds = getBounds(strokes);
  if (!bounds) return [];

  const pad = Math.max(0, Math.min(0.45, Number(padding) || 0));
  const width = Math.max(1e-9, bounds.maxX - bounds.minX);
  const height = Math.max(1e-9, bounds.maxY - bounds.minY);
  //Preserve aspect ratio and center the result inside the padded unit square.
  const scale = Math.min((1 - 2 * pad) / width, (1 - 2 * pad) / height);
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const xOffset = pad + (1 - 2 * pad - scaledWidth) * 0.5;
  const yOffset = pad + (1 - 2 * pad - scaledHeight) * 0.5;

  return strokes.map((stroke) =>
    stroke.map((point) => ({
      x: xOffset + (point.x - bounds.minX) * scale,
      y: yOffset + (point.y - bounds.minY) * scale,
    })),
  );
}

//Euclidean distance between two 2D points.
function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

//Distance from a point to the line segment between start and end.
function pointLineDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
    return distance(point, start);
  }

  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const proj = {
    x: start.x + clamped * dx,
    y: start.y + clamped * dy,
  };
  return distance(point, proj);
}

//Ramer-Douglas-Peucker simplification for one polyline.
function rdp(points, epsilon) {
  if (!Array.isArray(points) || points.length <= 2) return points || [];

  let index = -1;
  let dmax = -1;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i += 1) {
    const d = pointLineDistance(points[i], start, end);
    if (d > dmax) {
      dmax = d;
      index = i;
    }
  }

  if (dmax <= epsilon || index < 0) {
    return [start, end];
  }

  const left = rdp(points.slice(0, index + 1), epsilon);
  const right = rdp(points.slice(index), epsilon);
  return left.slice(0, -1).concat(right);
}

//Simplify a stroke and remove tiny leftover steps.
function simplifyStroke(points, epsilon = 0.002, minStep = 1e-4) {
  if (!Array.isArray(points) || points.length <= 2) return points || [];

  //RDP removes redundant points, then minStep strips tiny jitter that still remains.
  const reduced = rdp(points, Math.max(0, Number(epsilon) || 0));
  const filtered = [reduced[0]];

  for (let i = 1; i < reduced.length; i += 1) {
    if (distance(reduced[i], filtered[filtered.length - 1]) >= minStep) {
      filtered.push(reduced[i]);
    }
  }

  if (filtered.length === 1) {
    filtered.push(reduced[reduced.length - 1]);
  }

  return filtered;
}

//Drop malformed points and keep only valid stroke arrays.
function normalizeIncomingStrokes(strokes) {
  if (!Array.isArray(strokes)) return [];

  return strokes
    .map((stroke) => {
      if (!Array.isArray(stroke)) return [];
      return stroke
        .map((point) => {
          if (!point || typeof point !== "object") return null;
          const x = Number(point.x);
          const y = Number(point.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return { x, y };
        })
        .filter(Boolean);
    })
    .filter((stroke) => stroke.length > 1);
}

//Main planner entry used by draw preview and draw execute.
function planDrawingFromInput(input = {}) {
  const warnings = [];
  const padding = Number(input.padding ?? 0.08);
  const epsilon = Number(input.simplifyEpsilon ?? 0.0018);
  const minStep = Number(input.minStep ?? 0.0008);

  let strokes = normalizeIncomingStrokes(input.strokes);
  const rawBounds = getBounds(strokes);

  if (!rawBounds) {
    return {
      ok: false,
      source: "strokes",
      warnings,
      strokeCount: 0,
      pointCount: 0,
      strokesNormalized: [],
      bounds: null,
    };
  }

  if (rawBounds.minX < 0 || rawBounds.minY < 0 || rawBounds.maxX > 1 || rawBounds.maxY > 1) {
    warnings.push("Input strokes were outside normalized bounds and were re-scaled into the whiteboard frame.");
  }

  strokes = fitToUnit(strokes, padding)
    .map((stroke) => simplifyStroke(stroke, epsilon, minStep))
    .filter((stroke) => stroke.length > 1);

  const pointCount = strokes.reduce((total, stroke) => total + stroke.length, 0);
  return {
    ok: strokes.length > 0,
    source: "strokes",
    warnings,
    strokeCount: strokes.length,
    pointCount,
    strokesNormalized: strokes,
    bounds: getBounds(strokes),
  };
}

module.exports = {
  planDrawingFromInput,
};
