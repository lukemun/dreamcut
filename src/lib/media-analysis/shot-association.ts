export type Shot = { shot_id: string; start_seconds: number; end_seconds: number };
export type TimedDetection = { detection_id: string; time_seconds: number };

export function associateDetectionsToShots<T extends TimedDetection>(detections: T[], shots: Shot[]): Array<T & { shot_id: string | null }> {
  return detections.map((detection) => ({
    ...detection,
    shot_id: shots.find((shot, index) => detection.time_seconds >= shot.start_seconds
      && (detection.time_seconds < shot.end_seconds || (index === shots.length - 1 && detection.time_seconds === shot.end_seconds)))?.shot_id ?? null,
  }));
}
