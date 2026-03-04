import { useEffect, useRef, useState, type DragEvent } from "react";
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Badge } from './components/ui/badge';
import { Card } from './components/ui/card';
import { Switch } from "./components/ui/switch";
import pawnImage from "./assets/chess-pawn.svg";

type GameMode = 'Chess' | 'Tic-Tac-Toe' | 'Whiteboard';
type ConnectionStatus = 'Connected' | 'Disconnected';
type RobotState = 'Idle' | 'Moving';
type ControlStatus = 'YOU' | 'Read-only';
type BoardProfileOption = { id: string; label: string };
type DrawPoint = { x: number; y: number };
type DrawStroke = DrawPoint[];
type DrawQualityPreset = 'fast' | 'balanced' | 'detail';
type DrawTuning = {
  maxDim: number;
  blurKsize: number;
  cannyLow: number;
  cannyHigh: number;
  minPerimeterPx: number;
  approxEpsilonFrac: number;
  maxContours: number;
  padding: number;
  simplifyEpsilon: number;
  minStep: number;
};

const CONTROL_TOKEN_KEY = "ur_control_token";
const DEFAULT_CHESS_BLOCK_SQUARE = "A2";
const DRAW_TUNING_PRESETS: Record<DrawQualityPreset, DrawTuning> = {
  fast: {
    maxDim: 768,
    blurKsize: 5,
    cannyLow: 70,
    cannyHigh: 180,
    minPerimeterPx: 24,
    approxEpsilonFrac: 0.018,
    maxContours: 500,
    padding: 0.08,
    simplifyEpsilon: 0.003,
    minStep: 0.0015,
  },
  balanced: {
    maxDim: 1024,
    blurKsize: 5,
    cannyLow: 60,
    cannyHigh: 170,
    minPerimeterPx: 16,
    approxEpsilonFrac: 0.01,
    maxContours: 1200,
    padding: 0.08,
    simplifyEpsilon: 0.0018,
    minStep: 0.0008,
  },
  detail: {
    maxDim: 1400,
    blurKsize: 3,
    cannyLow: 45,
    cannyHigh: 150,
    minPerimeterPx: 10,
    approxEpsilonFrac: 0.006,
    maxContours: 2400,
    padding: 0.06,
    simplifyEpsilon: 0.0012,
    minStep: 0.0005,
  },
};

function getControlToken() {
  try { return localStorage.getItem(CONTROL_TOKEN_KEY); } catch { return null; }
}

function setControlToken(token: string | null) {
  try {
    if (token) localStorage.setItem(CONTROL_TOKEN_KEY, token);
    else localStorage.removeItem(CONTROL_TOKEN_KEY);
  } catch {}
}

function withControlHeaders(headers?: HeadersInit) {
  const token = getControlToken();
  if (!token) return headers;
  return { ...(headers || {}), "x-control-token": token };
}

// POST helper.
async function postJSON<T>(url: string, body?: unknown, headers?: HeadersInit): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: withControlHeaders(body ? { "Content-Type": "application/json", ...(headers || {}) } : headers),
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: Record<string, unknown>;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok) {
    const message = String(data?.error || data?.message || `HTTP ${res.status}`);
    throw new Error(message);
  }
  return data as T;
}

