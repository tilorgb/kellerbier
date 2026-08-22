// Fixture: the simulation reading a clock it is not allowed to have.
export function stamp(): number {
  return Date.now() + performance.now();
}
