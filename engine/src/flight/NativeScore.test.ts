import { expect, test } from 'bun:test';
import { NativeScore, parseScoreProgram } from './NativeScore';
const program = (code: number[]) => parseScoreProgram({ sourceSha256: 'a'.repeat(64), code });
const prefix = [255, 65, 73, 82, 0];
test('native prefix, direct/random/chance tracks, flag and stop have bounded semantics', () => {
  const vm = new NativeScore(
    program([...prefix, 1, 253, 2, 2, 3, 251, 0, 4, 249, 251, 100, 5, 252]),
  );
  expect(vm.next()).toBe('AIR01.XMI');
  expect(['AIR02.XMI', 'AIR03.XMI']).toContain(vm.next()!);
  expect(vm.next()).toBe('AIR05.XMI');
  expect(vm.hostFlag).toBe(true);
  expect(vm.next()).toBeUndefined();
  expect(vm.stopped).toBe(true);
  expect(vm.next()).toBeUndefined();
});
test('jump loops yield tracks; non-yielding loops stop at instruction budget', () => {
  const vm = new NativeScore(program([...prefix, 1, 254, 5, 0, 0, 0]));
  expect(vm.next()).toBe('AIR01.XMI');
  expect(vm.next()).toBe('AIR01.XMI');
  const loop = new NativeScore(program([254, 0, 0, 0, 0]));
  expect(() => loop.next()).toThrow('budget');
  expect(loop.stopped).toBe(true);
});
test('score validator rejects truncations, operand jumps, invalid choices and provenance', () => {
  for (const code of [
    [],
    [255, 65],
    [253, 0],
    [251, 101, 1, 252],
    [254, 1, 0, 0, 0],
    [254, 200, 0, 0, 0],
  ])
    expect(() => program(code)).toThrow();
  expect(() => parseScoreProgram({ sourceSha256: '', code: [252] })).toThrow();
});