function isChessSquare(square: string) {
  return /^[A-H][1-8]$/i.test(square.trim());
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toFiniteNumber(value: string, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatDurationMs(ms: number) {
  const totalSec = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [mode, setMode] = useState<GameMode>('Chess');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("Disconnected");
  const [robotState, setRobotState] = useState<RobotState>('Idle');
  const [controlStatus, setControlStatus] = useState<ControlStatus>('Read-only');
  const [selectedSquare, setSelectedSquare] = useState<string>(DEFAULT_CHESS_BLOCK_SQUARE);
  const [targetSquare, setTargetSquare] = useState<string>(DEFAULT_CHESS_BLOCK_SQUARE);
  const [lastCommand, setLastCommand] = useState<string>(`moveJ → ${DEFAULT_CHESS_BLOCK_SQUARE}`);
  const [feedbackMessage, setFeedbackMessage] = useState<string>('Ready');
  const [dryRun, setDryRun] = useState(true);
  const [chessBlockSquare, setChessBlockSquare] = useState<string | null>(DEFAULT_CHESS_BLOCK_SQUARE);
  const [boardProfile, setBoardProfile] = useState<string>("table_front");
  const [boardProfileOptions, setBoardProfileOptions] = useState<BoardProfileOption[]>([]);
  const [tttBoard, setTttBoard] = useState<Array<'X' | 'O' | null>>(Array(9).fill(null));
  const [tttPlayer, setTttPlayer] = useState<'X' | 'O'>('X');
  const [tttWinner, setTttWinner] = useState<'X' | 'O' | 'Draw' | null>(null);
  const [lastMovedSquare, setLastMovedSquare] = useState<string | null>(null);
  const [drawImageDataUrl, setDrawImageDataUrl] = useState<string | null>(null);
  const [drawPreviewStrokes, setDrawPreviewStrokes] = useState<DrawStroke[]>([]);
  const [drawStrokeCount, setDrawStrokeCount] = useState<number>(0);
  const [drawPointCount, setDrawPointCount] = useState<number>(0);
  const [drawPathLengthM, setDrawPathLengthM] = useState<number>(0);
  const [drawEtaMs, setDrawEtaMs] = useState<number>(0);
  const [drawEtaRemainingMs, setDrawEtaRemainingMs] = useState<number>(0);
  const [drawEtaEndAtMs, setDrawEtaEndAtMs] = useState<number | null>(null);
  const [drawEtaStartedAtMs, setDrawEtaStartedAtMs] = useState<number | null>(null);
  const [drawProfile, setDrawProfile] = useState<string>("wall_default");
  const [drawProfileOptions, setDrawProfileOptions] = useState<BoardProfileOption[]>([]);
  const [drawPreset, setDrawPreset] = useState<DrawQualityPreset>("balanced");
  const [drawImageFileName, setDrawImageFileName] = useState<string>("");
  const [drawTuning, setDrawTuning] = useState<DrawTuning>({ ...DRAW_TUNING_PRESETS.balanced });
  const [drawContourMode, setDrawContourMode] = useState<string>("n/a");
  const [drawSafetyOk, setDrawSafetyOk] = useState<boolean>(true);
  const [drawSafetyViolations, setDrawSafetyViolations] = useState<string[]>([]);
  const [showDrawAdvanced, setShowDrawAdvanced] = useState<boolean>(false);
  const [pendingCommandLabel, setPendingCommandLabel] = useState<string | null>(null);
  const [pendingCommandStartedAtMs, setPendingCommandStartedAtMs] = useState<number | null>(null);
  const [pendingCommandElapsedMs, setPendingCommandElapsedMs] = useState<number>(0);
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1400
  );
  const drawFileInputRef = useRef<HTMLInputElement | null>(null);
  const boardSize = mode === 'Chess' ? 8 : mode === 'Tic-Tac-Toe' ? 3 : 0;
  const isReadOnly = controlStatus === 'Read-only';
  const blockIsHeld = chessBlockSquare === null;
  const chessBlockLabel = chessBlockSquare ?? "Held by robot";
  const isDispatching = pendingCommandLabel !== null;
  const controlsBusy = robotState === "Moving" || isDispatching;
  const executionStateLabel = isDispatching ? "Dispatching" : robotState;
  const splitWorkspace = viewportWidth >= 1220;
  const twoColControls = viewportWidth >= 980;
  const boardViewportSize =
    mode === "Chess" || mode === "Whiteboard"
      ? "clamp(320px, 46vh, 500px)"
      : "clamp(260px, 38vh, 380px)";

  useEffect(() => {
    if (mode === 'Chess') {
      const defaultSquare = chessBlockSquare ?? DEFAULT_CHESS_BLOCK_SQUARE;
      setSelectedSquare(defaultSquare);
      setTargetSquare(defaultSquare);
    } else if (mode === 'Tic-Tac-Toe') {
      setSelectedSquare('1');
      setTargetSquare('1');
    }
  }, [mode]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleSquareClick = (row: number, col: number) => {
    const square = mode === 'Chess' 
      ? `${String.fromCharCode(65 + col)}${8 - row}`
      : `${row * 3 + col + 1}`;
    setSelectedSquare(square);
    setTargetSquare(square);
  };

  const handlePawnDragStart = (e: DragEvent, fromSquare: string) => {
    e.dataTransfer.setData("text/plain", fromSquare);
    e.dataTransfer.effectAllowed = "move";
  };

  const handlePawnDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handlePawnDrop = (e: DragEvent, toSquare: string) => {
    e.preventDefault();
    if (mode !== "Chess" || isReadOnly || blockIsHeld) return;
    const from = e.dataTransfer.getData("text/plain");
    if (!isChessSquare(from) || !isChessSquare(toSquare)) return;
    setChessBlockSquare(toSquare);
    setSelectedSquare(toSquare);
    setTargetSquare(toSquare);
    setFeedbackMessage(`Pawn moved on UI: ${from} -> ${toSquare}`);
  };

  //Check Tic-Tac-Toe winner.
  const checkTttWinner = (board: Array<'X' | 'O' | null>) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ];
    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return board.every((v) => v) ? 'Draw' : null;
  };

  const handleMoveToSquare = async () => {
    try {
      const raw = targetSquare.trim();
      const sq = mode === 'Chess' ? raw.toUpperCase() : raw;
      const dispatchLabel = mode === "Chess" ? `Move to ${sq}` : `Move to ${sq}`;
      setLastCommand(`moveJ → ${sq}`);
      setFeedbackMessage(`Sending move(${sq})...`);

      const endpoint = mode === 'Chess'
        ? `/api/moveSquare/${encodeURIComponent(sq)}`
        : `/api/ttt/move/${encodeURIComponent(sq)}`;
      beginDispatch(dispatchLabel);
      const data = await postJSON<any>(`${endpoint}?dryRun=${dryRun ? 1 : 0}`);

      setSelectedSquare(sq);
      if (mode === "Chess" && !data.dryRun) {
        setLastMovedSquare(sq);
      }
      setFeedbackMessage(data.dryRun ? `Dry-run ON: command generated only (robot will not move)` : `Sent: ${data.script}`);
    } catch (error) {
      setFeedbackMessage(`error: ${getErrorMessage(error)}`);
    } finally {
      endDispatch();
    }
  };

  const handleTttMark = async () => {
    try {
      if (tttWinner) {
        setFeedbackMessage(`Game over: ${tttWinner}`);
        return;
      }

      const raw = selectedSquare.trim();
      const idx = parseInt(raw, 10) - 1;
      if (Number.isNaN(idx) || idx < 0 || idx > 8) {
        setFeedbackMessage("error: invalid square (1-9)");
        return;
      }
      if (tttBoard[idx]) {
        setFeedbackMessage("error: square already marked");
        return;
      }

      setLastCommand(`mark ${tttPlayer} → ${raw}`);
      setFeedbackMessage(`Sending mark(${raw})...`);
      beginDispatch(`Mark ${tttPlayer} at ${raw}`);

      const data = await postJSON<any>(
        `/api/ttt/mark/${encodeURIComponent(raw)}?dryRun=${dryRun ? 1 : 0}`,
        { symbol: tttPlayer },
      );

      const nextBoard = [...tttBoard];
      nextBoard[idx] = tttPlayer;
      setTttBoard(nextBoard);
      const winner = checkTttWinner(nextBoard);
      setTttWinner(winner);
      if (!winner) setTttPlayer(tttPlayer === 'X' ? 'O' : 'X');

      setFeedbackMessage(data.dryRun ? `Dry-run ON: mark script generated only (robot will not move)` : `Marked ${data.symbol || tttPlayer} at ${raw}`);
    } catch (error) {
      setFeedbackMessage(`error: ${getErrorMessage(error)}`);
    } finally {
      endDispatch();
    }
  };

  const handleTttReset = () => {
    setTttBoard(Array(9).fill(null));
    setTttPlayer('X');
    setTttWinner(null);
    setFeedbackMessage("Tic-Tac-Toe reset");
  };

  const beginDispatch = (label: string) => {
    setPendingCommandLabel(label);
    const started = Date.now();
    setPendingCommandStartedAtMs(started);
    setPendingCommandElapsedMs(0);
  };

  const endDispatch = () => {
    setPendingCommandLabel(null);
    setPendingCommandStartedAtMs(null);
    setPendingCommandElapsedMs(0);
  };

  const handlePick = async () => {
    try {
      const sq = targetSquare.trim().toUpperCase();
      if (!isChessSquare(sq)) {
        setFeedbackMessage("error: invalid chess square");
        return;
      }
      if (blockIsHeld) {
        setFeedbackMessage("error: block already held by robot. Place it first.");
        return;
      }
      if (chessBlockSquare && sq !== chessBlockSquare) {
        setFeedbackMessage(`error: block is currently at ${chessBlockSquare}`);
        return;
      }
      if (!dryRun && lastMovedSquare !== sq) {
        setFeedbackMessage(`error: move robot to ${sq} first, then press Pick`);
        return;
      }

      setLastCommand(`pick → ${sq}`);
      setFeedbackMessage(`Sending pick(${sq})...`);
      beginDispatch(`Pick at ${sq}`);

      const data = await postJSON<any>(`/api/pick/${encodeURIComponent(sq)}?dryRun=${dryRun ? 1 : 0}`);
      if (!data.dryRun) {
        setChessBlockSquare(null);
      }

      setFeedbackMessage(data.dryRun ? `Dry-run OK: ${data.script}` : `Suction ON at ${data.target} (block held)`);
    } catch (error) {
      setFeedbackMessage(`error: ${getErrorMessage(error)}`);
    } finally {
      endDispatch();
    }
  };

  const handlePlace = async () => {
    try {
      const sq = targetSquare.trim().toUpperCase();
      if (!isChessSquare(sq)) {
        setFeedbackMessage("error: invalid chess square");
        return;
      }
      if (!blockIsHeld) {
        setFeedbackMessage(`error: block is on board at ${chessBlockSquare}. Pick it first.`);
        return;
      }
      if (!dryRun && lastMovedSquare !== sq) {
        setFeedbackMessage(`error: move robot to ${sq} first, then press Place`);
        return;
      }

      setLastCommand(`place → ${sq}`);
      setFeedbackMessage(`Sending place(${sq})...`);
      beginDispatch(`Place at ${sq}`);

      const data = await postJSON<any>(`/api/place/${encodeURIComponent(sq)}?dryRun=${dryRun ? 1 : 0}`);
      if (!data.dryRun) {
        setChessBlockSquare(sq);
        setSelectedSquare(sq);
        setTargetSquare(sq);
      }

      setFeedbackMessage(data.dryRun ? `Dry-run OK: ${data.script}` : `Suction OFF at ${data.target}`);
    } catch (error) {
      setFeedbackMessage(`error: ${getErrorMessage(error)}`);
    } finally {
      endDispatch();
    }
  };

  const handleHome = async () => {
    try {
      setLastCommand("home");
      setFeedbackMessage("Sending home...");
      beginDispatch("Home");

      const data = await postJSON<any>(`/api/home?dryRun=${dryRun ? 1 : 0}`);

      setFeedbackMessage(data.dryRun ? `Dry-run OK: ${data.script}` : "Home sent");
    } catch (error) {
      setFeedbackMessage(`error: ${getErrorMessage(error)}`);
    } finally {
      endDispatch();
    }
  };

  const handleDrawImageUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const isSvg = file.type.includes("svg") || file.name.toLowerCase().endsWith(".svg");
      if (isSvg) {
        setFeedbackMessage("error: SVG input is disabled. Please upload a PNG/JPG image.");
        return;
      }
      const dataUrl = await fileToDataUrl(file);
      setDrawImageDataUrl(dataUrl);
      setDrawImageFileName(file.name);
      setFeedbackMessage(`Loaded image: ${file.name}`);
    } catch (error) {
      setFeedbackMessage(`error: ${getErrorMessage(error)}`);
    }
  };

  const applyDrawPreset = (preset: DrawQualityPreset) => {
    setDrawPreset(preset);
    setDrawTuning({ ...DRAW_TUNING_PRESETS[preset] });
    setFeedbackMessage(`Draw tuning preset applied: ${preset}`);
  };

  const setDrawTuningField = (key: keyof DrawTuning, value: string) => {
    setDrawTuning((prev) => ({
      ...prev,
      [key]: toFiniteNumber(value, prev[key]),
    }));
  };

  const buildDrawPayload = () => {
    const common = {
      padding: drawTuning.padding,
      simplifyEpsilon: drawTuning.simplifyEpsilon,
      minStep: drawTuning.minStep,
    };

    if (!drawImageDataUrl) return null;
    return {
      ...common,
      imageDataUrl: drawImageDataUrl,
      vectorize: {
        maxDim: drawTuning.maxDim,
        blurKsize: drawTuning.blurKsize,
        cannyLow: drawTuning.cannyLow,
        cannyHigh: drawTuning.cannyHigh,
        minPerimeterPx: drawTuning.minPerimeterPx,
        approxEpsilonFrac: drawTuning.approxEpsilonFrac,
        maxContours: drawTuning.maxContours,
        externalOnly: false,
        outlineBinary: true,
      },
    };
  };

  const handleDrawPreview = async () => {
    try {
      setLastCommand("draw preview");
      setFeedbackMessage("Planning drawing preview...");
      const payload = buildDrawPayload();
      if (!payload) {
        setFeedbackMessage("error: load an image first");
        return;
      }
      beginDispatch("Plan preview");
      const data = await postJSON<any>("/api/draw/preview", payload);
      const strokes = Array.isArray(data?.plan?.strokesNormalized) ? data.plan.strokesNormalized : [];
      setDrawPreviewStrokes(strokes);
      setDrawStrokeCount(Number(data?.plan?.strokeCount || 0));
      setDrawPointCount(Number(data?.plan?.pointCount || 0));
      setDrawPathLengthM(Number(data?.safety?.observed?.pathLengthM || 0));
      setDrawEtaMs(Number(data?.eta?.durationMs || 0));
      setDrawContourMode(String(data?.plan?.vectorization?.contourMode || "n/a"));
      setDrawSafetyOk(Boolean(data?.safety?.ok ?? true));
      setDrawSafetyViolations(Array.isArray(data?.safety?.violations) ? data.safety.violations : []);
      if (data?.profile) setDrawProfile(String(data.profile));
      setFeedbackMessage(
        `Preview ready: ${Number(data?.plan?.strokeCount || 0)} strokes, ` +
        `${Number(data?.safety?.observed?.pathLengthM || 0).toFixed(2)} m path, ` +
        `eta=${formatDurationMs(Number(data?.eta?.durationMs || 0))}, mode=${String(data?.plan?.vectorization?.contourMode || "n/a")}`
      );
    } catch (error) {
      setFeedbackMessage(`error: ${getErrorMessage(error)}`);
    } finally {
      endDispatch();
    }
  };

  const handleDrawExecute = async () => {
    try {
      setLastCommand("draw execute");
      setFeedbackMessage("Sending drawing program...");
      const payload = buildDrawPayload();
      if (!payload) {
        setFeedbackMessage("error: load an image first");
        return;
      }
      beginDispatch("Execute draw");
      const data = await postJSON<any>(`/api/draw/execute?dryRun=${dryRun ? 1 : 0}`, payload);
      const strokes = Array.isArray(data?.plan?.strokesNormalized) ? data.plan.strokesNormalized : [];
      setDrawPreviewStrokes(strokes);
      setDrawStrokeCount(Number(data?.plan?.strokeCount || 0));
      setDrawPointCount(Number(data?.plan?.pointCount || 0));
      setDrawPathLengthM(Number(data?.safety?.observed?.pathLengthM || 0));
      const etaMs = Number(data?.eta?.durationMs || 0);
      setDrawEtaMs(etaMs);
      setDrawContourMode(String(data?.plan?.vectorization?.contourMode || "n/a"));
      setDrawSafetyOk(Boolean(data?.safety?.ok ?? true));
      setDrawSafetyViolations(Array.isArray(data?.safety?.violations) ? data.safety.violations : []);
      if (data?.profile) setDrawProfile(String(data.profile));
      if (!data?.dryRun && etaMs > 0) {
        const now = Date.now();
        setDrawEtaStartedAtMs(now);
        setDrawEtaEndAtMs(now + etaMs);
        setDrawEtaRemainingMs(etaMs);
      } else if (data?.dryRun) {
        setDrawEtaEndAtMs(null);
        setDrawEtaRemainingMs(0);
        setDrawEtaStartedAtMs(null);
      }
      setFeedbackMessage(
        data?.dryRun
          ? `Dry-run ON: drawing script generated only (ETA ${formatDurationMs(etaMs)})`
          : `Drawing script sent (ETA ${formatDurationMs(etaMs)})`,
      );
    } catch (error) {
      setFeedbackMessage(`error: ${getErrorMessage(error)}`);
    } finally {
      endDispatch();
    }
  };

  const handleDrawStop = async () => {
    try {
      setLastCommand("draw stop");
      setFeedbackMessage("Sending stop...");
      beginDispatch("Stop draw");
      const data = await postJSON<any>(`/api/draw/stop?dryRun=${dryRun ? 1 : 0}`);
      setDrawEtaEndAtMs(null);
      setDrawEtaRemainingMs(0);
      setDrawEtaStartedAtMs(null);
      setFeedbackMessage(data?.dryRun ? "Dry-run ON: stop script generated only" : "Stop sent");
    } catch (error) {
      setFeedbackMessage(`error: ${getErrorMessage(error)}`);
    } finally {
      endDispatch();
    }
  };

  const refreshDrawProfiles = async () => {
    try {
      const res = await fetch("/api/draw/profiles", { cache: "no-store", headers: withControlHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDrawProfile(String(data.active || "wall_default"));
      setDrawProfileOptions(Array.isArray(data.available) ? data.available : []);
    } catch (error) {
      setFeedbackMessage((msg) => (msg.startsWith("error:") ? msg : `error: ${getErrorMessage(error)}`));
    }
  };

  const handleDrawProfileChange = async (profileId: string) => {
    try {
      const data = await postJSON<any>(`/api/draw/profile/${encodeURIComponent(profileId)}`);
      setDrawProfile(String(data.active || profileId));
      setDrawProfileOptions(Array.isArray(data.available) ? data.available : []);
      setFeedbackMessage(`Draw profile set to ${String(data.active || profileId)}`);
    } catch (error) {
      setFeedbackMessage(`error: ${getErrorMessage(error)}`);
    }
  };

  const refreshBoardProfiles = async () => {
    try {
      const res = await fetch("/api/board/profiles", { cache: "no-store", headers: withControlHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBoardProfile(String(data.active || "table_front"));
      setBoardProfileOptions(Array.isArray(data.available) ? data.available : []);
    } catch (error) {
      setFeedbackMessage((msg) => (msg.startsWith("error:") ? msg : `error: ${getErrorMessage(error)}`));
    }
  };

  const handleBoardProfileChange = async (profileId: string) => {
    try {
      const data = await postJSON<any>(`/api/board/profile/${encodeURIComponent(profileId)}`);
      setBoardProfile(String(data.active || profileId));
      setBoardProfileOptions(Array.isArray(data.available) ? data.available : []);
      setFeedbackMessage(`Board profile set to ${String(data.active || profileId)}`);
    } catch (error) {
      setFeedbackMessage(`error: ${getErrorMessage(error)}`);
    }
  };

  const acquireControl = async () => {
    try {
      const data = await postJSON<any>("/api/lock/acquire");
      setControlToken(data.token);
      setControlStatus("YOU");
      setFeedbackMessage("Control acquired");
    } catch (error) {
      setControlStatus("Read-only");
      setFeedbackMessage(`error: ${getErrorMessage(error)}`);
    }
  };

  const releaseControl = async () => {
    try {
      await postJSON<any>("/api/lock/release");
    } catch {}
    setControlToken(null);
    setControlStatus("Read-only");
    setFeedbackMessage("Control released");
  };

  type StatusResponse = {
    ok: boolean;
    connection: ConnectionStatus | string;
    robotState: RobotState | string;
    lastAction?: string | null;
    lastTarget?: string | null;
    boardProfile?: string;
    lock?: { held: boolean; yours: boolean; expiresInMs: number };
  };

  useEffect(() => {
    const token = getControlToken();
    if (token) {
      postJSON<any>("/api/lock/acquire").catch(() => {});
    } else {
      acquireControl();
    }
    refreshBoardProfiles();
    refreshDrawProfiles();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store", headers: withControlHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: StatusResponse = await res.json();

        if (cancelled) return;

        setConnectionStatus(data.connection === "Connected" ? "Connected" : "Disconnected");
        setRobotState(data.robotState === "Moving" ? "Moving" : "Idle");
        if (data.boardProfile) setBoardProfile(String(data.boardProfile));
        if (data.lock) {
          setControlStatus(data.lock.yours ? "YOU" : "Read-only");
        }
        if (data.lastAction && data.lastTarget) {
          const action = String(data.lastAction);
          const target = String(data.lastTarget);
          if (action === "tttMove" || action === "moveSquare") {
            setLastMovedSquare(target);
          }
        }
      } catch {
        if (!cancelled) setConnectionStatus("Disconnected");
      }
    };

    tick();
    const id = setInterval(tick, 400);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!pendingCommandStartedAtMs) {
      setPendingCommandElapsedMs(0);
      return;
    }
    const tick = () => setPendingCommandElapsedMs(Date.now() - pendingCommandStartedAtMs);
    tick();
    const id = setInterval(tick, 120);
    return () => clearInterval(id);
  }, [pendingCommandStartedAtMs]);

  useEffect(() => {
    if (!drawEtaEndAtMs) {
      setDrawEtaRemainingMs(0);
      return;
    }

    const tick = () => {
      const remain = Math.max(0, drawEtaEndAtMs - Date.now());
      setDrawEtaRemainingMs(remain);
      if (remain <= 0) {
        setDrawEtaEndAtMs(null);
        setDrawEtaStartedAtMs(null);
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [drawEtaEndAtMs]);

  useEffect(() => {
    if (!drawEtaEndAtMs || !drawEtaStartedAtMs) return;
    const elapsed = Date.now() - drawEtaStartedAtMs;
    if (robotState === "Idle" && elapsed > 2000) {
      setDrawEtaEndAtMs(null);
      setDrawEtaRemainingMs(0);
      setDrawEtaStartedAtMs(null);
    }
  }, [robotState, drawEtaEndAtMs, drawEtaStartedAtMs]);

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <header className="h-16 bg-slate-800 text-white px-6 flex items-center justify-between border-b-2 border-slate-700">
        <h1 className="text-xl">UR Robot Web Control</h1>
        
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-300">Status:</span>
            <Badge 
              variant={connectionStatus === 'Connected' ? 'default' : 'destructive'}
              className={connectionStatus === 'Connected' 
                ? 'bg-emerald-600 hover:bg-emerald-700' 
                : 'bg-red-600 hover:bg-red-700'}
            >
              {connectionStatus}
            </Badge>
            <Badge
              className={
                isDispatching
                  ? "bg-amber-600 hover:bg-amber-700"
                  : robotState === "Moving"
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }
            >
              {isDispatching ? `Dispatching ${formatDurationMs(pendingCommandElapsedMs)}` : robotState}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${
            dryRun ? "text-emerald-400" : "text-red-400"
          }`}>
            Dry Run: {dryRun ? "ON (Safe)" : "OFF (Live Robot)"}
          </span>
          <Switch checked={dryRun} onCheckedChange={setDryRun} />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-300">Control:</span>
            <Badge 
              variant={controlStatus === 'YOU' ? 'default' : 'secondary'}
              className={controlStatus === 'YOU' 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-slate-500 hover:bg-slate-600'}
            >
              {controlStatus === 'YOU' ? 'You (Locked)' : 'Read-only'}
            </Badge>
            {controlStatus === 'YOU' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={releaseControl}
                className="border-slate-500 text-slate-200 hover:bg-slate-700"
              >
                Release
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={acquireControl}
                className="border-slate-500 text-slate-200 hover:bg-slate-700"
              >
                Request Control
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-300">Mode:</span>
            <div className="flex gap-1">
              <Button
                variant={mode === 'Chess' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('Chess')}
                className={mode === 'Chess' 
                  ? 'bg-slate-600 hover:bg-slate-700' 
                  : 'border-slate-500 text-slate-200 hover:bg-slate-700'}
              >
                Chess
              </Button>
              <Button
                variant={mode === 'Tic-Tac-Toe' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('Tic-Tac-Toe')}
                className={mode === 'Tic-Tac-Toe' 
                  ? 'bg-slate-600 hover:bg-slate-700' 
                  : 'border-slate-500 text-slate-200 hover:bg-slate-700'}
              >
                Tic-Tac-Toe
              </Button>
              <Button
                variant={mode === 'Whiteboard' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('Whiteboard')}
                className={mode === 'Whiteboard'
                  ? 'bg-slate-600 hover:bg-slate-700'
                  : 'border-slate-500 text-slate-200 hover:bg-slate-700'}
              >
                Whiteboard
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div
          className="flex-1 min-h-0 grid gap-3 p-3 bg-slate-100 overflow-hidden"
          style={{
            gridTemplateColumns: splitWorkspace
              ? "minmax(300px,1fr) minmax(360px,500px)"
              : "1fr",
            gridTemplateRows: "1fr",
          }}
        >
          <div className="min-h-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div 
                className={`shadow-lg ${mode === 'Chess' ? 'bg-white border-4 border-slate-700' : mode === 'Tic-Tac-Toe' ? 'bg-white border-4 border-slate-700 p-3' : 'bg-white border-4 border-slate-700 p-2'}`}
                style={{
                  width: boardViewportSize,
                  height: boardViewportSize,
                }}
              >
                {mode === 'Chess' ? (
                  <div
                    className="grid h-full"
                    style={{ gridTemplateColumns: "repeat(8, 1fr)", gridTemplateRows: "repeat(8, 1fr)" }}
                  >
                      {Array.from({ length: 64 }).map((_, index) => {
                        const row = Math.floor(index / 8);
                        const col = index % 8;
                        const isLight = (row + col) % 2 === 0;
                        const squareLabel = `${String.fromCharCode(65 + col)}${8 - row}`;
                        const isSelected = squareLabel === selectedSquare;
                        const hasChessBlock = squareLabel === chessBlockSquare;

                        return (
                          <button
                            key={index}
                            onClick={() => handleSquareClick(row, col)}
                            onDragOver={handlePawnDragOver}
                            onDrop={(e) => handlePawnDrop(e, squareLabel)}
                            className={`
                              w-full h-full flex items-center justify-center relative transition-all duration-200 border border-slate-300
                              ${isLight ? 'bg-slate-200' : 'bg-slate-400'}
                              ${isSelected ? 'ring-4 ring-blue-500 ring-inset z-10' : ''}
                              ${!isReadOnly ? 'hover:ring-2 hover:ring-blue-300 hover:ring-inset cursor-pointer' : 'cursor-not-allowed'}
                            `}
                            disabled={isReadOnly}
                          >
                            {hasChessBlock && (
                              <img
                                src={pawnImage}
                                alt="Chess pawn"
                                title="Test pawn"
                                className="w-[10%] h-[10%] object-contain drop-shadow-sm cursor-grab active:cursor-grabbing"
                                draggable={!isReadOnly && !blockIsHeld}
                                onDragStart={(e) => handlePawnDragStart(e, squareLabel)}
                              />
                            )}
                            <span
                              className="text-xs font-semibold absolute top-1 left-1.5 px-1 rounded-sm"
                              style={{
                                zIndex: 20,
                                color: isLight ? "#334155" : "#334155",
                                background: isLight ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.18)",
                              }}
                            >
                              {squareLabel}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                ) : mode === 'Tic-Tac-Toe' ? (
                  <div
                    className="grid h-full"
                    style={{
                      gridTemplateColumns: `repeat(${boardSize}, 1fr)`,
                      gridTemplateRows: `repeat(${boardSize}, 1fr)`,
                    }}
                  >
                    {Array.from({ length: boardSize * boardSize }).map((_, index) => {
                      const row = Math.floor(index / boardSize);
                      const col = index % boardSize;
                      const isLight = (row + col) % 2 === 0;
                      const squareLabel = `${index + 1}`;
                      const isSelected = squareLabel === selectedSquare;
                      const tttIndex = row * 3 + col;
                      const tttValue = tttBoard[tttIndex];

                      return (
                        <button
                          key={index}
                          onClick={() => handleSquareClick(row, col)}
                          className={`
                            w-full h-full flex items-center justify-center border border-slate-300
                            transition-all duration-200 relative
                            ${isLight ? 'bg-slate-200' : 'bg-slate-400'}
                            ${isSelected ? 'ring-4 ring-blue-500 ring-inset z-10' : ''}
                            ${!isReadOnly ? 'hover:ring-2 hover:ring-blue-300 hover:ring-inset cursor-pointer' : 'cursor-not-allowed'}
                          `}
                          disabled={isReadOnly}
                        >
                          <span className="text-4xl font-bold text-slate-800">
                            {tttValue || ''}
                          </span>
                          <span className={`
                            text-xs absolute top-1 left-1.5
                            ${isLight ? 'text-slate-500' : 'text-slate-700'}
                          `}>
                            {squareLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-full w-full bg-white border border-slate-300">
                    <svg viewBox="0 0 1 1" className="h-full w-full">
                      <rect x="0" y="0" width="1" height="1" fill="#ffffff" />
                      {drawPreviewStrokes.map((stroke, idx) => (
                        <polyline
                          key={idx}
                          points={stroke.map((p) => `${p.x},${p.y}`).join(" ")}
                          fill="none"
                          stroke="#0f172a"
                          strokeWidth="0.004"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                    </svg>
                  </div>
                )}
              </div>

              {mode !== 'Whiteboard' && (
                <div className="text-sm text-slate-700 bg-white px-4 py-2 rounded shadow">
                  Selected Square: <span className="font-bold text-blue-700">{selectedSquare}</span>
                </div>
              )}
              {mode === 'Chess' && (
                <div className="text-sm text-slate-700 bg-white px-4 py-2 rounded shadow">
                  Test Block: <span className={`font-bold ${blockIsHeld ? 'text-amber-700' : 'text-emerald-700'}`}>{chessBlockLabel}</span>
                </div>
              )}
              {mode === 'Tic-Tac-Toe' && (
                <div className="text-sm text-slate-700 bg-white px-4 py-2 rounded shadow">
                  {tttWinner
                    ? `Winner: ${tttWinner}`
                    : `Current Player: ${tttPlayer}`}
                </div>
              )}
              {mode === 'Whiteboard' && (
                <div className="text-sm text-slate-700 bg-white px-4 py-2 rounded shadow">
                  Drawing Preview: <span className="font-bold text-blue-700">{drawStrokeCount} strokes / {drawPointCount} points</span>
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto bg-slate-200 border border-slate-300 rounded-lg px-4 py-4">
            <h3 className="text-sm mb-2 text-slate-800">Command Controls</h3>
            
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge
                className={
                  executionStateLabel === "Dispatching"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : executionStateLabel === "Moving"
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }
              >
                {executionStateLabel}
              </Badge>
              {isDispatching ? (
                <div className="text-xs text-slate-700">
                  Sending: <span className="font-semibold">{pendingCommandLabel}</span> ({formatDurationMs(pendingCommandElapsedMs)})
                </div>
              ) : (
                <div className="text-xs text-slate-600">Ready for next command</div>
              )}
            </div>

            {mode === 'Chess' ? (
              <div
                className="mb-4 grid gap-4"
                style={{ gridTemplateColumns: twoColControls ? "repeat(2, minmax(0, 1fr))" : "1fr" }}
              >
                <Card className="p-3 bg-white border-slate-300 shadow-sm">
                  <div className="text-sm text-slate-600 mb-2">Target</div>
                  <Input
                    value={targetSquare}
                    onChange={(e) => setTargetSquare(e.target.value.toUpperCase())}
                    className="w-24 bg-white border-slate-300 text-center"
                    disabled={isReadOnly}
                    placeholder="A2"
                  />
                  <div className="mt-3 text-xs text-slate-600">
                    Selected: <span className="font-semibold text-slate-800">{selectedSquare}</span>
                  </div>
                </Card>

                <Card className="p-3 bg-white border-slate-300 shadow-sm">
                  <div className="text-sm text-slate-600 mb-3">Navigation</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={handleMoveToSquare}
                      disabled={isReadOnly || controlsBusy}
                      className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                      Move to Square
                    </Button>
                    <Button
                      onClick={handleHome}
                      disabled={isReadOnly || controlsBusy}
                      className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                      Home
                    </Button>
                  </div>
                </Card>

                <Card
                  className="p-3 bg-white border-slate-300 shadow-sm"
                  style={twoColControls ? { gridColumn: "1 / -1" } : undefined}
                >
                  <div className="text-sm text-slate-600 mb-3">Piece Actions</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={handlePick}
                      disabled={
                        isReadOnly ||
                        controlsBusy ||
                        blockIsHeld ||
                        targetSquare.trim().toUpperCase() !== chessBlockSquare ||
                        (!dryRun && lastMovedSquare !== targetSquare.trim().toUpperCase())
                      }
                      className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                      Pick
                    </Button>
                    <Button
                      onClick={handlePlace}
                      disabled={
                        isReadOnly ||
                        controlsBusy ||
                        !blockIsHeld ||
                        !isChessSquare(targetSquare) ||
                        (!dryRun && lastMovedSquare !== targetSquare.trim().toUpperCase())
                      }
                      className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                      Place
                    </Button>
                  </div>
                  <div className="mt-3 text-xs text-slate-600">
                    Block: <span className={`font-semibold ${blockIsHeld ? 'text-amber-700' : 'text-emerald-700'}`}>{chessBlockLabel}</span>
                  </div>
                </Card>
              </div>
            ) : mode === 'Tic-Tac-Toe' ? (
              <div
                className="mb-4 grid gap-4"
                style={{ gridTemplateColumns: twoColControls ? "repeat(2, minmax(0, 1fr))" : "1fr" }}
              >
                <Card className="p-3 bg-white border-slate-300 shadow-sm">
                  <div className="text-sm text-slate-600 mb-2">Target</div>
                  <Input
                    value={targetSquare}
                    onChange={(e) => setTargetSquare(e.target.value)}
                    className="w-24 bg-white border-slate-300 text-center"
                    disabled={isReadOnly}
                    placeholder="1"
                  />
                  <div className="mt-3 text-xs text-slate-600">
                    Current turn: <span className="font-semibold text-slate-800">{tttPlayer}</span>
                  </div>
                </Card>

                <Card className="p-3 bg-white border-slate-300 shadow-sm">
                  <div className="text-sm text-slate-600 mb-3">Navigation</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={handleMoveToSquare}
                      disabled={isReadOnly || controlsBusy}
                      className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                      Move to Square
                    </Button>
                    <Button
                      onClick={handleHome}
                      disabled={isReadOnly || controlsBusy}
                      className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                      Home
                    </Button>
                  </div>
                </Card>

                <Card
                  className="p-3 bg-white border-slate-300 shadow-sm"
                  style={twoColControls ? { gridColumn: "1 / -1" } : undefined}
                >
                  <div className="text-sm text-slate-600 mb-3">Marking</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={handleTttMark}
                      disabled={
                        isReadOnly ||
                        controlsBusy ||
                        !!tttWinner ||
                        lastMovedSquare !== selectedSquare
                      }
                      className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                      Mark ({tttPlayer})
                    </Button>
                    <Button
                      onClick={handleTttReset}
                      disabled={isReadOnly || isDispatching}
                      className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                      Reset
                    </Button>
                  </div>
                  <div className="mt-3 text-xs text-slate-600">
                    {tttWinner ? `Winner: ${tttWinner}` : `Waiting on square ${selectedSquare}`}
                  </div>
                </Card>
              </div>
            ) : (
              <div
                className="mb-4 grid gap-4"
                style={{
                  gridTemplateColumns: twoColControls
                    ? "minmax(0,0.95fr) minmax(0,1.05fr)"
                    : "1fr",
                }}
              >
                <div className="space-y-4 min-w-0">
                  <Card className="p-3 bg-white border-slate-300 shadow-sm">
                    <div className="text-sm text-slate-600 mb-3">Input</div>
                    <div className="flex items-center gap-2 text-sm min-w-0">
                      <label className="text-xs text-slate-600 shrink-0">Load Image</label>
                      <input
                        ref={drawFileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        disabled={isReadOnly || isDispatching}
                        onChange={(e) => {
                          handleDrawImageUpload(e.target.files?.[0] || null);
                          e.currentTarget.value = "";
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => drawFileInputRef.current?.click()}
                        disabled={isReadOnly || isDispatching}
                        className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed shrink-0"
                      >
                        Browse
                      </Button>
                      <span
                        className="text-xs text-slate-700 bg-slate-100 border border-slate-300 rounded px-2 py-1 min-w-0"
                        style={{
                          maxWidth: "220px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={drawImageFileName || "No file selected"}
                      >
                        {drawImageFileName || "No file selected"}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-2">
                      Input pipeline: <span className="font-semibold">Image vectorization (OpenCV)</span>
                    </div>
                  </Card>

                  <Card className="p-3 bg-white border-slate-300 shadow-sm">
                    <div className="text-sm text-slate-600 mb-2">Quality Preset</div>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        size="sm"
                        onClick={() => applyDrawPreset("fast")}
                        disabled={isReadOnly || controlsBusy}
                        className={
                          drawPreset === "fast"
                            ? "bg-blue-600 text-white ring-2 ring-blue-300 font-semibold hover:bg-blue-600 disabled:bg-slate-400 disabled:cursor-not-allowed"
                            : "bg-slate-200 text-slate-800 border border-slate-300 hover:bg-slate-300 disabled:bg-slate-400 disabled:cursor-not-allowed"
                        }
                      >
                        Fast
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => applyDrawPreset("balanced")}
                        disabled={isReadOnly || controlsBusy}
                        className={
                          drawPreset === "balanced"
                            ? "bg-blue-600 text-white ring-2 ring-blue-300 font-semibold hover:bg-blue-600 disabled:bg-slate-400 disabled:cursor-not-allowed"
                            : "bg-slate-200 text-slate-800 border border-slate-300 hover:bg-slate-300 disabled:bg-slate-400 disabled:cursor-not-allowed"
                        }
                      >
                        Balanced
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => applyDrawPreset("detail")}
                        disabled={isReadOnly || controlsBusy}
                        className={
                          drawPreset === "detail"
                            ? "bg-blue-600 text-white ring-2 ring-blue-300 font-semibold hover:bg-blue-600 disabled:bg-slate-400 disabled:cursor-not-allowed"
                            : "bg-slate-200 text-slate-800 border border-slate-300 hover:bg-slate-300 disabled:bg-slate-400 disabled:cursor-not-allowed"
                        }
                      >
                        Detail
                      </Button>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2">
                      <Button
                        size="sm"
                        onClick={handleDrawPreview}
                        disabled={isReadOnly || controlsBusy}
                        className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
                      >
                        Plan Preview
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleDrawExecute}
                        disabled={isReadOnly || controlsBusy}
                        className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
                      >
                        Execute Draw
                      </Button>
                      <button
                        type="button"
                        onClick={handleDrawStop}
                        disabled={isReadOnly}
                        style={{
                          width: "100%",
                          height: "32px",
                          borderRadius: "6px",
                          border: "none",
                          background: "#b91c1c",
                          color: "#ffffff",
                          fontSize: "13px",
                          fontWeight: 600,
                          opacity: isReadOnly ? 0.55 : 1,
                          cursor: isReadOnly ? "not-allowed" : "pointer",
                        }}
                        title="Stop current robot motion"
                      >
                        Stop Robot
                      </button>
                    </div>
                  </Card>
                </div>

                <Card className="p-3 bg-white border-slate-300 shadow-sm min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-slate-600">Vectorization Tuning</div>
                    <Button
                      size="sm"
                      onClick={() => setShowDrawAdvanced((v) => !v)}
                      disabled={isDispatching}
                      className="h-8 px-3 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                      {showDrawAdvanced ? "Hide" : "Show"}
                    </Button>
                  </div>
                  <div className="text-xs text-slate-600 mt-2">
                    Keep closed for normal use. Open only when refining edges/details.
                  </div>
                  {showDrawAdvanced && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-600">cannyLow</label>
                      <Input
                        type="number"
                        value={drawTuning.cannyLow}
                        onChange={(e) => setDrawTuningField("cannyLow", e.target.value)}
                        className="h-8 bg-white border-slate-300 text-xs"
                        disabled={isReadOnly || isDispatching}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-600">cannyHigh</label>
                      <Input
                        type="number"
                        value={drawTuning.cannyHigh}
                        onChange={(e) => setDrawTuningField("cannyHigh", e.target.value)}
                        className="h-8 bg-white border-slate-300 text-xs"
                        disabled={isReadOnly || isDispatching}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-600">minPerimeter</label>
                      <Input
                        type="number"
                        step="0.5"
                        value={drawTuning.minPerimeterPx}
                        onChange={(e) => setDrawTuningField("minPerimeterPx", e.target.value)}
                        className="h-8 bg-white border-slate-300 text-xs"
                        disabled={isReadOnly || isDispatching}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-600">approxEpsilon</label>
                      <Input
                        type="number"
                        step="0.001"
                        value={drawTuning.approxEpsilonFrac}
                        onChange={(e) => setDrawTuningField("approxEpsilonFrac", e.target.value)}
                        className="h-8 bg-white border-slate-300 text-xs"
                        disabled={isReadOnly || isDispatching}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-600">maxContours</label>
                      <Input
                        type="number"
                        value={drawTuning.maxContours}
                        onChange={(e) => setDrawTuningField("maxContours", e.target.value)}
                        className="h-8 bg-white border-slate-300 text-xs"
                        disabled={isReadOnly || isDispatching}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-600">maxDim</label>
                      <Input
                        type="number"
                        value={drawTuning.maxDim}
                        onChange={(e) => setDrawTuningField("maxDim", e.target.value)}
                        className="h-8 bg-white border-slate-300 text-xs"
                        disabled={isReadOnly || isDispatching}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-600">blurKsize</label>
                      <Input
                        type="number"
                        value={drawTuning.blurKsize}
                        onChange={(e) => setDrawTuningField("blurKsize", e.target.value)}
                        className="h-8 bg-white border-slate-300 text-xs"
                        disabled={isReadOnly || isDispatching}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-600">padding</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={drawTuning.padding}
                        onChange={(e) => setDrawTuningField("padding", e.target.value)}
                        className="h-8 bg-white border-slate-300 text-xs"
                        disabled={isReadOnly || isDispatching}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-600">simplifyEps</label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={drawTuning.simplifyEpsilon}
                        onChange={(e) => setDrawTuningField("simplifyEpsilon", e.target.value)}
                        className="h-8 bg-white border-slate-300 text-xs"
                        disabled={isReadOnly || isDispatching}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-600">minStep</label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={drawTuning.minStep}
                        onChange={(e) => setDrawTuningField("minStep", e.target.value)}
                        className="h-8 bg-white border-slate-300 text-xs"
                        disabled={isReadOnly || isDispatching}
                      />
                    </div>
                    </div>
                  )}
                </Card>
              </div>
            )}

            <div className="bg-slate-100 border border-slate-300 rounded px-3 py-2 text-sm min-w-0 overflow-hidden">
              <div className="text-slate-600 mb-1">Status:</div>
              <div
                className={`min-w-0 ${
                  feedbackMessage.includes('completed') || feedbackMessage === 'Ready'
                    ? 'text-emerald-700'
                    : feedbackMessage.includes('error')
                    ? 'text-red-700'
                    : 'text-blue-700'
                }`}
                style={{
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                }}
              >
                {feedbackMessage}
              </div>
            </div>
          </div>
        </div>

        <aside className="w-64 bg-slate-200 border-l border-slate-300 p-4 overflow-auto">
          <h2 className="text-base mb-4 text-slate-900">Robot Status</h2>
          
          <div className="space-y-4">
            <Card className="p-3 bg-white border-slate-300 shadow-sm">
              <div className="text-sm text-slate-600 mb-1">Connection</div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'Connected' ? 'bg-emerald-500' : 'bg-red-500'
                }`} />
                <span className="font-medium text-slate-900">{connectionStatus}</span>
              </div>
            </Card>

            <Card className="p-3 bg-white border-slate-300 shadow-sm">
              <div className="text-sm text-slate-600 mb-1">Robot State</div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  executionStateLabel === 'Idle'
                    ? 'bg-emerald-500'
                    : executionStateLabel === 'Dispatching'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-blue-500 animate-pulse'
                }`} />
                <span className="font-medium text-slate-900">{executionStateLabel}</span>
              </div>
              {isDispatching && (
                <div className="text-xs text-slate-600 mt-1">
                  {pendingCommandLabel} ({formatDurationMs(pendingCommandElapsedMs)})
                </div>
              )}
            </Card>

            <Card className="p-3 bg-white border-slate-300 shadow-sm">
              <div className="text-sm text-slate-600 mb-1">Active Controller</div>
              <div className="font-medium text-slate-900">
                {controlStatus === 'YOU' ? 'You' : 'Read-only'}
              </div>
            </Card>

            <Card className="p-3 bg-white border-slate-300 shadow-sm">
              <div className="text-sm text-slate-600 mb-2">{mode === 'Whiteboard' ? 'Draw Profile' : 'Board Profile'}</div>
              <select
                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm bg-white"
                value={mode === 'Whiteboard' ? drawProfile : boardProfile}
                onChange={(e) => (mode === 'Whiteboard' ? handleDrawProfileChange(e.target.value) : handleBoardProfileChange(e.target.value))}
                disabled={isReadOnly}
              >
                {(mode === 'Whiteboard' ? drawProfileOptions : boardProfileOptions).map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="text-xs text-slate-500 mt-2">Active: {mode === 'Whiteboard' ? drawProfile : boardProfile}</div>
            </Card>

            {mode === 'Tic-Tac-Toe' && (
              <Card className="p-3 bg-white border-slate-300 shadow-sm">
                <div className="text-sm text-slate-600 mb-1">Tic-Tac-Toe</div>
                <div className="font-medium text-slate-900">
                  {tttWinner ? `Winner: ${tttWinner}` : `Next: ${tttPlayer}`}
                </div>
              </Card>
            )}

            {mode !== 'Whiteboard' && (
              <Card className="p-3 bg-white border-slate-300 shadow-sm">
                <div className="text-sm text-slate-600 mb-1">Target Square</div>
                <div className="font-medium text-blue-700">{targetSquare}</div>
              </Card>
            )}
            {mode === 'Whiteboard' && (
              <Card className="p-3 bg-white border-slate-300 shadow-sm">
                <div className="text-sm text-slate-600 mb-1">Planned Strokes</div>
                <div className="font-medium text-blue-700">{drawStrokeCount} strokes / {drawPointCount} points</div>
                <div className="text-xs text-slate-600 mt-1">Path length: {drawPathLengthM.toFixed(2)} m</div>
                <div className="text-xs text-slate-600 mt-1">ETA: {formatDurationMs(drawEtaMs)}</div>
                <div className="text-xs text-slate-600 mt-1">
                  Timer: {drawEtaEndAtMs ? formatDurationMs(drawEtaRemainingMs) : "--:--"}
                </div>
                <div className="text-xs text-slate-600 mt-1">Preset: {drawPreset}</div>
                <div className="text-xs text-slate-600 mt-1">Vector mode: {drawContourMode}</div>
                <div className={`text-xs mt-1 ${drawSafetyOk ? 'text-emerald-700' : 'text-red-700'}`}>
                  Safety: {drawSafetyOk ? 'OK' : 'Limit exceeded'}
                </div>
                {!drawSafetyOk && drawSafetyViolations.length > 0 && (
                  <div className="text-xs text-red-700 mt-1">{drawSafetyViolations[0]}</div>
                )}
              </Card>
            )}

            {mode === 'Chess' && (
              <Card className="p-3 bg-white border-slate-300 shadow-sm">
                <div className="text-sm text-slate-600 mb-1">Block Square</div>
                <div className={`font-medium ${blockIsHeld ? 'text-amber-700' : 'text-emerald-700'}`}>{chessBlockLabel}</div>
              </Card>
            )}

            <Card className="p-3 bg-white border-slate-300 shadow-sm">
              <div className="text-sm text-slate-600 mb-1">Last Command</div>
              <div className="font-mono text-sm text-slate-900">{lastCommand}</div>
            </Card>
          </div>
        </aside>
      </div>

      <footer className="h-12 shrink-0 bg-slate-800 text-white px-6 flex items-center justify-between border-t-2 border-slate-700">
        <span className="text-sm text-slate-300">Senior Project - CSC</span>
        <span className="text-sm text-slate-400">Version 0.9.0</span>
      </footer>
    </div>
  );
}
