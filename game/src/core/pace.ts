export const PACE_MIN = 0;
export const PACE_MAX = 9;
export const clampPace = (step: number): number => Math.min(PACE_MAX, Math.max(PACE_MIN, step));

export const perItemSeconds = (paceStep: number): number => Math.min(4.0, Math.max(1.5, 4.0 * Math.pow(0.9, paceStep)));

export const patienceMs = (tappableItems: number, paceStep: number, assist: boolean): number =>
  Math.round((5 + tappableItems * perItemSeconds(paceStep)) * 1000 * (assist ? 1.3 : 1));

export const kioskIntervalMs = (paceStep: number): number =>
  Math.min(900, Math.max(500, Math.round(900 * Math.pow(0.9, paceStep))));
