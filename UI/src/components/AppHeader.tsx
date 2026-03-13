// Global controls that stay visible across all modes.
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import type { ControlStatus, GameMode, RobotState, ConnectionStatus } from "../types";

type AppHeaderProps = {
  mode: GameMode;
  setMode: (mode: GameMode) => void;
  connectionStatus: ConnectionStatus;
  robotState: RobotState;
  controlStatus: ControlStatus;
  dryRun: boolean;
  setDryRun: (next: boolean) => void;
  isDispatching: boolean;
  pendingCommandElapsedMs: number;
  formatDurationMs: (ms: number) => string;
  acquireControl: () => void;
  releaseControl: () => void;
};

export function AppHeader({
  mode,
  setMode,
  connectionStatus,
  robotState,
  controlStatus,
  dryRun,
  setDryRun,
  isDispatching,
  pendingCommandElapsedMs,
  formatDurationMs,
  acquireControl,
  releaseControl,
}: AppHeaderProps) {
  return (
    <header className="h-16 bg-slate-800 text-white px-6 flex items-center justify-between border-b-2 border-slate-700">
      <h1 className="text-xl">UR Robot Web Control</h1>

      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-300">Status:</span>
          <Badge
            variant={connectionStatus === "Connected" ? "default" : "destructive"}
            className={connectionStatus === "Connected"
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-red-600 hover:bg-red-700"}
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
          <span className={`text-sm font-semibold ${dryRun ? "text-emerald-400" : "text-red-400"}`}>
            Dry Run: {dryRun ? "ON (Safe)" : "OFF (Live Robot)"}
          </span>
          <Switch checked={dryRun} onCheckedChange={setDryRun} />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-300">Control:</span>
          <Badge
            variant={controlStatus === "YOU" ? "default" : "secondary"}
            className={controlStatus === "YOU"
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-slate-500 hover:bg-slate-600"}
          >
            {controlStatus === "YOU" ? "You (Locked)" : "Read-only"}
          </Badge>
          {controlStatus === "YOU" ? (
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
            {(["Chess", "Tic-Tac-Toe", "Whiteboard"] as GameMode[]).map((value) => (
              <Button
                key={value}
                variant={mode === value ? "default" : "outline"}
                size="sm"
                onClick={() => setMode(value)}
                className={mode === value
                  ? "bg-slate-600 hover:bg-slate-700"
                  : "border-slate-500 text-slate-200 hover:bg-slate-700"}
              >
                {value}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
