const express = require("express");
const { sendURScript } = require("../robot/urTcp");
const { getRobotStatus } = require("../robot/urDashboard");
const { getRtdeStatus } = require("../robot/urRtde");
const {
  SQUARES,
  CHESS_BOARD,
  chessSquareToPose,
  ticTacToeSquareToPose,
  getBoardProfiles,
  getBoardProfileName,
  setBoardProfile,
} = require("../robot/squares");
const {
  markMoving,
  getState,
  acquireLock,
  refreshLock,
  releaseLock,
  getLockStatus,
} = require("../robot/state");

const router = express.Router();

const UR_HOST = process.env.UR_HOST || "localhost";
const UR_PORT = Number(process.env.UR_PORT || 30002);
const DASHBOARD_HOST = process.env.UR_DASHBOARD_HOST || UR_HOST;
const DASHBOARD_PORT = Number(process.env.UR_DASHBOARD_PORT || 29999);
const ENABLE_DASHBOARD_STATUS = process.env.ENABLE_DASHBOARD_STATUS !== "0";
const ENABLE_RTDE_STATUS = process.env.ENABLE_RTDE_STATUS !== "0";
const ENABLE_DASHBOARD_WHEN_RTDE_LIVE = process.env.ENABLE_DASHBOARD_WHEN_RTDE_LIVE === "1";

//Motion distances(meters)
const APPROACH_D = 0.08;
const TOUCH_D = 0.02;
const LIFT_D = 0.10;
const MARK_TOUCH_D = 0.0;
const TTT_MARK_SIZE_FRAC = 0.34;
const TTT_MARK_LINE_V = 0.015;

const GRIP_DO = 0;
const GRIP_CLOSE = true;
const GRIP_OPEN = false;
const GRIP_DELAY_SEC = 0.25;

function isDryRun(req) {
  return req.query.dryRun === "1";
}

function getToken(req) {
  return req.headers["x-control-token"] || req.query.token || null;
}

function requireControlLock(req, res) {
  const token = getToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: "Control token required" });
    return null;
  }

  const lock = getLockStatus(token);
  if (!lock.held) {
    const acquired = acquireLock(token);
    if (!acquired.ok) {
      res.status(423).json({ ok: false, error: "Control locked by another client" });
      return null;
    }
  } else if (!lock.yours) {
    res.status(423).json({ ok: false, error: "Control locked by another client" });
    return null;
  }

  refreshLock(token);
  return token;
}

function movejQ(q, a = 1.0, v = 0.6) {
  return `movej([${q.join(",")}], a=${a}, v=${v})`;
}

function gripCmd(close) {
  return `set_digital_out(${GRIP_DO}, ${close ? "True" : "False"})`;
}

function sleepSec(t) {
  return `sleep(${t})`;
}

function poseToJointMove(pose, a = 1.0, v = 0.6) {
  return `movej(get_inverse_kin(p[${pose.x},${pose.y},${pose.z},${pose.rx},${pose.ry},${pose.rz}], get_actual_joint_positions()), a=${a}, v=${v})`;
}

