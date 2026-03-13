//Whiteboard drawing routes. Preview and execute share the same planning path.
const express = require("express");
const { sendURScript } = require("../robot/urTcp");
const {
  isDryRun,
  requireControlLock,
} = require("./control");
const {
  markMoving,
} = require("../robot/state");
const { planDrawingFromInput } = require("../draw/planner");
const { vectorizeImageDataUrl } = require("../draw/vectorizeImage");
const {
  WHITEBOARD_FRAME,
  getWhiteboardProfiles,
  getWhiteboardProfileName,
  setWhiteboardProfile,
  pointToPose,
} = require("../robot/whiteboard");

const router = express.Router();

const UR_HOST = process.env.UR_HOST || "localhost";
const UR_PORT = Number(process.env.UR_PORT || 30002);
const PEN_UP_D = Number(process.env.DRAW_PEN_UP_D || 0.018);
const PEN_DOWN_D = Number(process.env.DRAW_PEN_DOWN_D || 0.001);
const DRAW_V = Number(process.env.DRAW_LINE_V || 0.03);
const DRAW_A = Number(process.env.DRAW_LINE_A || 0.6);
const TRAVEL_V = Number(process.env.DRAW_TRAVEL_V || 0.25);
const TRAVEL_A = Number(process.env.DRAW_TRAVEL_A || 1.0);
const MAX_STROKES = Number(process.env.DRAW_MAX_STROKES || 800);
const MAX_POINTS = Number(process.env.DRAW_MAX_POINTS || 12000);
const MAX_PATH_M = Number(process.env.DRAW_MAX_PATH_M || 14.0);
const MAX_SCRIPT_LINES = Number(process.env.DRAW_MAX_SCRIPT_LINES || 16000);

function poseToJointMove(pose, a = 1.0, v = 0.6) {
  return `movej(get_inverse_kin(p[${pose.x},${pose.y},${pose.z},${pose.rx},${pose.ry},${pose.rz}], get_actual_joint_positions()), a=${a}, v=${v})`;
}

function poseToLinearMove(pose, a = 0.6, v = 0.03) {
  return `movel(p[${pose.x},${pose.y},${pose.z},${pose.rx},${pose.ry},${pose.rz}], a=${a}, v=${v})`;
}

function offsetAlongNormal(pose, s, normal) {
  return {
    ...pose,
    x: pose.x + s * normal.x,
    y: pose.y + s * normal.y,
    z: pose.z + s * normal.z,
  };
}

//Build a joint space approach plus linear pen path from normalized strokes.
function buildScriptFromStrokes(strokesNormalized) {
  const normal = WHITEBOARD_FRAME.normal || { x: 0, y: 0, z: 1 };
  const scriptLines = [];

  for (const stroke of strokesNormalized) {
    if (!Array.isArray(stroke) || stroke.length < 2) continue;
    const first = pointToPose(stroke[0].x, stroke[0].y);
    const firstUp = offsetAlongNormal(first, PEN_UP_D, normal);
    const firstDown = offsetAlongNormal(first, PEN_DOWN_D, normal);

    //Travel above the board first, then drop the pen only for the actual stroke.
    scriptLines.push(
      poseToJointMove(firstUp, TRAVEL_A, TRAVEL_V),
      poseToLinearMove(firstDown, DRAW_A, Math.min(DRAW_V, 0.02)),
    );

    for (let i = 1; i < stroke.length; i += 1) {
      const p = pointToPose(stroke[i].x, stroke[i].y);
      const pDown = offsetAlongNormal(p, PEN_DOWN_D, normal);
      scriptLines.push(poseToLinearMove(pDown, DRAW_A, DRAW_V));
    }

    const last = pointToPose(stroke[stroke.length - 1].x, stroke[stroke.length - 1].y);
    const lastUp = offsetAlongNormal(last, PEN_UP_D, normal);
    scriptLines.push(poseToLinearMove(lastUp, TRAVEL_A, Math.max(0.04, DRAW_V)));
  }

  return {
    script: scriptLines.join("\n"),
    lineCount: scriptLines.length,
    normal,
  };
}

