// Board calibration and square lookup for chess and tic-tac-toe modes.
const deg = (d) => (d * Math.PI) / 180;

const SQUARES = {
  HOME_Q: [deg(4.54), deg(-88.66), deg(-130.23), deg(39.75), deg(88.19), deg(0.75)],
};

const BOARD_PROFILES = {
  table_front: {
    label: "Board on table in front of robot",
    squareSizeM: 0.05700,
    flattenZ: true,
    orientationInterpolation: false,
    fileRotGain: 0.35,
    rankRotGain: 0.35,
    fileAnchorSpan: 1,
    rankAnchorSpan: 1,
    maxRotStepRad: 0.03,
    flipFile: false,
    flipRank: false,
    flipNormal: false,
    anchors: {
      A1: {
        x: 0.40178,
        y: 0.21478,
        z: 0.05634,
        rx: 2.204,
        ry: -2.277,
        rz: 0.036,
      },
      B1: {
        x: 0.40178,
        y: 0.15778,
        z: 0.05634,
        rx: 2.204,
        ry: -2.277,
        rz: 0.036,
      },
      A2: {
        x: 0.45878,
        y: 0.21478,
        z: 0.05634,
        rx: 2.204,
        ry: -2.277,
        rz: 0.036,
      },
    },
  },
  wall_front: {
    label: "Board mounted in front of robot on wall/whiteboard",
    squareSizeM: 0.05700,
    flattenZ: false,
    orientationInterpolation: true,
    fileRotGain: 0.35,
    rankRotGain: 0.35,
    fileAnchorSpan: 1,
    rankAnchorSpan: 1,
    maxRotStepRad: 0.03,
    flipFile: false,
    flipRank: false,
    flipNormal: false,
    anchors: {
      A1: {
        x: 0.63632,
        y: 0.22153,
        z: 0.13163,
        rx: 2.298,
        ry: -2.474,
        rz: 2.432,
      },
      B1: {
        x: 0.63632,
        y: 0.16453,
        z: 0.13163,
        rx: 2.298,
        ry: -2.474,
        rz: 2.432,
      },
      A2: {
        x: 0.63632,
        y: 0.22153,
        z: 0.18863,
        rx: 2.298,
        ry: -2.474,
        rz: 2.432,
      },
    },
  },
};

let activeBoardProfile = process.env.BOARD_PROFILE || "table_front";
if (!BOARD_PROFILES[activeBoardProfile]) {
  activeBoardProfile = "table_front";
}

const MIN_Z = 0.05;
function clampZ(z) {
  return Math.max(z, MIN_Z);
}

//Basic 3D vector helpers used to build the board frame.
function vec(a, b) { return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }; }
function dot(u, v) { return u.x * v.x + u.y * v.y + u.z * v.z; }
function len(u) { return Math.sqrt(dot(u, u)); }
function scale(u, s) { return { x: u.x * s, y: u.y * s, z: u.z * s }; }
function add(a, u) { return { x: a.x + u.x, y: a.y + u.y, z: a.z + u.z }; }
function sub(u, v) { return { x: u.x - v.x, y: u.y - v.y, z: u.z - v.z }; }
function norm(u) {
  const L = len(u);
  return L > 1e-9 ? scale(u, 1 / L) : { x: 0, y: 0, z: 0 };
}
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

//Interpolate orientation drift from the anchor poses.
function orientationAt(board, file, rank) {
  const o0 = board.orientationOrigin || board.origin || { rx: 0, ry: 0, rz: 0 };
  const df = board.fileRotDelta || { rx: 0, ry: 0, rz: 0 };
  const dr = board.rankRotDelta || { rx: 0, ry: 0, rz: 0 };
  return {
    rx: o0.rx + file * df.rx + rank * dr.rx,
    ry: o0.ry + file * df.ry + rank * dr.ry,
    rz: o0.rz + file * df.rz + rank * dr.rz,
  };
}