function poseToLinearMove(pose, a = 0.8, v = 0.04) {
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

function offsetInBoardPlane(pose, fileScale = 0, rankScale = 0) {
  const f = CHESS_BOARD.fileVec || { x: 0, y: 0, z: 0 };
  const r = CHESS_BOARD.rankVec || { x: 0, y: 0, z: 0 };
  return {
    ...pose,
    x: pose.x + fileScale * f.x + rankScale * r.x,
    y: pose.y + fileScale * f.y + rankScale * r.y,
    z: pose.z + fileScale * f.z + rankScale * r.z,
  };
}

function normalizeMarkSymbol(value) {
  const s = String(value || "X").trim().toUpperCase();
  return s === "O" ? "O" : "X";
}

function getBoardNormal() {
  const n = CHESS_BOARD.normal || { x: 0, y: 0, z: 1 };
  return n;
}

function getPoseForSquare(id) {
  return chessSquareToPose(id);
}

function parseDashboardRunning(value) {
  if (value == null) return null;
  const s = String(value).toLowerCase();
  if (s.includes("true")) return true;
  if (s.includes("false")) return false;
  return null;
}

function inferRobotStateFromDashboard(dashboard, fallbackMoving) {
  const out = {
    moving: fallbackMoving,
    robotState: fallbackMoving ? "Moving" : "Idle",
    connection: "Connected",
  };
  if (!dashboard) return out;

  const running = parseDashboardRunning(dashboard.running);
  const programState = String(dashboard.programState || "").toLowerCase();
  const robotmode = String(dashboard.robotmode || "").toLowerCase();
  const hasAny = Object.values(dashboard).some((v) => v != null);

  if (!hasAny) {
    return out;
  }

  const programRunning = programState.includes("playing") || programState.includes("running");
  const programStopped = programState.includes("stopped") || programState.includes("paused");

  // Dashboard data can be inconsistent for External Control.
  // Treat any positive signal as moving; require strong agreement to mark stopped.
  if (running === true || programRunning) {
    out.moving = true;
  } else if (running === false && programStopped) {
    out.moving = false;
  } else if (running === false && !programRunning && !programStopped) {
    out.moving = false;
  } else if (running == null && programStopped) {
    out.moving = false;
  }

  // If dashboard is reachable but robot reports disconnected/no controller, reflect that.
  if (robotmode.includes("no controller") || robotmode.includes("disconnected")) {
    out.connection = "Disconnected";
  }

  out.robotState = out.moving ? "Moving" : "Idle";
  return out;
}

function scriptForMoveSquare(id) {
  const pose = getPoseForSquare(id);
  if (!pose) return null;
  const n = getBoardNormal();
  const hover = offsetAlongNormal(pose, APPROACH_D, n);

  return {
    type: "movej_ik",
    script: poseToJointMove(hover, 1.0, 0.6),
    pose,
    hover,
    normal: n,
  };
}

function scriptForPick(id) {
  const pose = getPoseForSquare(id);
  if (!pose) return null;

  const script = [
    gripCmd(GRIP_CLOSE),
    sleepSec(GRIP_DELAY_SEC),
  ].filter(Boolean).join("\n");

  return { script, pose };
}

function scriptForPlace(id) {
  const pose = getPoseForSquare(id);
  if (!pose) return null;

  const script = [
    gripCmd(GRIP_OPEN),
    sleepSec(GRIP_DELAY_SEC),
  ].filter(Boolean).join("\n");

  return { script, pose };
}

function scriptForTttMove(id) {
  const pose = ticTacToeSquareToPose(id);
  if (!pose) return null;
  const n = getBoardNormal();
  const hover = offsetAlongNormal(pose, APPROACH_D, n);
  return {
    type: "movej_ik",
    script: poseToJointMove(hover, 1.0, 0.6),
    pose,
    hover,
    normal: n,
  };
}

function scriptForTttMark(id, symbol = "X") {
  const pose = ticTacToeSquareToPose(id);
  if (!pose) return null;

  const mark = normalizeMarkSymbol(symbol);
  const n = getBoardNormal();
  const centerHover = offsetAlongNormal(pose, APPROACH_D, n);
  const d = TTT_MARK_SIZE_FRAC;

  const scriptLines = [poseToJointMove(centerHover, 1.0, 0.6)];
  const strokes = [];

  if (mark === "X") {
    const p1 = offsetInBoardPlane(pose, -d, -d);
    const p2 = offsetInBoardPlane(pose, d, d);
    const p3 = offsetInBoardPlane(pose, -d, d);
    const p4 = offsetInBoardPlane(pose, d, -d);
    const p1h = offsetAlongNormal(p1, APPROACH_D, n);
    const p2h = offsetAlongNormal(p2, APPROACH_D, n);
    const p3h = offsetAlongNormal(p3, APPROACH_D, n);
    const p4h = offsetAlongNormal(p4, APPROACH_D, n);
    const p1t = offsetAlongNormal(p1, MARK_TOUCH_D, n);
    const p2t = offsetAlongNormal(p2, MARK_TOUCH_D, n);
    const p3t = offsetAlongNormal(p3, MARK_TOUCH_D, n);
    const p4t = offsetAlongNormal(p4, MARK_TOUCH_D, n);

    scriptLines.push(
      poseToJointMove(p1h, 1.0, 0.5),
      poseToJointMove(p1t, 0.8, 0.25),
      poseToLinearMove(p2t, 0.6, TTT_MARK_LINE_V),
      poseToJointMove(p2h, 1.0, 0.5),
      poseToJointMove(p3h, 1.0, 0.5),
      poseToJointMove(p3t, 0.8, 0.25),
      poseToLinearMove(p4t, 0.6, TTT_MARK_LINE_V),
      poseToJointMove(p4h, 1.0, 0.5),
    );
    strokes.push(["diag1", p1, p2], ["diag2", p3, p4]);
  } else {
    const points = [];
    const segments = 16;
    for (let i = 0; i <= segments; i += 1) {
      const t = (2 * Math.PI * i) / segments;
      const c = Math.cos(t);
      const s = Math.sin(t);
      points.push(offsetInBoardPlane(pose, d * c, d * s));
    }
    const hoverPoints = points.map((p) => offsetAlongNormal(p, APPROACH_D, n));
    const touchPoints = points.map((p) => offsetAlongNormal(p, MARK_TOUCH_D, n));

    scriptLines.push(
      poseToJointMove(hoverPoints[0], 1.0, 0.5),
      poseToJointMove(touchPoints[0], 0.8, 0.25),
    );
    for (let i = 1; i < touchPoints.length; i += 1) {
      scriptLines.push(poseToLinearMove(touchPoints[i], 0.6, TTT_MARK_LINE_V));
    }
    scriptLines.push(poseToJointMove(hoverPoints[hoverPoints.length - 1], 1.0, 0.5));
    strokes.push(["circle", points]);
  }

  scriptLines.push(poseToJointMove(centerHover, 1.0, 0.6));
  const script = scriptLines.filter(Boolean).join("\n");
  return {
    script,
    pose,
    hover: centerHover,
    normal: n,
    symbol: mark,
    strokes,
  };
}

function scriptForPickPlace(fromId, toId) {
  const fromPose = getPoseForSquare(fromId);
  const toPose = getPoseForSquare(toId);
  if (!fromPose || !toPose) return null;

  const n = getBoardNormal();
  const fromHover = offsetAlongNormal(fromPose, APPROACH_D, n);
  const fromTouch = offsetAlongNormal(fromPose, TOUCH_D, n);
  const fromLift = offsetAlongNormal(fromPose, LIFT_D, n);
  const toHover = offsetAlongNormal(toPose, APPROACH_D, n);
  const toTouch = offsetAlongNormal(toPose, TOUCH_D, n);
  const toLift = offsetAlongNormal(toPose, LIFT_D, n);

  const script = [
    poseToJointMove(fromHover, 1.0, 0.6),
    poseToJointMove(fromTouch, 0.8, 0.4),
    gripCmd(GRIP_CLOSE),
    sleepSec(GRIP_DELAY_SEC),
    poseToJointMove(fromLift, 1.0, 0.6),
    poseToJointMove(toHover, 1.0, 0.6),
    poseToJointMove(toTouch, 0.8, 0.4),
    gripCmd(GRIP_OPEN),
    sleepSec(GRIP_DELAY_SEC),
    poseToJointMove(toLift, 1.0, 0.6),
    SQUARES.HOME_Q ? movejQ(SQUARES.HOME_Q, 1.0, 0.6) : "",
  ].filter(Boolean).join("\n");

  return {
    script,
    normal: n,
    from: { id: fromId, pose: fromPose, hover: fromHover, touch: fromTouch, lift: fromLift },
    to: { id: toId, pose: toPose, hover: toHover, touch: toTouch, lift: toLift },
  };
}

router.get("/status", async (req, res) => {
  const st = getState();
  const token = getToken(req);
  if (token) refreshLock(token);

  const rtde = ENABLE_RTDE_STATUS ? getRtdeStatus() : null;
  const rtdeLive = !!(rtde && rtde.connected && !rtde.stale);

  let dashboard = null;
  const shouldQueryDashboard =
    ENABLE_DASHBOARD_STATUS && (!rtdeLive || ENABLE_DASHBOARD_WHEN_RTDE_LIVE);
  if (shouldQueryDashboard) {
    try {
      dashboard = await getRobotStatus(DASHBOARD_HOST, DASHBOARD_PORT);
    } catch {
      dashboard = null;
    }
  }

  let live = inferRobotStateFromDashboard(dashboard, st.moving);

  // Prefer RTDE for motion state when live samples are available.
  if (rtdeLive) {
    live.moving = !!rtde.moving;
    live.robotState = live.moving ? "Moving" : "Idle";
    live.connection = "Connected";
  } else if (!dashboard && (!rtde || !rtde.connected || rtde.stale) && (ENABLE_DASHBOARD_STATUS || ENABLE_RTDE_STATUS)) {
    // No live source responded this tick (dashboard + RTDE unavailable).
    live.connection = "Disconnected";
  }

  res.json({
    ok: true,
    connection: live.connection,
    robotState: live.robotState,
    moving: live.moving,
    lastAction: st.lastAction,
    lastTarget: st.lastTarget,
    time: Date.now(),
    boardProfile: getBoardProfileName(),
    lock: getLockStatus(token),
    dashboard: dashboard || undefined,
    rtde: rtde || undefined,
  });
});

router.post("/lock/acquire", (req, res) => {
  const token = getToken(req);
  const result = acquireLock(token);
  if (!result.ok) {
    return res.status(423).json({ ok: false, error: "Control locked by another client" });
  }
  res.json({ ok: true, token: result.token, reused: result.reused });
});

router.post("/lock/release", (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ ok: false, error: "Control token required" });
  const ok = releaseLock(token);
  res.json({ ok, released: ok });
});

