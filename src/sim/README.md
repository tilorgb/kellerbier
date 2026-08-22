Deterministic game simulation. No Pixi import, no DOM, no wall-clock reads.

`sim/` must never import from `render/`; the rule is enforced by lint (issue #7).
