import type { GunMode } from '../data/retail-gun';

export function GunModeSelect({
  value,
  onChange,
}: {
  value: GunMode;
  onChange?: (mode: GunMode) => void;
}) {
  return (
    <label>
      Bullet mechanics{' '}
      <select
        aria-label="Bullet mechanics"
        value={value}
        onChange={(event) => onChange?.(event.target.value === 'retail' ? 'retail' : 'remake')}
      >
        <option value="remake">Remake — individual rounds</option>
        <option value="retail">OG — retail-derived / yellow diamonds</option>
      </select>
    </label>
  );
}