router.get("/lock/status", (req, res) => {
  const token = getToken(req);
  res.json({ ok: true, lock: getLockStatus(token) });
});

router.get("/board/profiles", (req, res) => {
  res.json({
    ok: true,
    active: getBoardProfileName(),
    available: getBoardProfiles(),
    board: CHESS_BOARD,
  });
});

router.post("/board/profile/:id", (req, res) => {
  if (!requireControlLock(req, res)) return;
  const id = String(req.params.id || "").trim();
  const board = setBoardProfile(id);
  if (!board) {
    return res.status(404).json({ ok: false, error: `Unknown board profile ${id}` });
  }
  res.json({ ok: true, active: getBoardProfileName(), board, available: getBoardProfiles() });
});

router.post("/moveSquare/:id", async (req, res) => {
  try {
    if (!requireControlLock(req, res)) return;
    const id = req.params.id.toUpperCase();
    const plan = scriptForMoveSquare(id);
    if (!plan) return res.status(404).json({ ok: false, error: `Unknown square ${id}` });

    const dryRun = isDryRun(req);
    if (!dryRun) {
      markMoving({ action: "moveSquare", target: id, script: plan.script }, 2500);
      await sendURScript(UR_HOST, UR_PORT, plan.script);
    }

    res.json({ ok: true, action: "moveSquare", dryRun, target: id, ...plan });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/home", async (req, res) => {
  try {
    if (!requireControlLock(req, res)) return;
    const q = SQUARES.HOME_Q;
    if (!q) return res.status(500).json({ ok: false, error: "HOME_Q not defined" });

    const script = movejQ(q, 1.2, 0.7);
    const dryRun = isDryRun(req);

    if (!dryRun) {
      markMoving({ action: "home", target: "HOME", script }, 2500);
      await sendURScript(UR_HOST, UR_PORT, script);
    }

    res.json({ ok: true, action: "home", dryRun, script, q });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/pick/:id", async (req, res) => {
  try {
    if (!requireControlLock(req, res)) return;
    const id = req.params.id.toUpperCase();
    const plan = scriptForPick(id);
    if (!plan) return res.status(404).json({ ok: false, error: `Unknown square ${id}` });

    const dryRun = isDryRun(req);
    if (!dryRun) {
      markMoving({ action: "pick", target: id, script: plan.script }, 600);
      await sendURScript(UR_HOST, UR_PORT, plan.script);
    }

    res.json({
      ok: true,
      action: "pick",
      dryRun,
      target: id,
      script: plan.script,
      pose: plan.pose,
      gripper: { type: "digital_out", do: GRIP_DO, close: GRIP_CLOSE },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/place/:id", async (req, res) => {
  try {
    if (!requireControlLock(req, res)) return;
    const id = req.params.id.toUpperCase();
    const plan = scriptForPlace(id);
    if (!plan) return res.status(404).json({ ok: false, error: `Unknown square ${id}` });

    const dryRun = isDryRun(req);
    if (!dryRun) {
      markMoving({ action: "place", target: id, script: plan.script }, 600);
      await sendURScript(UR_HOST, UR_PORT, plan.script);
    }

    res.json({
      ok: true,
      action: "place",
      dryRun,
      target: id,
      script: plan.script,
      pose: plan.pose,
      gripper: { type: "digital_out", do: GRIP_DO, open: GRIP_OPEN },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/chess/pickPlace", async (req, res) => {
  try {
    if (!requireControlLock(req, res)) return;

    const from = String(req.body?.from || "").trim().toUpperCase();
    const to = String(req.body?.to || "").trim().toUpperCase();
    if (!/^[A-H][1-8]$/.test(from) || !/^[A-H][1-8]$/.test(to)) {
      return res.status(400).json({ ok: false, error: "Body must include valid chess squares { from, to }" });
    }

    const plan = scriptForPickPlace(from, to);
    if (!plan) return res.status(404).json({ ok: false, error: `Unknown square ${from} or ${to}` });

    const dryRun = isDryRun(req);
    if (!dryRun) {
      markMoving({ action: "pickPlace", target: `${from}->${to}`, script: plan.script }, 7000);
      await sendURScript(UR_HOST, UR_PORT, plan.script);
    }

    res.json({
      ok: true,
      action: "pickPlace",
      dryRun,
      from,
      to,
      script: plan.script,
      normal: plan.normal,
      fromPlan: plan.from,
      toPlan: plan.to,
      gripper: { type: "digital_out", do: GRIP_DO, close: GRIP_CLOSE, open: GRIP_OPEN },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/ttt/move/:id", async (req, res) => {
  try {
    if (!requireControlLock(req, res)) return;
    const id = req.params.id;
    const plan = scriptForTttMove(id);
    if (!plan) return res.status(404).json({ ok: false, error: `Unknown square ${id}` });

    const dryRun = isDryRun(req);
    if (!dryRun) {
      markMoving({ action: "tttMove", target: String(id), script: plan.script }, 2500);
      await sendURScript(UR_HOST, UR_PORT, plan.script);
    }

    res.json({ ok: true, action: "tttMove", dryRun, target: String(id), ...plan });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/ttt/mark/:id", async (req, res) => {
  try {
    if (!requireControlLock(req, res)) return;
    const id = req.params.id;
    const symbol = normalizeMarkSymbol(req.body?.symbol);
    const plan = scriptForTttMark(id, symbol);
    if (!plan) return res.status(404).json({ ok: false, error: `Unknown square ${id}` });

    const dryRun = isDryRun(req);
    if (!dryRun) {
      markMoving({ action: "tttMark", target: `${String(id)}:${plan.symbol}`, script: plan.script }, 5000);
      await sendURScript(UR_HOST, UR_PORT, plan.script);
    }

    res.json({ ok: true, action: "tttMark", dryRun, target: String(id), symbol: plan.symbol, ...plan });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
