export type TimeRange = {
  start: string; // HH:mm
  end: string; // HH:mm
};

export type MinuteRange = {
  startMin: number;
  endMin: number; // exclusive
};

export const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export const minutesToTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
};

// Interval overlap using [start, end) semantics
export const rangesOverlap = (a: MinuteRange, b: MinuteRange): boolean => {
  return a.startMin < b.endMin && a.endMin > b.startMin;
};

export const buildCandidateStartTimes = (
  windows: TimeRange[],
  stepMinutes: number,
  durationMinutes: number
): string[] => {
  if (stepMinutes <= 0 || durationMinutes <= 0) return [];

  const acc: number[] = [];

  for (const w of windows) {
    const startMin = timeToMinutes(w.start);
    const endMin = timeToMinutes(w.end);
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) continue;
    if (endMin <= startMin) continue;

    for (let t = startMin; t + durationMinutes <= endMin; t += stepMinutes) {
      acc.push(t);
    }
  }

  return [...new Set(acc)].sort((a, b) => a - b).map(minutesToTime);
};
