//preset tuning bundles for common drawing tradeoffs.
import type { DrawQualityPreset, DrawTuning } from "../types";

export const DRAW_TUNING_PRESETS: Record<DrawQualityPreset, DrawTuning> = {
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