//Estimate physical pen travel in meters using the calibrated whiteboard frame.
function estimatePathLengthMeters(strokesNormalized) {
  const uVec = WHITEBOARD_FRAME.uVec || { x: 0, y: 0, z: 0 };
  const vVec = WHITEBOARD_FRAME.vVec || { x: 0, y: 0, z: 0 };
  let total = 0;

  //Path length is measured in workspace meters, not normalized image units.
  for (const stroke of strokesNormalized) {
    for (let i = 1; i < stroke.length; i += 1) {
      const dx = stroke[i].x - stroke[i - 1].x;
      const dy = stroke[i].y - stroke[i - 1].y;
      const wx = dx * uVec.x + dy * vVec.x;
      const wy = dx * uVec.y + dy * vVec.y;
      const wz = dx * uVec.z + dy * vVec.z;
      total += Math.sqrt(wx * wx + wy * wy + wz * wz);
    }
  }
  return total;
}

//Reject oversized jobs before they hit the robot.
function evaluateSafety(plan, built) {
  const pathLengthM = estimatePathLengthMeters(plan.strokesNormalized);
  const violations = [];
  if (plan.strokeCount > MAX_STROKES) {
    violations.push(`strokeCount ${plan.strokeCount} > max ${MAX_STROKES}`);
  }
  if (plan.pointCount > MAX_POINTS) {
    violations.push(`pointCount ${plan.pointCount} > max ${MAX_POINTS}`);
  }
  if (pathLengthM > MAX_PATH_M) {
    violations.push(`pathLengthM ${pathLengthM.toFixed(3)} > max ${MAX_PATH_M}`);
  }
  if (built && built.lineCount > MAX_SCRIPT_LINES) {
    violations.push(`scriptLineCount ${built.lineCount} > max ${MAX_SCRIPT_LINES}`);
  }

  return {
    ok: violations.length === 0,
    limits: {
      maxStrokes: MAX_STROKES,
      maxPoints: MAX_POINTS,
      maxPathM: MAX_PATH_M,
      maxScriptLines: MAX_SCRIPT_LINES,
    },
    observed: {
      strokeCount: plan.strokeCount,
      pointCount: plan.pointCount,
      pathLengthM,
      scriptLineCount: built ? built.lineCount : null,
    },
    violations,
  };
}

//Rough ETA model used for preview feedback in the UI.
function estimateDrawTiming(plan, pathLengthM) {
  const drawSpeed = Math.max(0.005, DRAW_V);
  const travelSpeed = Math.max(0.02, TRAVEL_V);
  const drawTimeSec = Number(pathLengthM || 0) / drawSpeed;
  const strokeLiftSec = Number(plan?.strokeCount || 0) * (2 * PEN_UP_D) / travelSpeed;
  const pointOverheadSec = Number(plan?.pointCount || 0) * 0.02;
  const setupSec = 4.0;
  const totalSec = drawTimeSec + strokeLiftSec + pointOverheadSec + setupSec;
  const durationMs = Math.max(
    2000,
    Math.min(20 * 60 * 1000, Math.ceil(totalSec * 1000)),
  );
  return {
    durationMs,
    totalSec,
    breakdownSec: {
      draw: drawTimeSec,
      strokeLift: strokeLiftSec,
      pointOverhead: pointOverheadSec,
      setup: setupSec,
    },
    speeds: {
      drawMps: drawSpeed,
      travelMps: travelSpeed,
    },
  };
}

//Shared preview/execute planner path for image input.
async function preparePlanFromBody(body = {}) {
  const input = body || {};
  const imageDataUrl = input.imageDataUrl;
  const hasImage = typeof imageDataUrl === "string" && imageDataUrl.trim().startsWith("data:image/");

  if (!hasImage) {
    const err = new Error("Image input required. Provide { imageDataUrl }.");
    err.status = 400;
    throw err;
  }

  //Vectorize first, then clean and fit the strokes into the whiteboard frame.
  const vec = await vectorizeImageDataUrl(imageDataUrl, input.vectorize || {});
  const plan = planDrawingFromInput({
    strokes: vec.strokesNormalized,
    padding: input.padding,
    simplifyEpsilon: input.simplifyEpsilon,
    minStep: input.minStep,
  });
  plan.source = "image";
  plan.vectorization = {
    width: vec.width,
    height: vec.height,
    strokeCount: vec.strokeCount,
    pointCount: vec.pointCount,
    contourMode: vec.contourMode || null,
  };
  return plan;
}

