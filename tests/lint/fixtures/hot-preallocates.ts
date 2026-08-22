/**
 * Fixture: the allowed shape. Storage is allocated once, in the constructor,
 * and the per-tick path only writes into it.
 *
 * @hot
 */
export class Store {
  private readonly values: Float32Array;

  constructor(capacity: number) {
    this.values = new Float32Array(capacity);
  }

  step(): void {
    for (let index = 0; index < this.values.length; index++) {
      this.values[index] = (this.values[index] ?? 0) + 1;
    }
  }
}
