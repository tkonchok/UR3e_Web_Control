//Shared helpers for dry-run parsing and single-client control enforcement.
const {
  acquireLock,
  refreshLock,
  getLockStatus,
} = require("../robot/state");

function isDryRun(req) {
  return req.query.dryRun === "1";
}

function getControlToken(req) {
  return req.headers["x-control-token"] || req.query.token || null;
}

function requireControlLock(req, res) {
  const token = getControlToken(req);
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

module.exports = {
  isDryRun,
  getControlToken,
  requireControlLock,
};
