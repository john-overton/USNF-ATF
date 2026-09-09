import { describe, expect, test } from 'bun:test';

import { DevChild } from './devChild';

function fakeChild() {
  let exit!: (code: number) => void;
  const exited = new Promise<number>((resolve) => {
    exit = resolve;
  });
  return { exited, exit, kill: () => exit(143) };
}

describe('development child lifecycle', () => {
  test('two deliberate restarts keep the session alive, user exit shuts it down', async () => {
    const exits: number[] = [];
    const session = new DevChild((code) => exits.push(code));
    for (let i = 0; i < 2; i++) {
      session.launch(fakeChild);
      await session.retire();
    }
    expect(exits).toEqual([]);
    const current = fakeChild();
    session.launch(() => current);
    current.exit(0);
    await current.exited;
    expect(exits).toEqual([0]);
  });

  test('shutdown while a rebuild is pending cannot launch another child', async () => {
    const exits: number[] = [];
    const session = new DevChild((code) => exits.push(code));
    const child = fakeChild();
    session.launch(() => child);
    session.stop();
    let launches = 0;
    session.launch(() => {
      launches++;
      return fakeChild();
    });
    await child.exited;
    expect(launches).toBe(0);
    expect(exits).toEqual([]);
  });
});
