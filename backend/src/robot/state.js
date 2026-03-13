//lightweight shared state for UI status and the single controller lock.
const crypto = require("crypto");

let movingUntil = 0;
const LOCK_TTL_MS = 8000;
let lockToken = null;
let lockLastSeen = 0;

const state = {
  lastAction: null,
  lastTarget: null,
  lastScript: null,
};

function markMoving({ action, target, script }, durationMs = 1500) {
  state.lastAction = action;
  state.lastTarget = target;
  state.lastScript = script;
  movingUntil = Date.now() + durationMs;
}

function isMovingLatched() {
  return Date.now() < movingUntil;
}

function isLockExpired() {
  return !lockToken || Date.now() - lockLastSeen > LOCK_TTL_MS;
}

//Only one browser can control the robot at a time.
function acquireLock(requestedToken) {
  if (!isLockExpired() && lockToken && lockToken !== requestedToken) {
    return { ok: false, reason: "locked", token: null };
  }

  if (requestedToken) {
    lockToken = requestedToken;
    lockLastSeen = Date.now();
    return { ok: true, token: lockToken, reused: true };
  }

  lockToken = crypto.randomUUID();
  lockLastSeen = Date.now();
  return { ok: true, token: lockToken, reused: false };
}

function refreshLock(token) {
  if (lockToken && token && lockToken === token) {
    lockLastSeen = Date.now();
    return true;
  }
  return false;
}

function releaseLock(token) {
  if (lockToken && token && lockToken === token) {
    lockToken = null;
    lockLastSeen = 0;
    return true;
  }
  return false;
}

function getLockStatus(token) {
  if (isLockExpired()) {
    lockToken = null;
    lockLastSeen = 0;
  }

  const held = !!lockToken;
  const yours = held && token && lockToken === token;
  const expiresInMs = held ? Math.max(0, LOCK_TTL_MS - (Date.now() - lockLastSeen)) : 0;

  return { held, yours, expiresInMs };
}

function getState() {
  return {
    ...state,
    moving: isMovingLatched(),
    movingUntil,
  };
}

module.exports = {
  markMoving,
  isMovingLatched,
  getState,
  acquireLock,
  refreshLock,
  releaseLock,
  getLockStatus,
  LOCK_TTL_MS,
};
