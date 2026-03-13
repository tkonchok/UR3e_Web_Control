//read-only status and profile sidebar. Keeps operator context visible during commands.
import { Card } from "./ui/card";
import type { BoardProfileOption, ControlStatus, GameMode, ConnectionStatus } from "../types";

type RobotStatusSidebarProps = {
  mode: GameMode;
  connectionStatus: ConnectionStatus;
  executionStateLabel: string;
  isDispatching: boolean;
  pendingCommandLabel: string | null;
  pendingCommandElapsedMs: number;
  formatDurationMs: (ms: number) => string;
  controlStatus: ControlStatus;
  drawProfile: string;
  boardProfile: string;
  drawProfileOptions: BoardProfileOption[];
  boardProfileOptions: BoardProfileOption[];
  handleDrawProfileChange: (profileId: string) => void;
  handleBoardProfileChange: (profileId: string) => void;
  isReadOnly: boolean;
  tttWinner: "X" | "O" | "Draw" | null;
  tttPlayer: "X" | "O";
  targetSquare: string;
  drawStrokeCount: number;
  drawPointCount: number;
  drawPathLengthM: number;
  drawEtaMs: number;
  drawEtaEndAtMs: number | null;
  drawEtaRemainingMs: number;
  drawPreset: string;
  drawContourMode: string;
  drawSafetyOk: boolean;
  drawSafetyViolations: string[];
  chessBlockLabel: string;
  blockIsHeld: boolean;
  lastCommand: string;
};

export function RobotStatusSidebar({
  mode,
  connectionStatus,
  executionStateLabel,
  isDispatching,
  pendingCommandLabel,
  pendingCommandElapsedMs,
  formatDurationMs,
  controlStatus,
  drawProfile,
  boardProfile,
  drawProfileOptions,
  boardProfileOptions,
  handleDrawProfileChange,
  handleBoardProfileChange,
  isReadOnly,
  tttWinner,
  tttPlayer,
  targetSquare,
  drawStrokeCount,
  drawPointCount,
  drawPathLengthM,
  drawEtaMs,
  drawEtaEndAtMs,
  drawEtaRemainingMs,
  drawPreset,
  drawContourMode,
  drawSafetyOk,
  drawSafetyViolations,
  chessBlockLabel,
  blockIsHeld,
  lastCommand,
}: RobotStatusSidebarProps) {
  return (
    <aside className="w-64 bg-slate-200 border-l border-slate-300 p-4 overflow-auto">
      <h2 className="text-base mb-4 text-slate-900">Robot Status</h2>

      <div className="space-y-4">
        <Card className="p-3 bg-white border-slate-300 shadow-sm">
          <div className="text-sm text-slate-600 mb-1">Connection</div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connectionStatus === "Connected" ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="font-medium text-slate-900">{connectionStatus}</span>
          </div>
        </Card>

        <Card className="p-3 bg-white border-slate-300 shadow-sm">
          <div className="text-sm text-slate-600 mb-1">Robot State</div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              executionStateLabel === "Idle"
                ? "bg-emerald-500"
                : executionStateLabel === "Dispatching"
                ? "bg-amber-500 animate-pulse"
                : "bg-blue-500 animate-pulse"
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
            {controlStatus === "YOU" ? "You" : "Read-only"}
          </div>
        </Card>

        <Card className="p-3 bg-white border-slate-300 shadow-sm">
          <div className="text-sm text-slate-600 mb-2">{mode === "Whiteboard" ? "Draw Profile" : "Board Profile"}</div>
          <select
            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm bg-white"
            value={mode === "Whiteboard" ? drawProfile : boardProfile}
            onChange={(e) => (mode === "Whiteboard" ? handleDrawProfileChange(e.target.value) : handleBoardProfileChange(e.target.value))}
            disabled={isReadOnly}
          >
            {(mode === "Whiteboard" ? drawProfileOptions : boardProfileOptions).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="text-xs text-slate-500 mt-2">Active: {mode === "Whiteboard" ? drawProfile : boardProfile}</div>
        </Card>

        {mode === "Tic-Tac-Toe" && (
          <Card className="p-3 bg-white border-slate-300 shadow-sm">
            <div className="text-sm text-slate-600 mb-1">Tic-Tac-Toe</div>
            <div className="font-medium text-slate-900">
              {tttWinner ? `Winner: ${tttWinner}` : `Next: ${tttPlayer}`}
            </div>
          </Card>
        )}

        {mode !== "Whiteboard" && (
          <Card className="p-3 bg-white border-slate-300 shadow-sm">
            <div className="text-sm text-slate-600 mb-1">Target Square</div>
            <div className="font-medium text-blue-700">{targetSquare}</div>
          </Card>
        )}

        {mode === "Whiteboard" && (
          <Card className="p-3 bg-white border-slate-300 shadow-sm">
            <div className="text-sm text-slate-600 mb-1">Planned Strokes</div>
            <div className="font-medium text-blue-700">{drawStrokeCount} strokes / {drawPointCount} points</div>
            <div className="text-xs text-slate-600 mt-1">Path length: {drawPathLengthM.toFixed(2)} m</div>
            <div className="text-xs text-slate-600 mt-1">ETA: {formatDurationMs(drawEtaMs)}</div>
            <div className="text-xs text-slate-600 mt-1">Timer: {drawEtaEndAtMs ? formatDurationMs(drawEtaRemainingMs) : "--:--"}</div>
            <div className="text-xs text-slate-600 mt-1">Preset: {drawPreset}</div>
            <div className="text-xs text-slate-600 mt-1">Vector mode: {drawContourMode}</div>
            <div className={`text-xs mt-1 ${drawSafetyOk ? "text-emerald-700" : "text-red-700"}`}>
              Safety: {drawSafetyOk ? "OK" : "Limit exceeded"}
            </div>
            {!drawSafetyOk && drawSafetyViolations.length > 0 && (
              <div className="text-xs text-red-700 mt-1">{drawSafetyViolations[0]}</div>
            )}
          </Card>
        )}

        {mode === "Chess" && (
          <Card className="p-3 bg-white border-slate-300 shadow-sm">
            <div className="text-sm text-slate-600 mb-1">Block Square</div>
            <div className={`font-medium ${blockIsHeld ? "text-amber-700" : "text-emerald-700"}`}>{chessBlockLabel}</div>
          </Card>
        )}

        <Card className="p-3 bg-white border-slate-300 shadow-sm">
          <div className="text-sm text-slate-600 mb-1">Last Command</div>
          <div className="font-mono text-sm text-slate-900">{lastCommand}</div>
        </Card>
      </div>
    </aside>
  );
}
