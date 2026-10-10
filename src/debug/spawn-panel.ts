import type { GameSim } from '../sim/game/sim.js';

/**
 * The spawn panel of the debug build (`npm run build:release` writes it next
 * to the release as `Kellerbier-debug.html`; `npm run dev` has it too): put
 * any enemy or pickup next to Alois, hand him any item, or clear the room —
 * for trying a thing out without hunting a seed that offers it.
 *
 * Plain DOM over the canvas, toggled with F8 or its button (Escape closes it), with its own
 * controls spelled out on screen — the closed hint and the panel's "Steuerung" block. Everything it does
 * writes the simulation directly, outside the input log, so a run touched by
 * it does not replay faithfully — which is fine for a build that exists to
 * poke at the game, and why it never ships in the player's release.
 *
 * `liveSim` is a getter because a restart replaces the sim.
 */
export function mountSpawnPanel(liveSim: () => GameSim): void {
  const sim0 = liveSim();

  const root = document.createElement('div');
  root.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:10000;font:12px monospace;color:#f4e6c8;' +
    'background:rgba(20,16,12,0.92);border:1px solid #d99a3f;border-radius:4px;padding:8px;' +
    'display:none;flex-direction:column;gap:6px;min-width:260px;';
  // Keys typed into the panel must not walk Alois about.
  for (const type of ['keydown', 'keyup'] as const) {
    root.addEventListener(type, (event) => {
      if (event.key !== 'F8') event.stopPropagation();
    });
  }

  // Closed, the panel is this hint: what the build has and how to get at it.
  const toggle = document.createElement('button');
  toggle.innerHTML =
    '<b>Debug-Build</b><br>F8 oder hier klicken:<br>Gegner, Items, Pickups spawnen';
  toggle.title = 'Debug-Menü öffnen (F8)';
  toggle.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:10001;font:11px/1.35 monospace;padding:4px 8px;' +
    'text-align:left;background:rgba(42,32,24,0.9);color:#d99a3f;border:1px solid #d99a3f;' +
    'border-radius:3px;cursor:pointer;';

  const setOpen = (open: boolean): void => {
    root.style.display = open ? 'flex' : 'none';
    toggle.style.display = open ? 'none' : 'block';
  };

  const title = document.createElement('div');
  title.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
  const heading = document.createElement('b');
  heading.textContent = 'Spawnen';
  const close = button('×', () => {
    setOpen(false);
  });
  title.append(heading, close);
  root.append(title);

  /** A row: a choice list and the button that acts on its value. */
  const row = (
    label: string,
    options: readonly { readonly id: string; readonly name: string }[],
    action: string,
    run: (id: string) => void,
  ): void => {
    const caption = document.createElement('div');
    caption.textContent = label;
    caption.style.cssText = 'color:#d99a3f;margin-top:4px;';
    const line = document.createElement('div');
    line.style.cssText = 'display:flex;gap:4px;';
    const select = document.createElement('select');
    select.style.cssText = 'flex:1;font:12px monospace;max-width:200px;';
    for (const option of [...options].sort((a, b) => a.name.localeCompare(b.name))) {
      const element = document.createElement('option');
      element.value = option.id;
      element.textContent = option.name === option.id ? option.id : `${option.name} (${option.id})`;
      select.append(element);
    }
    line.append(
      select,
      button(action, () => {
        run(select.value);
      }),
    );
    root.append(caption, line);
  };

  row(
    'Gegner',
    sim0.enemies.all.map((enemy) => ({ id: enemy.id, name: enemy.name })),
    'Spawnen',
    (id) => {
      const sim = liveSim();
      const index = sim.enemies.indexOf(id);
      if (index < 0) return;
      const [x, y] = spotNearPlayer(sim, 48);
      sim.spawnEnemyKind(index, x, y);
    },
  );

  row(
    'Item',
    sim0.items.all.map((item) => ({ id: item.id, name: item.id })),
    'Geben',
    (id) => {
      const sim = liveSim();
      if (sim.items.indexOf(id) >= 0) sim.pickUpItem(id);
    },
  );

  row(
    'Pickup',
    sim0.pickups.all.map((pickup) => ({ id: pickup.id, name: pickup.id })),
    'Ablegen',
    (id) => {
      const sim = liveSim();
      const [x, y] = spotNearPlayer(sim, 24);
      sim.spawnPickup(id, x, y);
    },
  );

  const tools = document.createElement('div');
  tools.style.cssText = 'display:flex;gap:4px;margin-top:6px;';
  tools.append(
    button('Alle Gegner töten', () => {
      const sim = liveSim();
      const doomed: number[] = [];
      sim.world.forEach(sim.enemyMask, (index) => {
        doomed.push(index);
      });
      for (const index of doomed) sim.kill(index);
    }),
    button('Volles Leben', () => {
      const sim = liveSim();
      const at = sim.playerIndex * 2;
      sim.health.data[at] = sim.health.data[at + 1] ?? 0;
    }),
  );
  root.append(tools);

  // How to drive it, right where it is used.
  const help = document.createElement('div');
  help.style.cssText =
    'margin-top:6px;padding-top:6px;border-top:1px solid #5a4632;color:#bba98a;font-size:11px;line-height:1.4;';
  help.innerHTML = [
    '<b style="color:#d99a3f">Steuerung</b>',
    'F8 / Esc / × – Menü öffnen und schließen',
    'Liste wählen, dann den Knopf daneben:',
    '· Spawnen – Gegner neben Alois',
    '· Geben – Item sofort in Alois’ Besitz',
    '· Ablegen – Pickup neben Alois',
    'Tasten im Menü steuern Alois nicht;',
    'nach einem Klick geht die Steuerung zurück ans Spiel.',
    'Gespawntes wird nicht in der Lauf-Aufzeichnung gespeichert.',
  ].join('<br>');
  root.append(help);

  toggle.addEventListener('click', () => {
    setOpen(true);
    toggle.blur();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'F8') {
      event.preventDefault();
      setOpen(root.style.display === 'none');
    }
  });
  // Escape closes the open panel without also reaching the game's own Escape (the pause menu).
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && root.style.display !== 'none') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
      }
    },
    { capture: true },
  );
  document.body.append(root, toggle);
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.textContent = label;
  element.style.cssText =
    'font:12px monospace;background:#3a2c20;color:#f4e6c8;border:1px solid #8f6d4e;' +
    'border-radius:3px;padding:2px 6px;cursor:pointer;';
  element.addEventListener('click', (event) => {
    onClick();
    // Hand the keys back to the game, so Alois can be steered straight away.
    (event.currentTarget as HTMLElement).blur();
  });
  return element;
}

/**
 * A free spot `distance` from Alois: tried round him in eighths, starting to
 * his right, the first one the room has clear wins; his own spot if none is.
 */
function spotNearPlayer(sim: GameSim, distance: number): [number, number] {
  const px = sim.positionX(sim.playerIndex);
  const py = sim.positionY(sim.playerIndex);
  for (let step = 0; step < 8; step++) {
    const angle = (step / 8) * Math.PI * 2;
    const x = px + Math.cos(angle) * distance;
    const y = py + Math.sin(angle) * distance;
    if (sim.room.isClear(x, y, 10)) return [x, y];
  }
  return [px, py];
}
