import { TC_NAME, TC_SHORT, TIME_CONTROLS, type TimeControl } from '../rules/timeControl';
import { setSettings, useSettings } from './settings/store';

/** Time-control segmented switch. Writes the shared "new games" preference. */
export function ClockPicker({ label = 'Clock', disabled }: { label?: string; disabled?: boolean }) {
  const { timeControl } = useSettings();
  const pick = (tc: TimeControl) => setSettings({ timeControl: tc });
  return (
    <div className="clock-picker">
      <div className="field-label">{label}</div>
      <div className="seg seg-small seg-clock" role="radiogroup" aria-label={label} data-testid="clock-picker">
        {TIME_CONTROLS.map((tc) => (
          <button key={tc} role="radio" aria-checked={timeControl === tc} disabled={disabled}
            className={`seg-btn ${timeControl === tc ? 'on' : ''}`} onClick={() => pick(tc)} data-testid={`tc-${tc}`}>
            <span><b>{TC_SHORT[tc]}</b><small>{TC_NAME[tc]}</small></span>
          </button>
        ))}
      </div>
    </div>
  );
}
