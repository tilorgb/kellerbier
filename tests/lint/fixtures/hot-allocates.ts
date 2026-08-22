/**
 * Fixture: allocation inside the frame loop.
 *
 * @hot
 */
export function step(values: number[]): unknown {
  const scratch = { x: 0, y: 0 };
  const doubled = values.map((value) => value * 2);
  return [scratch, doubled, ...values];
}
