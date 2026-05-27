const BAR_COUNT = 20;

type MicLevelMeterProps = {
  level: number;
  active: boolean;
};

/** Vertical bars that rise with mic volume (like a mic test). */
export function MicLevelMeter({ level, active }: MicLevelMeterProps) {
  const bars = Array.from({ length: BAR_COUNT }, (_, index) => {
    const center = (BAR_COUNT - 1) / 2;
    const distance = Math.abs(index - center) / center;
    const shape = 1 - distance * 0.55;
    const threshold = index / BAR_COUNT;
    const driven = active ? level * shape : 0;
    const height = active
      ? Math.max(0.08, Math.min(1, driven * 1.25 + (level > threshold * 0.7 ? 0.2 : 0)))
      : 0.08;

    return (
      <span
        key={index}
        className={
          active && level > 0.06
            ? "voice-live__meter-bar voice-live__meter-bar--hot"
            : "voice-live__meter-bar"
        }
        style={{ height: `${height * 100}%` }}
      />
    );
  });

  return (
    <div
      className={
        active
          ? "voice-live__meter voice-live__meter--live"
          : "voice-live__meter voice-live__meter--idle"
      }
      role="meter"
      aria-label="Niveau du micro"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level * 100)}
    >
      {bars}
    </div>
  );
}
