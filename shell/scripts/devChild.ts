interface Child {
  readonly exited: Promise<number>;
  kill(): void;
}

/** Only the current child owns session shutdown; retired children are intentional. */
export class DevChild {
  private current: Child | undefined;
  private stopped = false;

  constructor(private readonly onExit: (code: number) => void) {}

  launch(spawn: () => Child): void {
    if (this.stopped) return;
    const child = spawn();
    this.current = child;
    void child.exited.then((code) => {
      if (this.current === child && !this.stopped) this.onExit(code);
    });
  }

  async retire(): Promise<void> {
    const child = this.current;
    this.current = undefined;
    child?.kill();
    await child?.exited;
  }

  stop(): void {
    this.stopped = true;
    this.current?.kill();
    this.current = undefined;
  }
}
