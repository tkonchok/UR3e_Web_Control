const deg = (d) => (d * Math.PI) / 180;

const SQUARES = {
  HOME_Q: [deg(4.54), deg(-88.66), deg(-130.23), deg(39.75), deg(88.19), deg(0.75)],
};

const A1 = {
  x: 0.74461,
  y: 0.06695,
  z: 0.24886,
  rx: 2.339,
  ry: -2.390,
  rz: 2.519,
};

const B1 = {
  x: 0.74574,
  y: 0.04265,
  z: 0.24960,
  rx: 2.296,
  ry: -2.397,
  rz: 2.541,
};

const A2 = {
  x: 0.73806,
  y: 0.06481,
  z: 0.25476,
  rx: 2.343,
  ry: -2.389,
  rz: 2.509,
};

const SQUARE_SIZE_M = 0.05715;
const FLIP_FILE = false;
const FLIP_RANK = false;

const MIN_Z = 0.05;
function clampZ(z) { return Math.max(z, MIN_Z); }

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


let fileDir = vec(A1, B1);
let rankDir = vec(A1, A2);

let u = norm(fileDir);

let v = sub(rankDir, scale(u, dot(rankDir, u)));
v = norm(v);

if (FLIP_FILE) u = scale(u, -1);
if (FLIP_RANK) v = scale(v, -1);

const fileVec = scale(u, SQUARE_SIZE_M);
const rankVec = scale(v, SQUARE_SIZE_M);

let n = norm(cross(u, v));

const CHESS_BOARD = {
  origin: A1,
  fileVec,
  rankVec,
  normal: n,
};

function parseChessSquare(id) {
  if (!/^[A-H][1-8]$/i.test(id)) return null;

  const file = id[0].toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
  const rank = parseInt(id[1], 10) - 1;

  return { file, rank };
}

function chessSquareToPose(id) {
  const p = parseChessSquare(id);
  if (!p) return null;

  let pos = { x: CHESS_BOARD.origin.x, y: CHESS_BOARD.origin.y, z: CHESS_BOARD.origin.z };
  pos = add(pos, scale(CHESS_BOARD.fileVec, p.file));
  pos = add(pos, scale(CHESS_BOARD.rankVec, p.rank));

  pos.z = clampZ(pos.z);

  return {
    x: pos.x,
    y: pos.y,
    z: pos.z,
    rx: CHESS_BOARD.origin.rx,
    ry: CHESS_BOARD.origin.ry,
    rz: CHESS_BOARD.origin.rz,
  };
}

function parseTicTacToeSquare(id) {
  if (!/^[1-9]$/.test(String(id))) return null;
  const n = parseInt(id, 10) - 1;
  return { row: Math.floor(n / 3), col: n % 3 };
}

function ticTacToeSquareToPose(id) {
  const p = parseTicTacToeSquare(id);
  if (!p) return null;

  let pos = { x: CHESS_BOARD.origin.x, y: CHESS_BOARD.origin.y, z: CHESS_BOARD.origin.z };
  pos = add(pos, scale(CHESS_BOARD.rankVec, 2));
  pos = add(pos, scale(CHESS_BOARD.fileVec, p.col));
  pos = add(pos, scale(CHESS_BOARD.rankVec, -p.row));
  pos.z = clampZ(pos.z);

  return {
    x: pos.x,
    y: pos.y,
    z: pos.z,
    rx: CHESS_BOARD.origin.rx,
    ry: CHESS_BOARD.origin.ry,
    rz: CHESS_BOARD.origin.rz,
  };
}

module.exports = {
  deg,
  SQUARES,
  CHESS_BOARD,
  chessSquareToPose,
  ticTacToeSquareToPose,
};
