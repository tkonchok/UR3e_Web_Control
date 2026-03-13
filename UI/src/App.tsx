//top-level dashboard state and API wiring for all three robot modes.
import { useEffect, useRef, useState, type DragEvent } from "react";
import { AppHeader } from "./components/AppHeader";
import { CommandControls } from "./components/CommandControls";
import { RobotStatusSidebar } from "./components/RobotStatusSidebar";
import { WorkspaceBoard } from "./components/WorkspaceBoard";
import { DRAW_TUNING_PRESETS } from "./config/draw";
import type {
  BoardProfileOption,
  ConnectionStatus,
  ControlStatus,
  DrawQualityPreset,
  DrawStroke,
  DrawTuning,
  GameMode,
  RobotState,
  StatusResponse,
} from "./types";

const CONTROL_TOKEN_KEY = "ur_control_token";
const DEFAULT_CHESS_BLOCK_SQUARE = "A2";

function getControlToken() {
  try {
    return localStorage.getItem(CONTROL_TOKEN_KEY);
  } catch {
    return null;
  }
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

async function postJSON<T>(url: string, body?: unknown, headers?: HeadersInit): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: withControlHeaders(body ? { "Content-Type": "application/json", ...(headers || {}) } : headers),
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(String(data?.error || data?.message || `HTTP ${res.status}`));
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

function checkTttWinner(board: Array<"X" | "O" | null>) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return board.every(Boolean) ? "Draw" : null;
}