//Return a small pose sample so the UI can inspect planned points if needed.
function makePreviewPoseSample(strokesNormalized, maxPoints = 24) {
  const out = [];
  for (const stroke of strokesNormalized) {
    for (const p of stroke) {
      out.push(pointToPose(p.x, p.y));
      if (out.length >= maxPoints) return out;
    }
  }
  return out;
}

router.get("/profiles", (req, res) => {
  res.json({
    ok: true,
    active: getWhiteboardProfileName(),
    available: getWhiteboardProfiles(),
    frame: WHITEBOARD_FRAME,
  });
});

router.post("/profile/:id", (req, res) => {
  if (!requireControlLock(req, res)) return;
  const id = String(req.params.id || "").trim();
  const frame = setWhiteboardProfile(id);
  if (!frame) {
    return res.status(404).json({ ok: false, error: `Unknown whiteboard profile ${id}` });
  }
  res.json({
    ok: true,
    active: getWhiteboardProfileName(),
    available: getWhiteboardProfiles(),
    frame,
  });
});

router.post("/preview", async (req, res) => {
  try {
    const plan = await preparePlanFromBody(req.body || {});
    if (!plan.ok) {
      return res.status(400).json({
        ok: false,
        error: "No drawable strokes found from image. Provide a cleaner { imageDataUrl }.",
        warnings: plan.warnings,
      });
    }

    const safety = evaluateSafety(plan, null);
    const eta = estimateDrawTiming(plan, safety?.observed?.pathLengthM || 0);
    res.json({
      ok: true,
      profile: getWhiteboardProfileName(),
      frame: WHITEBOARD_FRAME,
      plan,
      safety,
      eta,
      poseSample: makePreviewPoseSample(plan.strokesNormalized),
    });
  } catch (e) {
    const status = Number(e?.status || 500);
    res.status(status).json({ ok: false, error: e.message });
  }
});

router.post("/execute", async (req, res) => {
  try {
    if (!requireControlLock(req, res)) return;
    const plan = await preparePlanFromBody(req.body || {});
    if (!plan.ok) {
      return res.status(400).json({
        ok: false,
        error: "No drawable strokes found from image. Provide a cleaner { imageDataUrl }.",
        warnings: plan.warnings,
      });
    }

    const built = buildScriptFromStrokes(plan.strokesNormalized);
    if (!built.script) {
      return res.status(400).json({ ok: false, error: "Planner did not generate executable path." });
    }

    const safety = evaluateSafety(plan, built);
    if (!safety.ok) {
      return res.status(400).json({
        ok: false,
        error: "Safety limits exceeded; reduce complexity before execute.",
        safety,
      });
    }

    const eta = estimateDrawTiming(plan, safety?.observed?.pathLengthM || 0);
    const dryRun = isDryRun(req);
    if (!dryRun) {
      const durationMs = Number(eta.durationMs || 2000);
      markMoving({ action: "drawExecute", target: `${plan.source}:${plan.strokeCount}`, script: built.script }, durationMs);
      await sendURScript(UR_HOST, UR_PORT, built.script);
    }

    res.json({
      ok: true,
      action: "drawExecute",
      dryRun,
      profile: getWhiteboardProfileName(),
      frame: WHITEBOARD_FRAME,
      plan,
      safety,
      eta,
      script: built.script,
      scriptLineCount: built.lineCount,
      normal: built.normal,
    });
  } catch (e) {
    const status = Number(e?.status || 500);
    res.status(status).json({ ok: false, error: e.message });
  }
});

router.post("/stop", async (req, res) => {
  try {
    if (!requireControlLock(req, res)) return;
    const script = "stopj(2.0)";
    const dryRun = isDryRun(req);
    if (!dryRun) {
      markMoving({ action: "drawStop", target: "STOP", script }, 500);
      await sendURScript(UR_HOST, UR_PORT, script);
    }
    res.json({ ok: true, action: "drawStop", dryRun, script });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