//Build a board frame from the active anchor set.
function buildBoard(profileName = activeBoardProfile) {
  const profile = BOARD_PROFILES[profileName];
  if (!profile) return null;

  const { A1, B1, A2 } = profile.anchors;
  let fileDir = vec(A1, B1);
  let rankDir = vec(A1, A2);

  //For table setups, ignore small anchor Z noise so every square stays at one height.
  if (profile.flattenZ) {
    fileDir = { x: fileDir.x, y: fileDir.y, z: 0 };
    rankDir = { x: rankDir.x, y: rankDir.y, z: 0 };
  }

  let u = norm(fileDir);

  let v = sub(rankDir, scale(u, dot(rankDir, u)));
  v = norm(v);

  if (profile.flipFile) u = scale(u, -1);
  if (profile.flipRank) v = scale(v, -1);

  const fileVec = scale(u, profile.squareSizeM);
  const rankVec = scale(v, profile.squareSizeM);

  let n = norm(cross(u, v));
  if (profile.flattenZ) {
    n = { x: 0, y: 0, z: profile.flipNormal ? -1 : 1 };
  } else if (profile.flipNormal) {
    n = scale(n, -1);
  }

  const orientationOrigin = {
    rx: A1.rx,
    ry: A1.ry,
    rz: A1.rz,
  };

  const fileSpan = Math.max(1, Number(profile.fileAnchorSpan || 1));
  const rankSpan = Math.max(1, Number(profile.rankAnchorSpan || 1));
  const fileGain = Number(profile.fileRotGain ?? 1);
  const rankGain = Number(profile.rankRotGain ?? 1);
  const maxStep = Number(profile.maxRotStepRad ?? 0.03);

  //Estimate small orientation drift per square from the anchor poses.
  const rawFileDelta = {
    rx: (B1.rx - A1.rx) / fileSpan,
    ry: (B1.ry - A1.ry) / fileSpan,
    rz: (B1.rz - A1.rz) / fileSpan,
  };
  const rawRankDelta = {
    rx: (A2.rx - A1.rx) / rankSpan,
    ry: (A2.ry - A1.ry) / rankSpan,
    rz: (A2.rz - A1.rz) / rankSpan,
  };

  const fileRotDelta = profile.orientationInterpolation === false
    ? { rx: 0, ry: 0, rz: 0 }
    : {
      rx: clamp(rawFileDelta.rx * fileGain, -maxStep, maxStep),
      ry: clamp(rawFileDelta.ry * fileGain, -maxStep, maxStep),
      rz: clamp(rawFileDelta.rz * fileGain, -maxStep, maxStep),
    };
  const rankRotDelta = profile.orientationInterpolation === false
    ? { rx: 0, ry: 0, rz: 0 }
    : {
      rx: clamp(rawRankDelta.rx * rankGain, -maxStep, maxStep),
      ry: clamp(rawRankDelta.ry * rankGain, -maxStep, maxStep),
      rz: clamp(rawRankDelta.rz * rankGain, -maxStep, maxStep),
    };

  return {
    profile: profileName,
    label: profile.label,
    origin: A1,
    orientationOrigin,
    fileRotDelta,
    rankRotDelta,
    fileVec,
    rankVec,
    normal: n,
  };
}

const CHESS_BOARD = buildBoard();

//Swap to a new board profile without replacing the shared object reference.
function setBoardProfile(name) {
  if (!BOARD_PROFILES[name]) return null;
  activeBoardProfile = name;
  const next = buildBoard(name);
  for (const key of Object.keys(CHESS_BOARD)) delete CHESS_BOARD[key];
  Object.assign(CHESS_BOARD, next);
  return CHESS_BOARD;
}

function getBoardProfileName() {
  return activeBoardProfile;
}

function getBoardProfiles() {
  return Object.entries(BOARD_PROFILES).map(([id, p]) => ({ id, label: p.label }));
}

//Parse a chess square like A1 into zero-based file/rank indices.
function parseChessSquare(id) {
  if (!/^[A-H][1-8]$/i.test(id)) return null;

  const file = id[0].toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
  const rank = parseInt(id[1], 10) - 1;

  return { file, rank };
}

//Convert a chess square into a robot pose using the current calibration.
function chessSquareToPose(id) {
  const p = parseChessSquare(id);
  if (!p) return null;

  if (!CHESS_BOARD.origin) return null;
  let pos = { x: CHESS_BOARD.origin.x, y: CHESS_BOARD.origin.y, z: CHESS_BOARD.origin.z };
  pos = add(pos, scale(CHESS_BOARD.fileVec, p.file));
  pos = add(pos, scale(CHESS_BOARD.rankVec, p.rank));

  pos.z = clampZ(pos.z);
  const rot = orientationAt(CHESS_BOARD, p.file, p.rank);

  return {
    x: pos.x,
    y: pos.y,
    z: pos.z,
    rx: rot.rx,
    ry: rot.ry,
    rz: rot.rz,
  };
}

function parseTicTacToeSquare(id) {
  if (!/^[1-9]$/.test(String(id))) return null;
  const n = parseInt(id, 10) - 1;
  return { row: Math.floor(n / 3), col: n % 3 };
}

//Map tic-tac-toe cells 1-9 onto the calibrated board frame.
function ticTacToeSquareToPose(id) {
  const p = parseTicTacToeSquare(id);
  if (!p) return null;

  if (!CHESS_BOARD.origin) return null;
  let pos = { x: CHESS_BOARD.origin.x, y: CHESS_BOARD.origin.y, z: CHESS_BOARD.origin.z };
  pos = add(pos, scale(CHESS_BOARD.rankVec, 2));
  pos = add(pos, scale(CHESS_BOARD.fileVec, p.col));
  pos = add(pos, scale(CHESS_BOARD.rankVec, -p.row));
  pos.z = clampZ(pos.z);
  const file = p.col;
  const rank = 2 - p.row;
  const rot = orientationAt(CHESS_BOARD, file, rank);

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
  deg,
  SQUARES,
  CHESS_BOARD,
  BOARD_PROFILES,
  getBoardProfiles,
  getBoardProfileName,
  setBoardProfile,
  chessSquareToPose,
  ticTacToeSquareToPose,
};
