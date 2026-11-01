// The speed panel at the bottom of the screen: the speed readout, the slider that sets the target
// speed, and Auto (stop-and-go riding and the next preset at each stop, together).
import { MPH, type Params } from './params';
import type { CityRide } from './sim/city';

export class RidePanel {
  readonly el = document.getElementById('ride')!;
  private speed = document.getElementById('ride-speed')!;
  private unit = document.getElementById('ride-unit')!;
  private slider = document.getElementById('ride-slider') as HTMLInputElement;
  private auto = document.getElementById('auto-next') as HTMLInputElement;

  /** `now` is the simulation's time; `onAuto` runs after Auto is turned on or off. */
  constructor(private p: Params, city: CityRide, now: () => number, onAuto: () => void) {
    // Turned off, the bike rides on steadily at the cruise speed; turned on, the trips start from
    // the speed it was riding at.
    this.auto.addEventListener('change', () => {
      const on = this.auto.checked;
      if (on && !p.cityMode) { if (p.speed > 0) p.citySpeed = p.speed; p.cityMode = true; city.start(now(), p); }
      if (!on && p.cityMode) { p.cityMode = false; p.speed = p.citySpeed; p.braking = false; }
      onAuto();
    });
    this.slider.addEventListener('input', () => {
      const v = Number(this.slider.value);
      if (p.cityMode) {
        p.citySpeed = v;
        if (city.phase === 'go' || city.phase === 'cruise') p.speed = v * city.fraction * city.share;
      } else {
        p.speed = v; p.braking = false;
      }
    });
  }

  update(actualMps: number) {
    const p = this.p, mph = p.speedUnit === 'mph';
    this.speed.textContent = (actualMps / (mph ? MPH : 1 / 3.6)).toFixed(1);
    this.unit.textContent = p.speedUnit;
    this.slider.max = mph ? '40' : '65';
    // The slider sets the target: the cruise speed in stop-and-go, otherwise the riding speed.
    if (document.activeElement !== this.slider) this.slider.value = String(p.cityMode ? p.citySpeed : p.speed);
    this.auto.checked = p.cityMode;
  }
}
