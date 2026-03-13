// Mode-specific command panels. Each section only renders the controls it needs.
import type { Dispatch, RefObject, SetStateAction } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import type { DrawQualityPreset, DrawTuning, GameMode } from "../types";

type CommandControlsProps = {
  mode: GameMode;
  twoColControls: boolean;
  executionStateLabel: string;
  isDispatching: boolean;
  pendingCommandLabel: string | null;
  pendingCommandElapsedMs: number;
  formatDurationMs: (ms: number) => string;
  feedbackMessage: string;
  isReadOnly: boolean;
  controlsBusy: boolean;
  dryRun: boolean;
  selectedSquare: string;
  targetSquare: string;
  setTargetSquare: (value: string) => void;
  chessBlockSquare: string | null;
  blockIsHeld: boolean;
  chessBlockLabel: string;
  tttPlayer: "X" | "O";
  tttWinner: "X" | "O" | "Draw" | null;
  lastMovedSquare: string | null;
  drawImageFileName: string;
  drawFileInputRef: RefObject<HTMLInputElement | null>;
  drawPreset: DrawQualityPreset;
  drawTuning: DrawTuning;
  drawSafetyOk: boolean;
  showDrawAdvanced: boolean;
  setShowDrawAdvanced: Dispatch<SetStateAction<boolean>>;
  handleMoveToSquare: () => void;
  handleHome: () => void;
  handlePick: () => void;
  handlePlace: () => void;
  handleTttMark: () => void;
  handleTttReset: () => void;
  handleDrawImageUpload: (file: File | null) => void;
  applyDrawPreset: (preset: DrawQualityPreset) => void;
  handleDrawPreview: () => void;
  handleDrawExecute: () => void;
  handleDrawStop: () => void;
  setDrawTuningField: (key: keyof DrawTuning, value: string) => void;
};

function StatusBanner({
  executionStateLabel,
  isDispatching,
  pendingCommandLabel,
  pendingCommandElapsedMs,
  formatDurationMs,
}: Pick<CommandControlsProps, "executionStateLabel" | "isDispatching" | "pendingCommandLabel" | "pendingCommandElapsedMs" | "formatDurationMs">) {
  return (
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
  );
}

function StatusMessage({ feedbackMessage }: Pick<CommandControlsProps, "feedbackMessage">) {
  return (
    <div className="bg-slate-100 border border-slate-300 rounded px-3 py-2 text-sm min-w-0 overflow-hidden">
      <div className="text-slate-600 mb-1">Status:</div>
      <div
        className={`min-w-0 ${
          feedbackMessage.includes("completed") || feedbackMessage === "Ready"
            ? "text-emerald-700"
            : feedbackMessage.includes("error")
            ? "text-red-700"
            : "text-blue-700"
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
  );
}

function ChessControls(props: CommandControlsProps) {
  const {
    twoColControls,
    targetSquare,
    setTargetSquare,
    isReadOnly,
    selectedSquare,
    controlsBusy,
    handleMoveToSquare,
    handleHome,
    handlePick,
    handlePlace,
    blockIsHeld,
    chessBlockSquare,
    dryRun,
    lastMovedSquare,
    chessBlockLabel,
  } = props;

  return (
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
              !/^[A-H][1-8]$/i.test(targetSquare.trim()) ||
              (!dryRun && lastMovedSquare !== targetSquare.trim().toUpperCase())
            }
            className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 disabled:cursor-not-allowed"
          >
            Place
          </Button>
        </div>
        <div className="mt-3 text-xs text-slate-600">
          Block: <span className={`font-semibold ${blockIsHeld ? "text-amber-700" : "text-emerald-700"}`}>{chessBlockLabel}</span>
        </div>
      </Card>
    </div>
  );
}

function TttControls(props: CommandControlsProps) {
  const {
    twoColControls,
    targetSquare,
    setTargetSquare,
    isReadOnly,
    selectedSquare,
    controlsBusy,
    handleMoveToSquare,
    handleHome,
    handleTttMark,
    handleTttReset,
    tttPlayer,
    tttWinner,
    lastMovedSquare,
    isDispatching,
  } = props;

  return (
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
            disabled={isReadOnly || controlsBusy || !!tttWinner || lastMovedSquare !== selectedSquare}
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
  );
}

function WhiteboardControls(props: CommandControlsProps) {
  const {
    twoColControls,
    drawFileInputRef,
    handleDrawImageUpload,
    isReadOnly,
    isDispatching,
    drawImageFileName,
    drawPreset,
    controlsBusy,
    applyDrawPreset,
    handleDrawPreview,
    handleDrawExecute,
    handleDrawStop,
    showDrawAdvanced,
    setShowDrawAdvanced,
    drawTuning,
    setDrawTuningField,
  } = props;

  return (
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
              accept=".png,.jpg,.jpeg,.webp,.bmp"
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
            {(["fast", "balanced", "detail"] as DrawQualityPreset[]).map((preset) => (
              <Button
                key={preset}
                size="sm"
                onClick={() => applyDrawPreset(preset)}
                disabled={isReadOnly || controlsBusy}
                className={
                  drawPreset === preset
                    ? "bg-blue-600 text-white ring-2 ring-blue-300 font-semibold hover:bg-blue-600 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    : "bg-slate-200 text-slate-800 border border-slate-300 hover:bg-slate-300 disabled:bg-slate-400 disabled:cursor-not-allowed"
                }
              >
                {preset[0].toUpperCase() + preset.slice(1)}
              </Button>
            ))}
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
            onClick={() => setShowDrawAdvanced((value) => !value)}
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
          // Expose the raw vectorizer/planner knobs without mixing them into normal use.
          <div className="grid grid-cols-2 gap-2 mt-3">
            {[
              ["cannyLow", "cannyLow", "1"],
              ["cannyHigh", "cannyHigh", "1"],
              ["minPerimeterPx", "minPerimeter", "0.5"],
              ["approxEpsilonFrac", "approxEpsilon", "0.001"],
              ["maxContours", "maxContours", "1"],
              ["maxDim", "maxDim", "1"],
              ["blurKsize", "blurKsize", "1"],
              ["padding", "padding", "0.01"],
              ["simplifyEpsilon", "simplifyEps", "0.0001"],
              ["minStep", "minStep", "0.0001"],
            ].map(([key, label, step]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-600">{label}</label>
                <Input
                  type="number"
                  step={step}
                  value={String(drawTuning[key as keyof DrawTuning])}
                  onChange={(e) => setDrawTuningField(key as keyof DrawTuning, e.target.value)}
                  className="h-8 bg-white border-slate-300 text-xs"
                  disabled={isReadOnly || isDispatching}
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function CommandControls(props: CommandControlsProps) {
  return (
    <div className="min-h-0 overflow-y-auto bg-slate-200 border border-slate-300 rounded-lg px-4 py-4">
      <h3 className="text-sm mb-2 text-slate-800">Command Controls</h3>

      <StatusBanner
        executionStateLabel={props.executionStateLabel}
        isDispatching={props.isDispatching}
        pendingCommandLabel={props.pendingCommandLabel}
        pendingCommandElapsedMs={props.pendingCommandElapsedMs}
        formatDurationMs={props.formatDurationMs}
      />

      {props.mode === "Chess" ? (
        <ChessControls {...props} />
      ) : props.mode === "Tic-Tac-Toe" ? (
        <TttControls {...props} />
      ) : (
        <WhiteboardControls {...props} />
      )}

      <StatusMessage feedbackMessage={props.feedbackMessage} />
    </div>
  );
}
