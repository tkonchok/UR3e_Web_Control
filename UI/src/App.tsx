import { useEffect, useState, type DragEvent } from "react";
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Badge } from './components/ui/badge';
import { Card } from './components/ui/card';
import { Switch } from "./components/ui/switch";
import pawnImage from "./assets/chess-pawn.svg";

type GameMode = 'Chess' | 'Tic-Tac-Toe';
type ConnectionStatus = 'Connected' | 'Disconnected';
type RobotState = 'Idle' | 'Moving';
type ControlStatus = 'YOU' | 'Read-only';
type BoardProfileOption = { id: string; label: string };

const CONTROL_TOKEN_KEY = "ur_control_token";
const DEFAULT_CHESS_BLOCK_SQUARE = "A2";

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

//POST helper.
async function postJSON<T>(url: string, body?: any, headers?: HeadersInit): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: withControlHeaders(body ? { "Content-Type": "application/json", ...(headers || {}) } : headers),
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  }
  return data as T;
}

function isChessSquare(square: string) {
  return /^[A-H][1-8]$/i.test(square.trim());
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
  const boardSize = mode === 'Chess' ? 8 : 3;
  const isReadOnly = controlStatus === 'Read-only';
  const blockIsHeld = chessBlockSquare === null;
  const chessBlockLabel = chessBlockSquare ?? "Held by robot";

  useEffect(() => {
    if (mode === 'Chess') {
      const defaultSquare = chessBlockSquare ?? DEFAULT_CHESS_BLOCK_SQUARE;
      setSelectedSquare(defaultSquare);
      setTargetSquare(defaultSquare);
    } else {
      setSelectedSquare('1');
      setTargetSquare('1');
    }
  }, [mode]);

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
      setLastCommand(`moveJ → ${sq}`);
      setFeedbackMessage(`Sending move(${sq})...`);

      const endpoint = mode === 'Chess'
        ? `/api/moveSquare/${encodeURIComponent(sq)}`
        : `/api/ttt/move/${encodeURIComponent(sq)}`;
      const data = await postJSON<any>(`${endpoint}?dryRun=${dryRun ? 1 : 0}`);

      setSelectedSquare(sq);
      if (mode === "Chess" && !data.dryRun) {
        setLastMovedSquare(sq);
      }
      setFeedbackMessage(data.dryRun ? `Dry-run OK: ${data.script}` : `Sent: ${data.script}`);
    } catch (e: any) {
      setFeedbackMessage(`error: ${e.message}`);
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

      const data = await postJSON<any>(`/api/ttt/mark/${encodeURIComponent(raw)}?dryRun=${dryRun ? 1 : 0}`);

      const nextBoard = [...tttBoard];
      nextBoard[idx] = tttPlayer;
      setTttBoard(nextBoard);
      const winner = checkTttWinner(nextBoard);
      setTttWinner(winner);
      if (!winner) setTttPlayer(tttPlayer === 'X' ? 'O' : 'X');

      setFeedbackMessage(data.dryRun ? `Dry-run OK: ${data.script}` : `Marked ${raw}`);
    } catch (e: any) {
      setFeedbackMessage(`error: ${e.message}`);
    }
  };

  const handleTttReset = () => {
    setTttBoard(Array(9).fill(null));
    setTttPlayer('X');
    setTttWinner(null);
    setFeedbackMessage("Tic-Tac-Toe reset");
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

    const data = await postJSON<any>(`/api/pick/${encodeURIComponent(sq)}?dryRun=${dryRun ? 1 : 0}`);
    if (!data.dryRun) {
      setChessBlockSquare(null);
    }

    setFeedbackMessage(data.dryRun ? `Dry-run OK: ${data.script}` : `Suction ON at ${data.target} (block held)`);
  } catch (e: any) {
    setFeedbackMessage(`error: ${e.message}`);
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

    const data = await postJSON<any>(`/api/place/${encodeURIComponent(sq)}?dryRun=${dryRun ? 1 : 0}`);
    if (!data.dryRun) {
      setChessBlockSquare(sq);
      setSelectedSquare(sq);
      setTargetSquare(sq);
    }

    setFeedbackMessage(data.dryRun ? `Dry-run OK: ${data.script}` : `Suction OFF at ${data.target}`);
  } catch (e: any) {
    setFeedbackMessage(`error: ${e.message}`);
    }
  };

  const handleHome = async () => {
  try {
    setLastCommand("home");
    setFeedbackMessage("Sending home...");

    const data = await postJSON<any>(`/api/home?dryRun=${dryRun ? 1 : 0}`);

    setFeedbackMessage(data.dryRun ? `Dry-run OK: ${data.script}` : "Home sent");
  } catch (e: any) {
    setFeedbackMessage(`error: ${e.message}`);
    }
  };

  const refreshBoardProfiles = async () => {
    try {
      const res = await fetch("/api/board/profiles", { cache: "no-store", headers: withControlHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBoardProfile(String(data.active || "table_front"));
      setBoardProfileOptions(Array.isArray(data.available) ? data.available : []);
    } catch (e: any) {
      setFeedbackMessage((msg) => (msg.startsWith("error:") ? msg : `error: ${e.message}`));
    }
  };

  const handleBoardProfileChange = async (profileId: string) => {
    try {
      const data = await postJSON<any>(`/api/board/profile/${encodeURIComponent(profileId)}`);
      setBoardProfile(String(data.active || profileId));
      setBoardProfileOptions(Array.isArray(data.available) ? data.available : []);
      setFeedbackMessage(`Board profile set to ${String(data.active || profileId)}`);
    } catch (e: any) {
      setFeedbackMessage(`error: ${e.message}`);
    }
  };

  const acquireControl = async () => {
    try {
      const data = await postJSON<any>("/api/lock/acquire");
      setControlToken(data.token);
      setControlStatus("YOU");
      setFeedbackMessage("Control acquired");
    } catch (e: any) {
      setControlStatus("Read-only");
      setFeedbackMessage(`error: ${e.message}`);
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
  return () => { cancelled = true; clearInterval(id); };
}, []);

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <header className="h-20 bg-slate-800 text-white px-9 flex items-center justify-between border-b-2 border-slate-700">
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
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col">
          <div className="flex-1 flex items-center justify-center p-8 bg-slate-100">
            <div className="flex flex-col items-center gap-4">
              <div 
                className={`shadow-lg ${mode === 'Chess' ? 'bg-white border-4 border-slate-700' : 'bg-white border-4 border-slate-700 p-3'}`}
                style={{
                  width: mode === 'Chess' ? '560px' : '400px',
                  height: mode === 'Chess' ? '560px' : '400px'
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
                ) : (
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
                )}
              </div>
              
              <div className="text-sm text-slate-700 bg-white px-4 py-2 rounded shadow">
                Selected Square: <span className="font-bold text-blue-700">{selectedSquare}</span>
              </div>
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
            </div>
          </div>

          <div className="h-66 bg-slate-200 border-t border-slate-300 px-9 py-6">
            <h3 className="text-base mb-4 text-slate-800">Command Controls:</h3>
            
            <div className="flex gap-6 mb-4">
              {mode === 'Chess' ? (
                <>
                  <div className="flex gap-3">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-slate-600">Target Square</label>
                      <Input
                        value={targetSquare}
                        onChange={(e) => setTargetSquare(e.target.value.toUpperCase())}
                        className="w-20 bg-white border-slate-300 text-center"
                        disabled={isReadOnly}
                        placeholder="A2"
                      />
                    </div>
                    
                    <Button
                      onClick={handleMoveToSquare}
                      disabled={isReadOnly || robotState === 'Moving'}
                      className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed self-end"
                    >
                      Move to Square
                    </Button>

                    <Button
                      onClick={handleHome}
                      disabled={isReadOnly || robotState === 'Moving'}
                      className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed self-end"
                    >
                      Home
                    </Button>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={handlePick}
                      disabled={
                        isReadOnly ||
                        robotState === 'Moving' ||
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
                        robotState === 'Moving' ||
                        !blockIsHeld ||
                        !isChessSquare(targetSquare) ||
                        (!dryRun && lastMovedSquare !== targetSquare.trim().toUpperCase())
                      }
                      className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                      Place
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex gap-3">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-slate-600">Target Square</label>
                      <Input
                        value={targetSquare}
                        onChange={(e) => setTargetSquare(e.target.value)}
                        className="w-20 bg-white border-slate-300 text-center"
                        disabled={isReadOnly}
                        placeholder="1"
                      />
                    </div>

                    <Button
                      onClick={handleMoveToSquare}
                      disabled={isReadOnly || robotState === 'Moving'}
                      className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed self-end"
                    >
                      Move to Square
                    </Button>

                    <Button
                      onClick={handleHome}
                      disabled={isReadOnly || robotState === 'Moving'}
                      className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed self-end"
                    >
                      Home
                    </Button>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={handleTttMark}
                      disabled={
                        isReadOnly ||
                        robotState === 'Moving' ||
                        !!tttWinner ||
                        lastMovedSquare !== selectedSquare
                      }
                      className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                      Mark ({tttPlayer})
                    </Button>

                    <Button
                      onClick={handleTttReset}
                      disabled={isReadOnly}
                      className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                      Reset
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="bg-slate-100 border border-slate-300 rounded px-3 py-2 text-sm">
              <span className="text-slate-600">Status: </span>
              <span className={`${
                feedbackMessage.includes('completed') || feedbackMessage === 'Ready'
                  ? 'text-emerald-700'
                  : feedbackMessage.includes('error')
                  ? 'text-red-700'
                  : 'text-blue-700'
              }`}>
                {feedbackMessage}
              </span>
            </div>
          </div>
        </div>

        <aside className="w-80 bg-slate-200 border-l border-slate-300 p-6 overflow-auto">
          <h2 className="text-lg mb-6 text-slate-900">Robot Status</h2>
          
          <div className="space-y-4">
            <Card className="p-4 bg-white border-slate-300 shadow-sm">
              <div className="text-sm text-slate-600 mb-1">Connection</div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'Connected' ? 'bg-emerald-500' : 'bg-red-500'
                }`} />
                <span className="font-medium text-slate-900">{connectionStatus}</span>
              </div>
            </Card>

            <Card className="p-4 bg-white border-slate-300 shadow-sm">
              <div className="text-sm text-slate-600 mb-1">Robot State</div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  robotState === 'Idle' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                }`} />
                <span className="font-medium text-slate-900">{robotState}</span>
              </div>
            </Card>

            <Card className="p-4 bg-white border-slate-300 shadow-sm">
              <div className="text-sm text-slate-600 mb-1">Active Controller</div>
              <div className="font-medium text-slate-900">
                {controlStatus === 'YOU' ? 'You' : 'Read-only'}
              </div>
            </Card>

            <Card className="p-4 bg-white border-slate-300 shadow-sm">
              <div className="text-sm text-slate-600 mb-2">Board Profile</div>
              <select
                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm bg-white"
                value={boardProfile}
                onChange={(e) => handleBoardProfileChange(e.target.value)}
                disabled={isReadOnly}
              >
                {boardProfileOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="text-xs text-slate-500 mt-2">Active: {boardProfile}</div>
            </Card>

            {mode === 'Tic-Tac-Toe' && (
              <Card className="p-4 bg-white border-slate-300 shadow-sm">
                <div className="text-sm text-slate-600 mb-1">Tic-Tac-Toe</div>
                <div className="font-medium text-slate-900">
                  {tttWinner ? `Winner: ${tttWinner}` : `Next: ${tttPlayer}`}
                </div>
              </Card>
            )}

            <Card className="p-4 bg-white border-slate-300 shadow-sm">
              <div className="text-sm text-slate-600 mb-1">Target Square</div>
              <div className="font-medium text-blue-700">{targetSquare}</div>
            </Card>

            {mode === 'Chess' && (
              <Card className="p-4 bg-white border-slate-300 shadow-sm">
                <div className="text-sm text-slate-600 mb-1">Block Square</div>
                <div className={`font-medium ${blockIsHeld ? 'text-amber-700' : 'text-emerald-700'}`}>{chessBlockLabel}</div>
              </Card>
            )}

            <Card className="p-4 bg-white border-slate-300 shadow-sm">
              <div className="text-sm text-slate-600 mb-1">Last Command</div>
              <div className="font-mono text-sm text-slate-900">{lastCommand}</div>
            </Card>
          </div>
        </aside>
      </div>

      <footer className="h-20 bg-slate-800 text-white px-9 flex items-center justify-between border-t-2 border-slate-700">
        <span className="text-sm text-slate-300">Senior Project - CSC</span>
        <span className="text-sm text-slate-400">Version 0.1</span>
      </footer>
    </div>
  );
}
