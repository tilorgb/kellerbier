import { describe, expect, it } from 'vitest';
import { FRAME_BUDGET_MS, FrameMetrics } from '../../src/debug/metrics.js';

describe('FrameMetrics', () => {
  it('reports nothing before anything is recorded', () => {
    const metrics = new FrameMetrics(8);
    expect(metrics.count).toBe(0);
    expect(metrics.newest).toBe(-1);
    expect(metrics.peakTotalMs()).toBe(0);
  });

  it('keeps the last N frames and drops the rest', () => {
    const metrics = new FrameMetrics(4);
    for (let frame = 0; frame < 10; frame++) {
      metrics.record(frame, 0, 1);
    }
    expect(metrics.count).toBe(4);

    const seen: number[] = [];
    metrics.forEachFrame((slot) => {
      seen.push(metrics.simMs[slot] ?? 0);
    });
    // Oldest first, and only the last four.
    expect(seen).toEqual([6, 7, 8, 9]);
  });

  it('walks the history in order across the ring seam', () => {
    const metrics = new FrameMetrics(3);
    metrics.record(1, 0, 1);
    metrics.record(2, 0, 1);
    metrics.record(3, 0, 1);
    metrics.record(4, 0, 1);

    const positions: number[] = [];
    metrics.forEachFrame((slot, position) => {
      positions.push(position);
      expect(metrics.simMs[slot]).toBe(position + 2);
    });
    expect(positions).toEqual([0, 1, 2]);
  });

  it('totals the two halves of a frame', () => {
    const metrics = new FrameMetrics(4);
    metrics.record(3, 5, 1);
    expect(metrics.totalMs[metrics.newest]).toBe(8);
  });

  it('makes a deliberate stall the peak of the history', () => {
    const metrics = new FrameMetrics(120);
    // A hundred ordinary frames, comfortably inside budget.
    for (let frame = 0; frame < 100; frame++) {
      metrics.record(0.4, 1.1, 1);
    }
    expect(metrics.peakTotalMs()).toBeLessThan(FRAME_BUDGET_MS);

    // One frame with five extra milliseconds spent in the simulation.
    metrics.record(0.4 + 5, 1.1, 1);

    // The stall stands out from the average by far more than the noise around
    // it — which is the whole reason the graph scales to the peak.
    const peak = metrics.peakTotalMs();
    const average = metrics.averageOf(metrics.totalMs);
    expect(peak).toBeGreaterThan(average * 3);
    expect(peak - average).toBeGreaterThan(4);
  });

  it('forgets everything on reset', () => {
    const metrics = new FrameMetrics(4);
    metrics.record(1, 1, 1);
    metrics.reset();
    expect(metrics.count).toBe(0);
    expect(metrics.peakTotalMs()).toBe(0);
  });
});
