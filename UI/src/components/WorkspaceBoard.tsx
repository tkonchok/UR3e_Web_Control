// Board/preview renderer for the active mode.
import type { DragEvent } from "react";
import pawnImage from "../assets/chess-pawn.svg";
import type { DrawStroke, GameMode } from "../types";

type WorkspaceBoardProps = {
  mode: GameMode;
  boardSize: number;
  boardViewportSize: string;
  selectedSquare: string;
  chessBlockSquare: string | null;
  blockIsHeld: boolean;
  chessBlockLabel: string;
  tttBoard: Array<"X" | "O" | null>;
  tttPlayer: "X" | "O";
  tttWinner: "X" | "O" | "Draw" | null;
  drawPreviewStrokes: DrawStroke[];
  drawStrokeCount: number;
  drawPointCount: number;
  isReadOnly: boolean;
  handleSquareClick: (row: number, col: number) => void;
  handlePawnDragStart: (e: DragEvent, fromSquare: string) => void;
  handlePawnDragOver: (e: DragEvent) => void;
  handlePawnDrop: (e: DragEvent, toSquare: string) => void;
};

export function WorkspaceBoard({
  mode,
  boardSize,
  boardViewportSize,
  selectedSquare,
  chessBlockSquare,
  blockIsHeld,
  chessBlockLabel,
  tttBoard,
  tttPlayer,
  tttWinner,
  drawPreviewStrokes,
  drawStrokeCount,
  drawPointCount,
  isReadOnly,
  handleSquareClick,
  handlePawnDragStart,
  handlePawnDragOver,
  handlePawnDrop,
}: WorkspaceBoardProps) {
  return (
    <div className="min-h-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div
          className={`shadow-lg ${mode === "Chess" ? "bg-white border-4 border-slate-700" : mode === "Tic-Tac-Toe" ? "bg-white border-4 border-slate-700 p-3" : "bg-white border-4 border-slate-700 p-2"}`}
          style={{ width: boardViewportSize, height: boardViewportSize }}
        >
          {mode === "Chess" ? (
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
                      ${isLight ? "bg-slate-200" : "bg-slate-400"}
                      ${isSelected ? "ring-4 ring-blue-500 ring-inset z-10" : ""}
                      ${!isReadOnly ? "hover:ring-2 hover:ring-blue-300 hover:ring-inset cursor-pointer" : "cursor-not-allowed"}
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
                        color: "#334155",
                        background: isLight ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.18)",
                      }}
                    >
                      {squareLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : mode === "Tic-Tac-Toe" ? (
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
                      ${isLight ? "bg-slate-200" : "bg-slate-400"}
                      ${isSelected ? "ring-4 ring-blue-500 ring-inset z-10" : ""}
                      ${!isReadOnly ? "hover:ring-2 hover:ring-blue-300 hover:ring-inset cursor-pointer" : "cursor-not-allowed"}
                    `}
                    disabled={isReadOnly}
                  >
                    <span className="text-4xl font-bold text-slate-800">{tttValue || ""}</span>
                    <span className={`text-xs absolute top-1 left-1.5 ${isLight ? "text-slate-500" : "text-slate-700"}`}>
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
                {/* Draw preview uses the same normalized strokes that execution uses. */}
                {drawPreviewStrokes.map((stroke, idx) => (
                  <polyline
                    key={idx}
                    points={stroke.map((point) => `${point.x},${point.y}`).join(" ")}
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

        {mode !== "Whiteboard" && (
          <div className="text-sm text-slate-700 bg-white px-4 py-2 rounded shadow">
            Selected Square: <span className="font-bold text-blue-700">{selectedSquare}</span>
          </div>
        )}
        {mode === "Chess" && (
          <div className="text-sm text-slate-700 bg-white px-4 py-2 rounded shadow">
            Test Block: <span className={`font-bold ${blockIsHeld ? "text-amber-700" : "text-emerald-700"}`}>{chessBlockLabel}</span>
          </div>
        )}
        {mode === "Tic-Tac-Toe" && (
          <div className="text-sm text-slate-700 bg-white px-4 py-2 rounded shadow">
            {tttWinner ? `Winner: ${tttWinner}` : `Current Player: ${tttPlayer}`}
          </div>
        )}
        {mode === "Whiteboard" && (
          <div className="text-sm text-slate-700 bg-white px-4 py-2 rounded shadow">
            Drawing Preview: <span className="font-bold text-blue-700">{drawStrokeCount} strokes / {drawPointCount} points</span>
          </div>
        )}
      </div>
    </div>
  );
}
