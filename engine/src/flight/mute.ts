/** Shared global mute. Flight and menu audio observe one state and register one
 * window listener between them, so `M` never toggles twice in a single press. */
export type MuteListener = (muted: boolean) => void;

/** Typing `M` into a field is text, not a shortcut. */
export function isEditingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      Boolean(target.closest('input,textarea,select,button,[contenteditable="true"]')))
  );
}

class MuteControl {
  private listeners = new Set<MuteListener>();
  private state = false;
  private key = (event: KeyboardEvent): void => {
    if (
      event.code !== 'KeyM' ||
      event.repeat ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      isEditingTarget(event.target)
    )
      return;
    event.preventDefault();
    this.toggle();
  };

  get muted(): boolean {
    return this.state;
  }

  toggle(): void {
    this.state = !this.state;
    for (const listener of this.listeners) listener(this.state);
  }

  /** Reference counted: the keydown listener exists only while someone is listening. */
  subscribe(listener: MuteListener): () => void {
    if (this.listeners.size === 0) window.addEventListener('keydown', this.key);
    this.listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.listeners.delete(listener);
      if (this.listeners.size === 0) window.removeEventListener('keydown', this.key);
    };
  }
}

export const muteControl = new MuteControl();
