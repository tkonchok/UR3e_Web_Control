//shared frontend types for status payloads and UI state.
export type GameMode = "Chess" | "Tic-Tac-Toe" | "Whiteboard";
export type ConnectionStatus = "Connected" | "Disconnected";
export type RobotState = "Idle" | "Moving";
export type ControlStatus = "YOU" | "Read-only";
export type BoardProfileOption = { id: string; label: string };
export type DrawPoint = { x: number; y: number };
export type DrawStroke = DrawPoint[];
export type DrawQualityPreset = "fast" | "balanced" | "detail";

export type DrawTuning = {
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

export type StatusResponse = {
  ok: boolean;
  connection: ConnectionStatus | string;
  robotState: RobotState | string;
  lastAction?: string | null;
  lastTarget?: string | null;
  boardProfile?: string;
  lock?: { held: boolean; yours: boolean; expiresInMs: number };
};
