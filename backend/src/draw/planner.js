function parseLength(value, fallback = 0) {
  if (value == null) return fallback;
  const m = String(value).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/i);
  if (!m) return fallback;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : fallback;
}

function parseAttrs(attrText) {
  const out = {};
  if (!attrText) return out;
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(attrText)) !== null) {
    out[m[1]] = m[3] ?? m[4] ?? "";
  }
  return out;
}

function parseSvgViewBox(svg) {
  const svgTag = svg.match(/<svg\b([^>]*)>/i);
  if (!svgTag) return { minX: 0, minY: 0, width: 100, height: 100 };
  const attrs = parseAttrs(svgTag[1]);
  if (attrs.viewBox) {
    const nums = String(attrs.viewBox)
      .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
      ?.map(Number) || [];
    if (nums.length >= 4) {
      return {
        minX: nums[0],
        minY: nums[1],
        width: Math.max(1e-9, nums[2]),
        height: Math.max(1e-9, nums[3]),
      };
    }
  }
  const width = parseLength(attrs.width, 100);
  const height = parseLength(attrs.height, 100);
  return {
    minX: 0,
    minY: 0,
    width: Math.max(1e-9, width),
    height: Math.max(1e-9, height),
  };
}

function toPairs(nums) {
  const out = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.push({ x: nums[i], y: nums[i + 1] });
  }
  return out;
}

function parsePointsAttr(pointsText) {
  if (!pointsText) return [];
  const nums = String(pointsText)
    .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
    ?.map(Number) || [];
  return toPairs(nums);
}

function applyMatrixToPoint(p, m) {
  const [a, b, c, d, e, f] = m;
  return {
    x: a * p.x + c * p.y + e,
    y: b * p.x + d * p.y + f,
  };
}

function multiplyMatrices(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function parseTransformMatrix(transformText) {
  const id = [1, 0, 0, 1, 0, 0];
  if (!transformText) return id;

  const fnRe = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let m = id;
  let match;
  while ((match = fnRe.exec(String(transformText))) !== null) {
    const name = match[1];
    const nums = String(match[2])
      .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
      ?.map(Number) || [];
    let t = id;

    if (name === "matrix" && nums.length >= 6) {
      t = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]];
    } else if (name === "translate" && nums.length >= 1) {
      t = [1, 0, 0, 1, nums[0], nums[1] || 0];
    } else if (name === "scale" && nums.length >= 1) {
      const sx = nums[0];
      const sy = nums.length >= 2 ? nums[1] : sx;
      t = [sx, 0, 0, sy, 0, 0];
    } else if (name === "rotate" && nums.length >= 1) {
      const a = (nums[0] * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const r = [c, s, -s, c, 0, 0];
      if (nums.length >= 3) {
        const cx = nums[1];
        const cy = nums[2];
        const toOrigin = [1, 0, 0, 1, -cx, -cy];
        const back = [1, 0, 0, 1, cx, cy];
        t = multiplyMatrices(back, multiplyMatrices(r, toOrigin));
      } else {
        t = r;
      }
    } else if (name === "skewX" && nums.length >= 1) {
      t = [1, 0, Math.tan((nums[0] * Math.PI) / 180), 1, 0, 0];
    } else if (name === "skewY" && nums.length >= 1) {
      t = [1, Math.tan((nums[0] * Math.PI) / 180), 0, 1, 0, 0];
    }

    m = multiplyMatrices(m, t);
  }

  return m;
}

function transformStroke(stroke, matrix) {
  return stroke.map((p) => applyMatrixToPoint(p, matrix));
}

function parseStyleMap(styleText) {
  const out = {};
  if (!styleText) return out;
  const parts = String(styleText).split(";");
  for (const part of parts) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim().toLowerCase();
    const v = part.slice(idx + 1).trim().toLowerCase();
    if (k) out[k] = v;
  }
  return out;
}

