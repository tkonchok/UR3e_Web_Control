const path = require("path");
const { spawn } = require("child_process");

function toFiniteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(s)) return true;
    if (["0", "false", "no", "n", "off"].includes(s)) return false;
  }
  return fallback;
}

function sanitizeVectorizeOptions(options = {}) {
  return {
    maxDim: Math.round(clamp(toFiniteNumber(options.maxDim, 1024), 128, 2048)),
    blurKsize: Math.round(clamp(toFiniteNumber(options.blurKsize, 5), 0, 31)),
    cannyLow: Math.round(clamp(toFiniteNumber(options.cannyLow, 60), 1, 255)),
    cannyHigh: Math.round(clamp(toFiniteNumber(options.cannyHigh, 170), 1, 255)),
    minPerimeterPx: clamp(toFiniteNumber(options.minPerimeterPx, 16), 1, 5000),
    approxEpsilonFrac: clamp(toFiniteNumber(options.approxEpsilonFrac, 0.01), 0.0005, 0.2),
    maxContours: Math.round(clamp(toFiniteNumber(options.maxContours, 1200), 10, 5000)),
    externalOnly: toBoolean(options.externalOnly, true),
    outlineBinary: toBoolean(options.outlineBinary, true),
  };
}

function parseDataUrl(dataUrl) {
  const s = String(dataUrl || "").trim();
  const m = s.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i);
  if (!m) {
    throw new Error("Expected imageDataUrl in base64 data URL format");
  }
  const mime = (m[1] || "application/octet-stream").toLowerCase();
  if (!mime.startsWith("image/")) {
    throw new Error(`Unsupported data URL mime type: ${mime}`);
  }
  const b64 = m[2];
  if (!b64) {
    throw new Error("Empty image data");
  }
  return { mime, base64: b64 };
}

function runPythonVectorize(payload, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const python = process.env.PYTHON_BIN || "python3";
    const script = path.join(__dirname, "vectorize_opencv.py");
    const proc = spawn(python, [script], { stdio: ["pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeoutMs);

    proc.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        return reject(new Error(`Image vectorization timeout after ${timeoutMs}ms`));
      }
      if (code !== 0) {
        return reject(new Error(`Vectorizer failed (code ${code}): ${stderr || stdout || "unknown error"}`));
      }
      try {
        const data = JSON.parse(String(stdout || "{}"));
        if (!data.ok) {
          return reject(new Error(String(data.error || "Image vectorization failed")));
        }
        resolve(data);
      } catch (e) {
        reject(new Error(`Invalid vectorizer output: ${e.message}`));
      }
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

async function vectorizeImageDataUrl(imageDataUrl, options = {}) {
  const { base64 } = parseDataUrl(imageDataUrl);
  const cfg = sanitizeVectorizeOptions(options);
  const data = await runPythonVectorize({
    imageBase64: base64,
    ...cfg,
  });

  const strokes = Array.isArray(data.strokesNormalized) ? data.strokesNormalized : [];
  return {
    ok: true,
    width: Number(data.width || 0),
    height: Number(data.height || 0),
    strokeCount: Number(data.strokeCount || strokes.length),
    pointCount: Number(data.pointCount || 0),
    contourMode: String(data.contourMode || ""),
    strokesNormalized: strokes.map((stroke) =>
      Array.isArray(stroke)
        ? stroke
          .map((p) => (Array.isArray(p) && p.length >= 2 ? { x: Number(p[0]), y: Number(p[1]) } : null))
          .filter(Boolean)
        : [],
    ).filter((s) => s.length > 1),
  };
}

module.exports = {
  vectorizeImageDataUrl,
};
