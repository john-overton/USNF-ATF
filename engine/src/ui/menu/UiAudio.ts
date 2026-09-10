import { UI_SOUNDS, type UiSound } from '../../data/retail-menu';
import { flightPcm, resampleFlightPcm } from '../../flight/FlightAudio';
import { isEditingTarget, muteControl } from '../../flight/mute';

// The bundle parser owns the canonical names and their retail resource mapping.
export { UI_SOUNDS, type UiSound } from '../../data/retail-menu';

/** Structural, so a parsed bundle clip fits without dragging its provenance
 * fields in and the service stays testable without one. */
export interface UiClip {
  sampleRate: number;
  pcm: number[];
}
export type UiClips = Partial<Record<UiSound, UiClip>>;

/** Same limits the flight manifest enforces: the engine never trusts the bundle. */
function usable(clip: UiClip | undefined): clip is UiClip {
  return (
    !!clip &&
    [5512, 8000, 11025].includes(clip.sampleRate) &&
    Array.isArray(clip.pcm) &&
    clip.pcm.length >= 2 &&
    clip.pcm.length <= 1000000 &&
    clip.pcm.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  );
}

/** Menu one-shots. A screen owns one instance and disposes it on unmount.
 * With no retail bundle installed every clip is missing and `play` is silent. */
export class UiAudio {
  private context: AudioContext | undefined;
  private master?: GainNode;
  private buffers: Partial<Record<UiSound, AudioBuffer>> = {};
  private readonly clips: UiClips = {};
  private disposed = false;
  private unsubscribeMute?: () => void;
  private lastPlayed: UiSound | undefined;

  private gesture = (event: Event): void => {
    if (!event.isTrusted || this.disposed) return;
    if (event.type === 'keydown') {
      const key = event as KeyboardEvent;
      if (key.repeat || isEditingTarget(key.target)) return;
    }
    this.unlock();
  };

  constructor(clips: UiClips = {}) {
    for (const name of UI_SOUNDS) {
      const clip = clips[name];
      if (usable(clip)) this.clips[name] = clip;
    }
    // Creating the context only inside a real gesture avoids autoplay warnings.
    window.addEventListener('pointerdown', this.gesture);
    window.addEventListener('keydown', this.gesture);
    this.unsubscribeMute = muteControl.subscribe((muted) => {
      if (this.context && this.master)
        this.master.gain.setTargetAtTime(muted ? 0 : 0.45, this.context.currentTime, 0.04);
    });
  }

  private unlock(): void {
    try {
      if (!this.context) this.create();
      if (this.context?.state === 'suspended') void this.context.resume().catch(() => undefined);
    } catch {
      // A refused context leaves the menu silent rather than broken.
      this.context = undefined;
    }
  }

  private create(): void {
    const context = new AudioContext();
    this.context = context;
    const master = context.createGain();
    master.gain.value = muteControl.muted ? 0 : 0.45;
    master.connect(context.destination);
    this.master = master;
    for (const name of UI_SOUNDS) {
      const clip = this.clips[name];
      if (!clip) continue;
      const pcm = resampleFlightPcm(flightPcm(clip, false), clip.sampleRate, context.sampleRate);
      const buffer = context.createBuffer(1, pcm.length, context.sampleRate);
      buffer.getChannelData(0).set(pcm);
      this.buffers[name] = buffer;
    }
  }

  /** Silent before the first gesture, while muted, and without a bundle. */
  play(name: UiSound): void {
    const context = this.context;
    const buffer = this.buffers[name];
    if (this.disposed || muteControl.muted || !context || !this.master || !buffer) return;
    if (context.state === 'closed') return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = 1;
    source.connect(gain).connect(this.master);
    // Clicks are short and may overlap; each one cleans itself up.
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    this.lastPlayed = name;
    source.start();
  }

  diagnostics(): {
    muted: boolean;
    contextState: AudioContextState | 'locked';
    loaded: UiSound[];
    lastPlayed: UiSound | undefined;
  } {
    return {
      muted: muteControl.muted,
      contextState: this.context?.state ?? 'locked',
      loaded: UI_SOUNDS.filter((name) => name in this.clips),
      lastPlayed: this.lastPlayed,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('pointerdown', this.gesture);
    window.removeEventListener('keydown', this.gesture);
    this.unsubscribeMute?.();
    this.master?.disconnect();
    if (this.context && this.context.state !== 'closed')
      void this.context.close().catch(() => undefined);
  }
}