function isElementHidden(attrs = {}) {
  const style = parseStyleMap(attrs.style || "");
  const display = String(attrs.display ?? style.display ?? "").trim().toLowerCase();
  const visibility = String(attrs.visibility ?? style.visibility ?? "").trim().toLowerCase();
  const opacity = parseLength(attrs.opacity ?? style.opacity, 1);
  if (display === "none") return true;
  if (visibility === "hidden") return true;
  if (Number.isFinite(opacity) && opacity <= 0) return true;
  return false;
}

function shouldSkipSubtree(tagName) {
  return [
    "defs",
    "clippath",
    "mask",
    "pattern",
    "symbol",
    "metadata",
    "title",
    "desc",
    "style",
    "script",
  ].includes(tagName);
}

function normalizeTagName(name) {
  return String(name || "").split(":").pop().toLowerCase();
}

function parseSvgTree(svg) {
  const tagRe = /<[^>]+>/g;
  const root = { name: "#root", attrs: {}, children: [] };
  const stack = [root];

  let m;
  while ((m = tagRe.exec(String(svg || ""))) !== null) {
    const token = m[0];
    if (/^<\s*!--/.test(token) || /^<\s*\?/.test(token) || /^<\s*!DOCTYPE/i.test(token)) {
      continue;
    }

    const endMatch = token.match(/^<\s*\/\s*([^\s>]+)[^>]*>/);
    if (endMatch) {
      const endName = normalizeTagName(endMatch[1]);
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (normalizeTagName(stack[i].name) === endName) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const startMatch = token.match(/^<\s*([^\s/>]+)([\s\S]*?)\/?\s*>$/);
    if (!startMatch) continue;

    const name = normalizeTagName(startMatch[1]);
    const attrs = parseAttrs(startMatch[2] || "");
    const isSelfClosing = /\/\s*>$/.test(token);

    const node = {
      name,
      attrs,
      children: [],
    };
    stack[stack.length - 1].children.push(node);

    if (!isSelfClosing) {
      stack.push(node);
    }
  }

  return root;
}

function buildSvgIdIndex(root) {
  const map = new Map();
  const visit = (node) => {
    if (!node || !node.attrs) return;
    const id = node.attrs.id ? String(node.attrs.id).trim() : "";
    if (id && !map.has(id)) map.set(id, node);
    if (Array.isArray(node.children)) {
      for (const ch of node.children) visit(ch);
    }
  };
  visit(root);
  return map;
}

function parseUseHrefId(attrs = {}) {
  const raw = String(attrs.href || attrs["xlink:href"] || "").trim();
  if (!raw) return null;
  if (raw.startsWith("#")) return raw.slice(1);
  const m = raw.match(/#([A-Za-z_][-A-Za-z0-9_:.]*)$/);
  return m ? m[1] : null;
}

function vectorAngle(ux, uy, vx, vy) {
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}

function arcPoints(x1, y1, rxIn, ryIn, xAxisRotDeg, largeArc, sweep, x2, y2) {
  let rx = Math.abs(Number(rxIn));
  let ry = Math.abs(Number(ryIn));
  if (rx < 1e-9 || ry < 1e-9) return [{ x: x2, y: y2 }];

  const phi = (Number(xAxisRotDeg || 0) * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;

  const lambda = x1p2 / rx2 + y1p2 / ry2;
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const rx2b = rx * rx;
  const ry2b = ry * ry;
  const num = rx2b * ry2b - rx2b * y1p2 - ry2b * x1p2;
  const den = rx2b * y1p2 + ry2b * x1p2;
  const sign = largeArc === sweep ? -1 : 1;
  const coef = sign * Math.sqrt(Math.max(0, num / Math.max(1e-12, den)));

  const cxp = (coef * rx * y1p) / ry;
  const cyp = (coef * -ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  const theta1 = vectorAngle(1, 0, ux, uy);
  let deltaTheta = vectorAngle(ux, uy, vx, vy);
  if (!sweep && deltaTheta > 0) deltaTheta -= 2 * Math.PI;
  if (sweep && deltaTheta < 0) deltaTheta += 2 * Math.PI;

  const segs = Math.max(8, Math.min(160, Math.ceil(Math.abs(deltaTheta) / (Math.PI / 12))));
  const pts = [];
  for (let i = 1; i <= segs; i += 1) {
    const t = theta1 + (deltaTheta * i) / segs;
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    pts.push({
      x: cx + rx * cosPhi * cosT - ry * sinPhi * sinT,
      y: cy + rx * sinPhi * cosT + ry * cosPhi * sinT,
    });
  }
  return pts;
}

function sampleQuadratic(p0, p1, p2) {
  const approx = distance(p0, p1) + distance(p1, p2);
  const segs = Math.max(6, Math.min(120, Math.ceil(approx / 10)));
  const pts = [];
  for (let i = 1; i <= segs; i += 1) {
    const t = i / segs;
    const mt = 1 - t;
    pts.push({
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    });
  }
  return pts;
}

function sampleCubic(p0, p1, p2, p3) {
  const approx = distance(p0, p1) + distance(p1, p2) + distance(p2, p3);
  const segs = Math.max(8, Math.min(160, Math.ceil(approx / 10)));
  const pts = [];
  for (let i = 1; i <= segs; i += 1) {
    const t = i / segs;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    pts.push({
      x:
        mt2 * mt * p0.x +
        3 * mt2 * t * p1.x +
        3 * mt * t2 * p2.x +
        t2 * t * p3.x,
      y:
        mt2 * mt * p0.y +
        3 * mt2 * t * p1.y +
        3 * mt * t2 * p2.y +
        t2 * t * p3.y,
    });
  }
  return pts;
}

function parsePathData(d) {
  const warnings = [];
  const tokens = String(d || "")
    .match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g) || [];
  const isNum = (t) => t != null && /^[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?$/i.test(t);

  const strokes = [];
  let stroke = [];
  let cmd = null;
  let prevCmd = null;
  let i = 0;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let prevCubicCtrl = null;
  let prevQuadCtrl = null;

  const pushStroke = () => {
    if (stroke.length > 1) strokes.push(stroke);
    stroke = [];
  };

  const ensureMoveStart = () => {
    if (stroke.length === 0) stroke.push({ x, y });
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[AaCcHhLlMmQqSsTtVvZz]$/.test(t)) {
      cmd = t;
      i += 1;
      if (cmd === "Z" || cmd === "z") {
        if (stroke.length > 0) {
          stroke.push({ x: sx, y: sy });
          pushStroke();
        }
        x = sx;
        y = sy;
        prevCubicCtrl = null;
        prevQuadCtrl = null;
      }
      prevCmd = cmd;
      continue;
    }
    if (!cmd) {
      i += 1;
      continue;
    }

    if (cmd === "M" || cmd === "m") {
      if (!(isNum(tokens[i]) && isNum(tokens[i + 1]))) {
        i += 1;
        continue;
      }
      const nx = Number(tokens[i]);
      const ny = Number(tokens[i + 1]);
      i += 2;
      x = cmd === "m" ? x + nx : nx;
      y = cmd === "m" ? y + ny : ny;
      pushStroke();
      stroke.push({ x, y });
      sx = x;
      sy = y;
      cmd = cmd === "m" ? "l" : "L";
      prevCubicCtrl = null;
      prevQuadCtrl = null;
      prevCmd = cmd;
      continue;
    }

    if (cmd === "L" || cmd === "l") {
      while (isNum(tokens[i]) && isNum(tokens[i + 1])) {
        const nx = Number(tokens[i]);
        const ny = Number(tokens[i + 1]);
        i += 2;
        x = cmd === "l" ? x + nx : nx;
        y = cmd === "l" ? y + ny : ny;
        ensureMoveStart();
        stroke.push({ x, y });
      }
      prevCubicCtrl = null;
      prevQuadCtrl = null;
      prevCmd = cmd;
      continue;
    }

    if (cmd === "H" || cmd === "h") {
      while (isNum(tokens[i])) {
        const nx = Number(tokens[i]);
        i += 1;
        x = cmd === "h" ? x + nx : nx;
        ensureMoveStart();
        stroke.push({ x, y });
      }
      prevCubicCtrl = null;
      prevQuadCtrl = null;
      prevCmd = cmd;
      continue;
    }

    if (cmd === "V" || cmd === "v") {
      while (isNum(tokens[i])) {
        const ny = Number(tokens[i]);
        i += 1;
        y = cmd === "v" ? y + ny : ny;
        ensureMoveStart();
        stroke.push({ x, y });
      }
      prevCubicCtrl = null;
      prevQuadCtrl = null;
      prevCmd = cmd;
      continue;
    }

    if (cmd === "C" || cmd === "c") {
      while (
        isNum(tokens[i]) && isNum(tokens[i + 1]) &&
        isNum(tokens[i + 2]) && isNum(tokens[i + 3]) &&
        isNum(tokens[i + 4]) && isNum(tokens[i + 5])
      ) {
        const x1 = Number(tokens[i]);
        const y1 = Number(tokens[i + 1]);
        const x2 = Number(tokens[i + 2]);
        const y2 = Number(tokens[i + 3]);
        const x3 = Number(tokens[i + 4]);
        const y3 = Number(tokens[i + 5]);
        i += 6;
        const c1 = { x: cmd === "c" ? x + x1 : x1, y: cmd === "c" ? y + y1 : y1 };
        const c2 = { x: cmd === "c" ? x + x2 : x2, y: cmd === "c" ? y + y2 : y2 };
        const p3 = { x: cmd === "c" ? x + x3 : x3, y: cmd === "c" ? y + y3 : y3 };
        ensureMoveStart();
        stroke.push(...sampleCubic({ x, y }, c1, c2, p3));
        x = p3.x;
        y = p3.y;
        prevCubicCtrl = c2;
        prevQuadCtrl = null;
      }
      prevCmd = cmd;
      continue;
    }

    if (cmd === "S" || cmd === "s") {
      while (
        isNum(tokens[i]) && isNum(tokens[i + 1]) &&
        isNum(tokens[i + 2]) && isNum(tokens[i + 3])
      ) {
        const x2 = Number(tokens[i]);
        const y2 = Number(tokens[i + 1]);
        const x3 = Number(tokens[i + 2]);
        const y3 = Number(tokens[i + 3]);
        i += 4;

        let c1 = { x, y };
        if (prevCmd && /[CcSs]/.test(prevCmd) && prevCubicCtrl) {
          c1 = { x: 2 * x - prevCubicCtrl.x, y: 2 * y - prevCubicCtrl.y };
        }
        const c2 = { x: cmd === "s" ? x + x2 : x2, y: cmd === "s" ? y + y2 : y2 };
        const p3 = { x: cmd === "s" ? x + x3 : x3, y: cmd === "s" ? y + y3 : y3 };
        ensureMoveStart();
        stroke.push(...sampleCubic({ x, y }, c1, c2, p3));
        x = p3.x;
        y = p3.y;
        prevCubicCtrl = c2;
        prevQuadCtrl = null;
      }
      prevCmd = cmd;
      continue;
    }

    if (cmd === "Q" || cmd === "q") {
      while (
        isNum(tokens[i]) && isNum(tokens[i + 1]) &&
        isNum(tokens[i + 2]) && isNum(tokens[i + 3])
      ) {
        const x1 = Number(tokens[i]);
        const y1 = Number(tokens[i + 1]);
        const x2 = Number(tokens[i + 2]);
        const y2 = Number(tokens[i + 3]);
        i += 4;
        const c1 = { x: cmd === "q" ? x + x1 : x1, y: cmd === "q" ? y + y1 : y1 };
        const p2 = { x: cmd === "q" ? x + x2 : x2, y: cmd === "q" ? y + y2 : y2 };
        ensureMoveStart();
        stroke.push(...sampleQuadratic({ x, y }, c1, p2));
        x = p2.x;
        y = p2.y;
        prevQuadCtrl = c1;
        prevCubicCtrl = null;
      }
      prevCmd = cmd;
      continue;
    }

    if (cmd === "T" || cmd === "t") {
      while (isNum(tokens[i]) && isNum(tokens[i + 1])) {
        const x2 = Number(tokens[i]);
        const y2 = Number(tokens[i + 1]);
        i += 2;
        let c1 = { x, y };
        if (prevCmd && /[QqTt]/.test(prevCmd) && prevQuadCtrl) {
          c1 = { x: 2 * x - prevQuadCtrl.x, y: 2 * y - prevQuadCtrl.y };
        }
        const p2 = { x: cmd === "t" ? x + x2 : x2, y: cmd === "t" ? y + y2 : y2 };
        ensureMoveStart();
        stroke.push(...sampleQuadratic({ x, y }, c1, p2));
        x = p2.x;
        y = p2.y;
        prevQuadCtrl = c1;
        prevCubicCtrl = null;
      }
      prevCmd = cmd;
      continue;
    }

    if (cmd === "A" || cmd === "a") {
      while (
        isNum(tokens[i]) && isNum(tokens[i + 1]) &&
        isNum(tokens[i + 2]) && isNum(tokens[i + 3]) &&
        isNum(tokens[i + 4]) && isNum(tokens[i + 5]) &&
        isNum(tokens[i + 6])
      ) {
        const rx = Number(tokens[i]);
        const ry = Number(tokens[i + 1]);
        const rot = Number(tokens[i + 2]);
        const large = Number(tokens[i + 3]) ? 1 : 0;
        const sweep = Number(tokens[i + 4]) ? 1 : 0;
        const nx = Number(tokens[i + 5]);
        const ny = Number(tokens[i + 6]);
        i += 7;
        const p2 = { x: cmd === "a" ? x + nx : nx, y: cmd === "a" ? y + ny : ny };
        ensureMoveStart();
        stroke.push(...arcPoints(x, y, rx, ry, rot, large, sweep, p2.x, p2.y));
        x = p2.x;
        y = p2.y;
        prevCubicCtrl = null;
        prevQuadCtrl = null;
      }
      prevCmd = cmd;
      continue;
    }

    warnings.push(`Could not parse path command "${cmd}" near token index ${i}.`);
    i += 1;
  }

  pushStroke();
  return { strokes, warnings };
}

function normalizeByViewBox(strokes, vb) {
  return strokes.map((stroke) =>
    stroke.map((p) => ({
      x: (p.x - vb.minX) / vb.width,
      y: (p.y - vb.minY) / vb.height,
    })),
  );
}

function getBounds(strokes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function fitToUnit(strokes, padding = 0.08) {
  const bounds = getBounds(strokes);
  if (!bounds) return [];

  const availW = Math.max(1e-9, 1 - 2 * padding);
  const availH = Math.max(1e-9, 1 - 2 * padding);
  const w = Math.max(1e-9, bounds.width);
  const h = Math.max(1e-9, bounds.height);
  const scale = Math.min(availW / w, availH / h);
  const drawW = w * scale;
  const drawH = h * scale;
  const tx = padding + (availW - drawW) * 0.5 - bounds.minX * scale;
  const ty = padding + (availH - drawH) * 0.5 - bounds.minY * scale;

  return strokes.map((stroke) =>
    stroke.map((p) => ({
      x: Math.max(0, Math.min(1, p.x * scale + tx)),
      y: Math.max(0, Math.min(1, p.y * scale + ty)),
    })),
  );
}

function distance(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pointLineDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return distance(p, a);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const px = a.x + clamped * dx;
  const py = a.y + clamped * dy;
  return distance(p, { x: px, y: py });
}

function rdp(points, epsilon) {
  if (points.length <= 2) return points.slice();
  let maxDist = 0;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = pointLineDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      idx = i;
    }
  }
  if (maxDist <= epsilon) {
    return [points[0], points[points.length - 1]];
  }
  const left = rdp(points.slice(0, idx + 1), epsilon);
  const right = rdp(points.slice(idx), epsilon);
  return left.slice(0, -1).concat(right);
}

function simplifyStroke(points, epsilon = 0.002, minStep = 1e-4) {
  const reduced = rdp(points, epsilon);
  const out = [];
  for (const p of reduced) {
    if (out.length === 0 || distance(out[out.length - 1], p) >= minStep) {
      out.push(p);
    }
  }
  return out.length > 1 ? out : [];
}

function normalizeIncomingStrokes(strokes) {
  if (!Array.isArray(strokes)) return [];
  const out = [];
  for (const stroke of strokes) {
    if (!Array.isArray(stroke)) continue;
    const pts = [];
    for (const p of stroke) {
      if (Array.isArray(p) && p.length >= 2) {
        pts.push({ x: Number(p[0]), y: Number(p[1]) });
      } else if (p && typeof p === "object") {
        pts.push({ x: Number(p.x), y: Number(p.y) });
      }
    }
    if (pts.length > 1 && pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
      out.push(pts);
    }
  }
  return out;
}

function circleStroke(cx, cy, r, segments = 24) {
  const pts = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = (2 * Math.PI * i) / segments;
    pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
  }
  return pts;
}

function ellipseStroke(cx, cy, rx, ry, segments = 56) {
  const pts = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = (2 * Math.PI * i) / segments;
    pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return pts;
}

function textToStrokes(text) {
  const t = String(text || "").toUpperCase();
  const strokes = [];
  let cursor = 0;
  const w = 1;
  const s = 0.35;

  for (const ch of t) {
    if (ch === " ") {
      cursor += 0.7;
      continue;
    }

    const x0 = cursor + 0.1;
    const x1 = cursor + 0.9;
    const y0 = 0.1;
    const y1 = 0.9;
    const xm = (x0 + x1) * 0.5;
    const ym = (y0 + y1) * 0.5;

    if (ch === "X") {
      strokes.push([{ x: x0, y: y0 }, { x: x1, y: y1 }]);
      strokes.push([{ x: x0, y: y1 }, { x: x1, y: y0 }]);
    } else if (ch === "O" || ch === "0") {
      strokes.push(circleStroke(xm, ym, 0.38, 24));
    } else {
      strokes.push([
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
        { x: x0, y: y0 },
      ]);
    }

    cursor += w + s;
  }

  return fitToUnit(strokes, 0.08);
}

function svgToStrokes(svg) {
  const vb = parseSvgViewBox(svg);
  const warnings = [];
  const strokes = [];
  const tree = parseSvgTree(svg);
  const idIndex = buildSvgIdIndex(tree);
  const addStroke = (stroke, matrix) => {
    if (!Array.isArray(stroke) || stroke.length < 2) return;
    strokes.push(transformStroke(stroke, matrix));
  };

  const renderNode = (node, parentMatrix = [1, 0, 0, 1, 0, 0], opts = {}) => {
    if (!node || !node.name) return;
    const fromUse = !!opts.fromUse;
    const useDepth = Number(opts.useDepth || 0);
    if (useDepth > 24) {
      warnings.push("Exceeded <use> expansion depth limit.");
      return;
    }

    const name = normalizeTagName(node.name);
    const attrs = node.attrs || {};
    const localMatrix = parseTransformMatrix(attrs.transform || "");
    const baseMatrix = multiplyMatrices(parentMatrix, localMatrix);
    const hidden = isElementHidden(attrs);
    const skipSubtree = !fromUse && shouldSkipSubtree(name);
    if (hidden || skipSubtree) return;

    if (name === "line") {
      const x1 = parseLength(attrs.x1);
      const y1 = parseLength(attrs.y1);
      const x2 = parseLength(attrs.x2);
      const y2 = parseLength(attrs.y2);
      addStroke([{ x: x1, y: y1 }, { x: x2, y: y2 }], baseMatrix);
    } else if (name === "polyline") {
      const pts = parsePointsAttr(attrs.points);
      if (pts.length > 1) addStroke(pts, baseMatrix);
    } else if (name === "polygon") {
      const pts = parsePointsAttr(attrs.points);
      if (pts.length > 2) addStroke(pts.concat([{ ...pts[0] }]), baseMatrix);
    } else if (name === "rect") {
      const x = parseLength(attrs.x);
      const y = parseLength(attrs.y);
      const w = parseLength(attrs.width);
      const h = parseLength(attrs.height);
      if (w > 0 && h > 0) {
        addStroke([
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
          { x, y },
        ], baseMatrix);
      }
    } else if (name === "circle") {
      const cx = parseLength(attrs.cx);
      const cy = parseLength(attrs.cy);
      const r = parseLength(attrs.r);
      if (r > 0) addStroke(circleStroke(cx, cy, r, 48), baseMatrix);
    } else if (name === "ellipse") {
      const cx = parseLength(attrs.cx);
      const cy = parseLength(attrs.cy);
      const rx = parseLength(attrs.rx);
      const ry = parseLength(attrs.ry);
      if (rx > 0 && ry > 0) addStroke(ellipseStroke(cx, cy, rx, ry, 56), baseMatrix);
    } else if (name === "path") {
      const parsed = parsePathData(attrs.d || "");
      for (const s of parsed.strokes) addStroke(s, baseMatrix);
      warnings.push(...parsed.warnings);
    } else if (name === "use") {
      const refId = parseUseHrefId(attrs);
      if (!refId) {
        warnings.push("<use> without href/xlink:href was ignored.");
      } else {
        const target = idIndex.get(refId);
        if (!target) {
          warnings.push(`<use> target "#${refId}" not found.`);
        } else if (opts.useChain && opts.useChain.has(refId)) {
          warnings.push(`<use> cycle detected for "#${refId}".`);
        } else {
          const tx = parseLength(attrs.x, 0);
          const ty = parseLength(attrs.y, 0);
          const useMatrix = multiplyMatrices(baseMatrix, [1, 0, 0, 1, tx, ty]);
          const useChain = new Set(opts.useChain || []);
          useChain.add(refId);
          renderNode(target, useMatrix, { fromUse: true, useDepth: useDepth + 1, useChain });
        }
      }
    }

    if (Array.isArray(node.children)) {
      for (const ch of node.children) {
        renderNode(ch, baseMatrix, { fromUse, useDepth, useChain: opts.useChain });
      }
    }
  };

  for (const node of tree.children || []) {
    renderNode(node, [1, 0, 0, 1, 0, 0], { fromUse: false, useDepth: 0, useChain: new Set() });
  }

  return {
    strokes: normalizeByViewBox(strokes, vb),
    warnings,
  };
}

function planDrawingFromInput(input = {}) {
  const warnings = [];
  let strokes = [];
  let source = "strokes";

  if (input.svg && String(input.svg).trim()) {
    source = "svg";
    const parsed = svgToStrokes(String(input.svg));
    strokes = parsed.strokes;
    warnings.push(...parsed.warnings);
  } else if (input.text && String(input.text).trim()) {
    source = "text";
    strokes = textToStrokes(String(input.text));
  } else if (Array.isArray(input.strokes)) {
    source = "strokes";
    strokes = normalizeIncomingStrokes(input.strokes);
    const rawBounds = getBounds(strokes);
    if (!rawBounds || rawBounds.minX < 0 || rawBounds.minY < 0 || rawBounds.maxX > 1 || rawBounds.maxY > 1) {
      strokes = fitToUnit(strokes, Number(input.padding ?? 0.08));
    }
  }

  const padding = Number(input.padding ?? 0.08);
  const epsilon = Number(input.simplifyEpsilon ?? 0.0018);
  const minStep = Number(input.minStep ?? 0.0008);

  strokes = fitToUnit(strokes, padding)
    .map((s) => simplifyStroke(s, epsilon, minStep))
    .filter((s) => s.length > 1);

  const pointCount = strokes.reduce((acc, s) => acc + s.length, 0);
  return {
    ok: strokes.length > 0,
    source,
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
