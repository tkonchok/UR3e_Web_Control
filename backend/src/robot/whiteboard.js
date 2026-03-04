const WHITEBOARD_PROFILES = {
  wall_default: {
    label: "Whiteboard on wall in front of robot",
    anchors: {
      topLeft: {
        x: 0.63632,
        y: 0.24553,
        z: 0.32263,
        rx: 2.298,
        ry: -2.474,
        rz: 2.432,
      },
      topRight: {
        x: 0.63632,
        y: -0.20553,
        z: 0.32263,
      },
      bottomLeft: {
        x: 0.63632,
        y: 0.24553,
        z: 0.08263,
      },
    },
  },
  table_marker: {
    label: "Flat board on table (marker test)",
    anchors: {
      topLeft: {
        x: 0.44500,
        y: 0.24500,
        z: 0.07500,
        rx: 2.204,
        ry: -2.277,
        rz: 0.036,
      },
      topRight: {
        x: 0.44500,
        y: -0.20500,
        z: 0.07500,
      },
      bottomLeft: {
        x: 0.68500,
        y: 0.24500,
        z: 0.07500,
      },
    },
  },
};

let activeWhiteboardProfile = process.env.WHITEBOARD_PROFILE || "wall_default";
if (!WHITEBOARD_PROFILES[activeWhiteboardProfile]) {
  activeWhiteboardProfile = "wall_default";
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function len(v) {
  return Math.sqrt(dot(v, v));
}

function norm(v) {
  const l = len(v);
  if (l < 1e-9) return { x: 0, y: 0, z: 0 };
  return scale(v, 1 / l);
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function buildFrame(profileName = activeWhiteboardProfile) {
  const profile = WHITEBOARD_PROFILES[profileName];
  if (!profile) return null;

  const { topLeft, topRight, bottomLeft } = profile.anchors;
  const uVec = sub(topRight, topLeft);
  const vVec = sub(bottomLeft, topLeft);
  const uDir = norm(uVec);
  const vDir = norm(vVec);
  const normal = norm(cross(uDir, vDir));

  return {
    profile: profileName,
    label: profile.label,
    origin: topLeft,
    uVec,
    vVec,
    uLen: len(uVec),
    vLen: len(vVec),
    normal,
    orientation: {
      rx: topLeft.rx,
      ry: topLeft.ry,
      rz: topLeft.rz,
    },
  };
}

const WHITEBOARD_FRAME = buildFrame();

function setWhiteboardProfile(name) {
  if (!WHITEBOARD_PROFILES[name]) return null;
  activeWhiteboardProfile = name;
  const next = buildFrame(name);
  for (const key of Object.keys(WHITEBOARD_FRAME)) delete WHITEBOARD_FRAME[key];
  Object.assign(WHITEBOARD_FRAME, next);
  return WHITEBOARD_FRAME;
}

function getWhiteboardProfileName() {
  return activeWhiteboardProfile;
}

function getWhiteboardProfiles() {
  return Object.entries(WHITEBOARD_PROFILES).map(([id, p]) => ({ id, label: p.label }));
}

function pointToPose(u, v) {
  const uu = Math.max(0, Math.min(1, Number(u)));
  const vv = Math.max(0, Math.min(1, Number(v)));
  const origin = WHITEBOARD_FRAME.origin || { x: 0, y: 0, z: 0 };
  const pos = add(add(origin, scale(WHITEBOARD_FRAME.uVec, uu)), scale(WHITEBOARD_FRAME.vVec, vv));
  const rot = WHITEBOARD_FRAME.orientation || { rx: 0, ry: 0, rz: 0 };
  return {
    x: pos.x,
    y: pos.y,
    z: pos.z,
    rx: rot.rx,
    ry: rot.ry,
    rz: rot.rz,
  };
}

module.exports = {
  WHITEBOARD_PROFILES,
  WHITEBOARD_FRAME,
  getWhiteboardProfiles,
  getWhiteboardProfileName,
  setWhiteboardProfile,
  pointToPose,
};

