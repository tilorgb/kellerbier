import {
  type BufferAttribute,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
} from 'three';
import type { Texture } from '../../src/render/gfx/index.js';

/**
 * Reading a `Billboard` back out of the scene graph.
 *
 * A billboard shows a frame by writing that frame's rectangle into its quad's
 * UV attribute, and mirrors it by swapping the U edges
 * (`render/world/billboard.ts`). So which frame a body is drawing, and which
 * way it faces, are both readable from the mesh alone — which is what lets a
 * test look at what the renderer *would draw* without a getter per question.
 */
export type BillboardMesh = Mesh<PlaneGeometry, MeshStandardMaterial>;

/** Every billboard quad directly under `root`: a lit plane with the alpha-tested shadow material a `Billboard` gives itself. */
export function billboardMeshes(root: Object3D, visibleOnly = true): BillboardMesh[] {
  return root.children.filter(
    (child): child is BillboardMesh =>
      child instanceof Mesh &&
      child.geometry instanceof PlaneGeometry &&
      (child as Mesh).material instanceof MeshStandardMaterial &&
      (child as Mesh).customDepthMaterial instanceof MeshDepthMaterial &&
      (!visibleOnly || child.visible),
  );
}

/** Whether the quad's U edges are swapped — a left-authored strip walking right. */
export function isMirrored(mesh: BillboardMesh): boolean {
  const uv = mesh.geometry.getAttribute('uv') as BufferAttribute;
  return uv.getX(0) > uv.getX(1);
}

/** Which of `frames` the quad's UVs currently point at, or -1 for none of them. */
export function frameShown(mesh: BillboardMesh, frames: readonly Texture[]): number {
  const uv = mesh.geometry.getAttribute('uv') as BufferAttribute;
  const left = Math.min(uv.getX(0), uv.getX(1));
  const right = Math.max(uv.getX(0), uv.getX(1));
  const top = uv.getY(0);
  const bottom = uv.getY(2);
  return frames.findIndex((frame) => {
    if (frame.source.texture !== mesh.material.map) {
      return false;
    }
    const [u0, v0, u1, v1] = frame.uvs();
    return close(u0, left) && close(u1, right) && close(v0, top) && close(v1, bottom);
  });
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}
