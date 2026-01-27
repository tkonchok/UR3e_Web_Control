const express = require("express");
const { sendURScript } = require("../robot/urTcp");
const { SQUARES, CHESS_BOARD, chessSquareToPose, ticTacToeSquareToPose } = require("../robot/squares");
const {
  markMoving,
  getState,
  acquireLock,
  refreshLock,
  releaseLock,
  getLockStatus,
} = require("../robot/state");
const { getRobotStatus } = require("../robot/urDashboard");

const router = express.Router();

const UR_HOST = "localhost";
const UR_PORT = 30002;

//Motion distances(meters)
const APPROACH_D = 0.08;
const TOUCH_D = 0.02;
const LIFT_D = 0.10;

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

function offsetAlongNormal(pose, s, normal) {
  return {
    ...pose,
    x: pose.x + s * normal.x,
    y: pose.y + s * normal.y,
    z: pose.z + s * normal.z,
  };
}

function getBoardNormal() {
  const FLIP_NORMAL = false;
  const n = CHESS_BOARD.normal || { x: 0, y: 0, z: 1 };
  return FLIP_NORMAL ? { x: -n.x, y: -n.y, z: -n.z } : n;
}

function getPoseForSquare(id) {
  return chessSquareToPose(id);
}

function scriptForMoveSquare(id) {
  const pose = getPoseForSquare(id);
  if (!pose) return null;

  return {
    type: "movej_ik",
    script: poseToJointMove(pose, 1.0, 0.6),
    pose,
  };
}

function scriptForPick(id) {
  const pose = getPoseForSquare(id);
  if (!pose) return null;

  const n = getBoardNormal();
  const hover = offsetAlongNormal(pose, APPROACH_D, n);
  const touch = offsetAlongNormal(pose, TOUCH_D, n);
  const lift  = offsetAlongNormal(pose, LIFT_D, n);

  const script = [
    poseToJointMove(hover, 1.0, 0.6),
    poseToJointMove(touch, 0.8, 0.4),

    gripCmd(GRIP_CLOSE),
    sleepSec(GRIP_DELAY_SEC),

    poseToJointMove(lift, 1.0, 0.6),

    SQUARES.HOME_Q ? movejQ(SQUARES.HOME_Q, 1.0, 0.6) : "",
  ].filter(Boolean).join("\n");

  return { script, pose, hover, touch, lift, normal: n };
}

function scriptForPlace(id) {
  const pose = getPoseForSquare(id);
  if (!pose) return null;

  const n = getBoardNormal();
  const hover = offsetAlongNormal(pose, APPROACH_D, n);
  const touch = offsetAlongNormal(pose, TOUCH_D, n);
  const lift  = offsetAlongNormal(pose, LIFT_D, n);

  const script = [
    poseToJointMove(hover, 1.0, 0.6),
    poseToJointMove(touch, 0.8, 0.4),

    gripCmd(GRIP_OPEN),
    sleepSec(GRIP_DELAY_SEC),

    poseToJointMove(lift, 1.0, 0.6),

    SQUARES.HOME_Q ? movejQ(SQUARES.HOME_Q, 1.0, 0.6) : "",
  ].filter(Boolean).join("\n");

  return { script, pose, hover, touch, lift, normal: n };
}

function scriptForTttMove(id) {
  const pose = ticTacToeSquareToPose(id);
  if (!pose) return null;
  return {
    type: "movej_ik",
    script: poseToJointMove(pose, 1.0, 0.6),
    pose,
  };
}

function scriptForTttMark(id) {
  const pose = ticTacToeSquareToPose(id);
  if (!pose) return null;

  const n = getBoardNormal();
  const hover = offsetAlongNormal(pose, APPROACH_D, n);
  const touch = offsetAlongNormal(pose, TOUCH_D, n);
  const lift = offsetAlongNormal(pose, LIFT_D, n);

  const script = [
    poseToJointMove(hover, 1.0, 0.6),
    poseToJointMove(touch, 0.8, 0.4),
    sleepSec(GRIP_DELAY_SEC),
    poseToJointMove(lift, 1.0, 0.6),
    SQUARES.HOME_Q ? movejQ(SQUARES.HOME_Q, 1.0, 0.6) : "",
  ].filter(Boolean).join("\n");

  return { script, pose, hover, touch, lift, normal: n };
}

router.get("/status", async (req, res) => {
  try {
    const st = getState();
    const token = getToken(req);
    if (token) refreshLock(token);
    res.json({
      ok: true,
      connection: "Connected",
      robotState: st.moving ? "Moving" : "Idle",
      lastAction: st.lastAction,
      lastTarget: st.lastTarget,
      time: Date.now(),
      lock: getLockStatus(token),
    });
  } catch (e) {
    const st = getState();
    const token = getToken(req);
    res.json({
      ok: false,
      connection: "Disconnected",
      robotState: st.moving ? "Moving" : "Unknown",
      error: e.message,
      lastAction: st.lastAction,
      lastTarget: st.lastTarget,
      time: Date.now(),
      lock: getLockStatus(token),
    });
  }
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
      markMoving({ action: "pick", target: id, script: plan.script }, 3500);
      await sendURScript(UR_HOST, UR_PORT, plan.script);
    }

    res.json({
      ok: true,
      action: "pick",
      dryRun,
      target: id,
      script: plan.script,
      pose: plan.pose,
      hover: plan.hover,
      touch: plan.touch,
      lift: plan.lift,
      normal: plan.normal,
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
      markMoving({ action: "place", target: id, script: plan.script }, 3500);
      await sendURScript(UR_HOST, UR_PORT, plan.script);
    }

    res.json({
      ok: true,
      action: "place",
      dryRun,
      target: id,
      script: plan.script,
      pose: plan.pose,
      hover: plan.hover,
      touch: plan.touch,
      lift: plan.lift,
      normal: plan.normal,
      gripper: { type: "digital_out", do: GRIP_DO, open: GRIP_OPEN },
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
    const plan = scriptForTttMark(id);
    if (!plan) return res.status(404).json({ ok: false, error: `Unknown square ${id}` });

    const dryRun = isDryRun(req);
    if (!dryRun) {
      markMoving({ action: "tttMark", target: String(id), script: plan.script }, 2500);
      await sendURScript(UR_HOST, UR_PORT, plan.script);
    }

    res.json({ ok: true, action: "tttMark", dryRun, target: String(id), ...plan });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