export default function App() {
  // Grouped UI state: connection/control, board modes, and whiteboard draw mode.
  const [mode, setMode] = useState<GameMode>("Chess");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("Disconnected");
  const [robotState, setRobotState] = useState<RobotState>("Idle");
  const [controlStatus, setControlStatus] = useState<ControlStatus>("Read-only");
  const [selectedSquare, setSelectedSquare] = useState<string>(DEFAULT_CHESS_BLOCK_SQUARE);
  const [targetSquare, setTargetSquare] = useState<string>(DEFAULT_CHESS_BLOCK_SQUARE);
  const [lastCommand, setLastCommand] = useState<string>(`moveJ -> ${DEFAULT_CHESS_BLOCK_SQUARE}`);
  const [feedbackMessage, setFeedbackMessage] = useState<string>("Ready");
  const [dryRun, setDryRun] = useState(true);
  const [chessBlockSquare, setChessBlockSquare] = useState<string | null>(DEFAULT_CHESS_BLOCK_SQUARE);
  const [boardProfile, setBoardProfile] = useState<string>("table_front");
  const [boardProfileOptions, setBoardProfileOptions] = useState<BoardProfileOption[]>([]);
  const [tttBoard, setTttBoard] = useState<Array<"X" | "O" | null>>(Array(9).fill(null));
  const [tttPlayer, setTttPlayer] = useState<"X" | "O">("X");
  const [tttWinner, setTttWinner] = useState<"X" | "O" | "Draw" | null>(null);
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
    typeof window !== "undefined" ? window.innerWidth : 1400,
  );

  const drawFileInputRef = useRef<HTMLInputElement | null>(null);
  const boardSize = mode === "Chess" ? 8 : mode === "Tic-Tac-Toe" ? 3 : 0;
  const isReadOnly = controlStatus === "Read-only";
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
    // Keep the selected target aligned with the active mode.
    if (mode === "Chess") {
      const defaultSquare = chessBlockSquare ?? DEFAULT_CHESS_BLOCK_SQUARE;
      setSelectedSquare(defaultSquare);
      setTargetSquare(defaultSquare);
    } else if (mode === "Tic-Tac-Toe") {
      setSelectedSquare("1");
      setTargetSquare("1");
    }
  }, [mode, chessBlockSquare]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const beginDispatch = (label: string) => {
    setPendingCommandLabel(label);
    setPendingCommandStartedAtMs(Date.now());
    setPendingCommandElapsedMs(0);
  };

  const endDispatch = () => {
    setPendingCommandLabel(null);
    setPendingCommandStartedAtMs(null);
    setPendingCommandElapsedMs(0);
  };

  const handleSquareClick = (row: number, col: number) => {
    const square = mode === "Chess"
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

  const handleMoveToSquare = async () => {
    try {
      const raw = targetSquare.trim();
      const square = mode === "Chess" ? raw.toUpperCase() : raw;
      setLastCommand(`moveJ -> ${square}`);
      setFeedbackMessage(`Sending move(${square})...`);

      const endpoint = mode === "Chess"
        ? `/api/moveSquare/${encodeURIComponent(square)}`
        : `/api/ttt/move/${encodeURIComponent(square)}`;

      beginDispatch(`Move to ${square}`);
      const data = await postJSON<any>(`${endpoint}?dryRun=${dryRun ? 1 : 0}`);
      setSelectedSquare(square);

      if (mode === "Chess" && !data.dryRun) {
        setLastMovedSquare(square);
      }

      setFeedbackMessage(data.dryRun
        ? "Dry-run ON: command generated only (robot will not move)"
        : `Sent: ${data.script}`);
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
      const index = parseInt(raw, 10) - 1;
      if (Number.isNaN(index) || index < 0 || index > 8) {
        setFeedbackMessage("error: invalid square (1-9)");
        return;
      }
      if (tttBoard[index]) {
        setFeedbackMessage("error: square already marked");
        return;
      }

      setLastCommand(`mark ${tttPlayer} -> ${raw}`);
      setFeedbackMessage(`Sending mark(${raw})...`);
      beginDispatch(`Mark ${tttPlayer} at ${raw}`);

      const data = await postJSON<any>(
        `/api/ttt/mark/${encodeURIComponent(raw)}?dryRun=${dryRun ? 1 : 0}`,
        { symbol: tttPlayer },
      );

      const nextBoard = [...tttBoard];
      nextBoard[index] = tttPlayer;
      const winner = checkTttWinner(nextBoard);

      setTttBoard(nextBoard);
      setTttWinner(winner);
      if (!winner) {
        setTttPlayer(tttPlayer === "X" ? "O" : "X");
      }

      setFeedbackMessage(data.dryRun
        ? "Dry-run ON: mark script generated only (robot will not move)"
        : `Marked ${data.symbol || tttPlayer} at ${raw}`);
    } catch (error) {
      setFeedbackMessage(`error: ${getErrorMessage(error)}`);
    } finally {
      endDispatch();
    }
  };

  const handleTttReset = () => {
    setTttBoard(Array(9).fill(null));
    setTttPlayer("X");
    setTttWinner(null);
    setFeedbackMessage("Tic-Tac-Toe reset");
  };

  const handlePick = async () => {
    try {
      const square = targetSquare.trim().toUpperCase();
      if (!isChessSquare(square)) {
        setFeedbackMessage("error: invalid chess square");
        return;
      }
      if (blockIsHeld) {
        setFeedbackMessage("error: block already held by robot. Place it first.");
        return;
      }
      if (chessBlockSquare && square !== chessBlockSquare) {
        setFeedbackMessage(`error: block is currently at ${chessBlockSquare}`);
        return;
      }
      if (!dryRun && lastMovedSquare !== square) {
        setFeedbackMessage(`error: move robot to ${square} first, then press Pick`);
        return;
      }

      setLastCommand(`pick -> ${square}`);
      setFeedbackMessage(`Sending pick(${square})...`);
      beginDispatch(`Pick at ${square}`);

      const data = await postJSON<any>(`/api/pick/${encodeURIComponent(square)}?dryRun=${dryRun ? 1 : 0}`);
      if (!data.dryRun) {
        setChessBlockSquare(null);
      }

      setFeedbackMessage(data.dryRun
        ? `Dry-run OK: ${data.script}`
        : `Suction ON at ${data.target} (block held)`);
    } catch (error) {
      setFeedbackMessage(`error: ${getErrorMessage(error)}`);
    } finally {
      endDispatch();
    }
  };

  const handlePlace = async () => {
    try {
      const square = targetSquare.trim().toUpperCase();
      if (!isChessSquare(square)) {
        setFeedbackMessage("error: invalid chess square");
        return;
      }
      if (!blockIsHeld) {
        setFeedbackMessage(`error: block is on board at ${chessBlockSquare}. Pick it first.`);
        return;
      }
      if (!dryRun && lastMovedSquare !== square) {
        setFeedbackMessage(`error: move robot to ${square} first, then press Place`);
        return;
      }

      setLastCommand(`place -> ${square}`);
      setFeedbackMessage(`Sending place(${square})...`);
      beginDispatch(`Place at ${square}`);

      const data = await postJSON<any>(`/api/place/${encodeURIComponent(square)}?dryRun=${dryRun ? 1 : 0}`);
      if (!data.dryRun) {
        setChessBlockSquare(square);
        setSelectedSquare(square);
        setTargetSquare(square);
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
    if (file.type === "image/svg+xml") {
      setFeedbackMessage("error: SVG upload is disabled. Use a raster image like PNG or JPG.");
      return;
    }

    try {
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
    if (!drawImageDataUrl) return null;

    // Preview and execute share the exact same payload so results stay consistent.
    return {
      padding: drawTuning.padding,
      simplifyEpsilon: drawTuning.simplifyEpsilon,
      minStep: drawTuning.minStep,
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
        `eta=${formatDurationMs(Number(data?.eta?.durationMs || 0))}, ` +
        `mode=${String(data?.plan?.vectorization?.contourMode || "n/a")}`,
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
      const etaMs = Number(data?.eta?.durationMs || 0);

      setDrawPreviewStrokes(strokes);
      setDrawStrokeCount(Number(data?.plan?.strokeCount || 0));
      setDrawPointCount(Number(data?.plan?.pointCount || 0));
      setDrawPathLengthM(Number(data?.safety?.observed?.pathLengthM || 0));
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

      setFeedbackMessage(data?.dryRun
        ? `Dry-run ON: drawing script generated only (ETA ${formatDurationMs(etaMs)})`
        : `Drawing script sent (ETA ${formatDurationMs(etaMs)})`);
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
      setFeedbackMessage((message) => (
        message.startsWith("error:") ? message : `error: ${getErrorMessage(error)}`
      ));
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
      setFeedbackMessage((message) => (
        message.startsWith("error:") ? message : `error: ${getErrorMessage(error)}`
      ));
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
    // Poll backend status so the UI follows RTDE/dashboard motion state.
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
        if (data.lock) setControlStatus(data.lock.yours ? "YOU" : "Read-only");

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
    // Dispatch timer shows API send latency before the robot starts moving.
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
    // ETA countdown is only a planner estimate, so clear it when the robot actually stops.
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
      <AppHeader
        mode={mode}
        setMode={setMode}
        connectionStatus={connectionStatus}
        robotState={robotState}
        controlStatus={controlStatus}
        dryRun={dryRun}
        setDryRun={setDryRun}
        isDispatching={isDispatching}
        pendingCommandElapsedMs={pendingCommandElapsedMs}
        formatDurationMs={formatDurationMs}
        acquireControl={acquireControl}
        releaseControl={releaseControl}
      />

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
          <WorkspaceBoard
            mode={mode}
            boardSize={boardSize}
            boardViewportSize={boardViewportSize}
            selectedSquare={selectedSquare}
            chessBlockSquare={chessBlockSquare}
            blockIsHeld={blockIsHeld}
            chessBlockLabel={chessBlockLabel}
            tttBoard={tttBoard}
            tttPlayer={tttPlayer}
            tttWinner={tttWinner}
            drawPreviewStrokes={drawPreviewStrokes}
            drawStrokeCount={drawStrokeCount}
            drawPointCount={drawPointCount}
            isReadOnly={isReadOnly}
            handleSquareClick={handleSquareClick}
            handlePawnDragStart={handlePawnDragStart}
            handlePawnDragOver={handlePawnDragOver}
            handlePawnDrop={handlePawnDrop}
          />

          <CommandControls
            mode={mode}
            twoColControls={twoColControls}
            executionStateLabel={executionStateLabel}
            isDispatching={isDispatching}
            pendingCommandLabel={pendingCommandLabel}
            pendingCommandElapsedMs={pendingCommandElapsedMs}
            formatDurationMs={formatDurationMs}
            feedbackMessage={feedbackMessage}
            isReadOnly={isReadOnly}
            controlsBusy={controlsBusy}
            dryRun={dryRun}
            selectedSquare={selectedSquare}
            targetSquare={targetSquare}
            setTargetSquare={setTargetSquare}
            chessBlockSquare={chessBlockSquare}
            blockIsHeld={blockIsHeld}
            chessBlockLabel={chessBlockLabel}
            tttPlayer={tttPlayer}
            tttWinner={tttWinner}
            lastMovedSquare={lastMovedSquare}
            drawImageFileName={drawImageFileName}
            drawFileInputRef={drawFileInputRef}
            drawPreset={drawPreset}
            drawTuning={drawTuning}
            drawSafetyOk={drawSafetyOk}
            showDrawAdvanced={showDrawAdvanced}
            setShowDrawAdvanced={setShowDrawAdvanced}
            handleMoveToSquare={handleMoveToSquare}
            handleHome={handleHome}
            handlePick={handlePick}
            handlePlace={handlePlace}
            handleTttMark={handleTttMark}
            handleTttReset={handleTttReset}
            handleDrawImageUpload={handleDrawImageUpload}
            applyDrawPreset={applyDrawPreset}
            handleDrawPreview={handleDrawPreview}
            handleDrawExecute={handleDrawExecute}
            handleDrawStop={handleDrawStop}
            setDrawTuningField={setDrawTuningField}
          />
        </div>

        <RobotStatusSidebar
          mode={mode}
          connectionStatus={connectionStatus}
          executionStateLabel={executionStateLabel}
          isDispatching={isDispatching}
          pendingCommandLabel={pendingCommandLabel}
          pendingCommandElapsedMs={pendingCommandElapsedMs}
          formatDurationMs={formatDurationMs}
          controlStatus={controlStatus}
          drawProfile={drawProfile}
          boardProfile={boardProfile}
          drawProfileOptions={drawProfileOptions}
          boardProfileOptions={boardProfileOptions}
          handleDrawProfileChange={handleDrawProfileChange}
          handleBoardProfileChange={handleBoardProfileChange}
          isReadOnly={isReadOnly}
          tttWinner={tttWinner}
          tttPlayer={tttPlayer}
          targetSquare={targetSquare}
          drawStrokeCount={drawStrokeCount}
          drawPointCount={drawPointCount}
          drawPathLengthM={drawPathLengthM}
          drawEtaMs={drawEtaMs}
          drawEtaEndAtMs={drawEtaEndAtMs}
          drawEtaRemainingMs={drawEtaRemainingMs}
          drawPreset={drawPreset}
          drawContourMode={drawContourMode}
          drawSafetyOk={drawSafetyOk}
          drawSafetyViolations={drawSafetyViolations}
          chessBlockLabel={chessBlockLabel}
          blockIsHeld={blockIsHeld}
          lastCommand={lastCommand}
        />
      </div>

      <footer className="h-12 shrink-0 bg-slate-800 text-white px-6 flex items-center justify-between border-t-2 border-slate-700">
        <span className="text-sm text-slate-300">Senior Project - CSC</span>
        <span className="text-sm text-slate-400">Version 0.9.0</span>
      </footer>
    </div>
  );
}
