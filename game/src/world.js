// The city of Solmar Bay, generated from the fixed seed in config.js.
// Avenues run north-south, streets run east-west; the blocks between them
// hold buildings, the park, the docks or the beach. Everything the game
// needs to know about the map lives here: where the roads are, what district
// a point is in, where the gold palm tokens hide, and where cars park.
import { CONFIG } from './config.js';
import { makeRng } from './random.js';

const { avenues, streets, roadHalf, world } = CONFIG;

export function districtAt(x, y) {
  const d = CONFIG.districts;
  if (x < d.beach.x1) return 'beach';
  if (x >= d.docks.x0 && y >= d.docks.y0) return 'docks';
  if (x >= d.park.x0 && x < d.park.x1 && y >= d.park.y0 && y < d.park.y1) return 'park';
  if (x >= d.downtown.x0 && x < d.downtown.x1 && y >= d.downtown.y0 && y < d.downtown.y1) return 'downtown';
  return 'suburbs';
}

// Distance from a point to the nearest road centre line, and whether the
// point is on a road at all. Cars drive faster on roads than off them.
export function roadInfo(x, y) {
  let best = Infinity;
  let axis = 'ave';
  let line = 0;
  for (const ax of avenues) {
    const d = Math.abs(x - ax);
    if (d < best) { best = d; axis = 'ave'; line = ax; }
  }
  for (const sy of streets) {
    const d = Math.abs(y - sy);
    if (d < best) { best = d; axis = 'st'; line = sy; }
  }
  return { dist: best, onRoad: best <= roadHalf, axis, line };
}

// The nearest point on a road centre line, used to snap wandering cars and
// pedestrians back onto the grid.
export function nearestRoadPoint(x, y) {
  const info = roadInfo(x, y);
  if (info.axis === 'ave') return { x: info.line, y, axis: 'ave', line: info.line };
  return { x, y: info.line, axis: 'st', line: info.line };
}

export function buildWorld(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const containers = [];
  const parkedCars = [];
  const tokens = [];
  const pickups = [];

  // One block is the rectangle between two neighbouring avenues and streets.
  const xs = [0, ...avenues, world.width];
  const ys = [0, ...streets, world.height];
  for (let bi = 0; bi < xs.length - 1; bi++) {
    for (let bj = 0; bj < ys.length - 1; bj++) {
      const x0 = xs[bi] + roadHalf + 14;
      const x1 = xs[bi + 1] - roadHalf - 14;
      const y0 = ys[bj] + roadHalf + 14;
      const y1 = ys[bj + 1] - roadHalf - 14;
      if (x1 - x0 < 60 || y1 - y0 < 60) continue;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      if (district === 'beach') {
        // Palms and beach huts along the sand.
        const n = rng.int(2, 4);
        for (let i = 0; i < n; i++) {
          trees.push({ x: rng.range(x0 + 20, x1 - 20), y: rng.range(y0 + 20, y1 - 20), palm: true });
        }
        continue;
      }
      if (district === 'park') {
        // The park keeps its lawn, pond and trees; nothing is built on it.
        const n = rng.int(6, 10);
        for (let i = 0; i < n; i++) {
          trees.push({ x: rng.range(x0 + 16, x1 - 16), y: rng.range(y0 + 16, y1 - 16), palm: rng.chance(0.35) });
        }
        continue;
      }
      if (district === 'docks') {
        // Stacked shipping containers and a crane yard.
        const n = rng.int(3, 6);
        for (let i = 0; i < n; i++) {
          containers.push({
            x: rng.range(x0 + 30, x1 - 30),
            y: rng.range(y0 + 24, y1 - 24),
            w: rng.range(70, 130),
            h: 30,
            color: rng.pick(CONFIG.palette.container),
          });
        }
        continue;
      }
      // Downtown towers and suburban houses, one or two per block.
      const tall = district === 'downtown';
      const count = tall ? rng.int(1, 2) : rng.int(2, 4);
      for (let i = 0; i < count; i++) {
        const w = tall ? rng.range(90, 150) : rng.range(50, 90);
        const h = tall ? rng.range(90, 150) : rng.range(44, 80);
        const bx = rng.range(x0 + w / 2, x1 - w / 2);
        const by = rng.range(y0 + h / 2, y1 - h / 2);
        const palette = tall ? CONFIG.palette.downtownRoof : CONFIG.palette.suburbRoof;
        buildings.push({
          x: bx, y: by, w, h,
          color: rng.pick(palette),
          height: tall ? rng.int(3, 9) : rng.int(1, 2),
          district,
        });
      }
      // A tree or two on the block's corners.
      if (rng.chance(0.7)) {
        trees.push({ x: x0 + 18, y: y0 + 18, palm: false });
      }
      if (rng.chance(0.5)) {
        trees.push({ x: x1 - 18, y: y1 - 18, palm: rng.chance(0.4) });
      }
    }
  }

  // Parked cars line the roads, a few per avenue and street.
  const carTypes = ['sedan', 'sedan', 'taxi', 'sport', 'truck'];
  for (const ax of avenues) {
    const n = rng.int(3, 5);
    for (let i = 0; i < n; i++) {
      parkedCars.push({
        x: ax + (rng.chance(0.5) ? roadHalf - 12 : -(roadHalf - 12)),
        y: rng.range(120, world.height - 120),
        angle: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2,
        type: rng.pick(carTypes),
      });
    }
  }
  for (const sy of streets) {
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      parkedCars.push({
        x: rng.range(500, world.width - 120),
        y: sy + (rng.chance(0.5) ? roadHalf - 12 : -(roadHalf - 12)),
        angle: rng.chance(0.5) ? 0 : Math.PI,
        type: rng.pick(carTypes),
      });
    }
  }

  // Ten gold palm tokens are hidden around the city: the beach, the park,
  // the docks, downtown plazas and the suburbs.
  const tokenSpots = [
    [240, 420], [280, 1980], [1180, 1180], [1420, 1380], [2560, 1650],
    [2900, 1980], [1080, 480], [1880, 720], [2280, 420], [620, 1620],
  ];
  for (let i = 0; i < tokenSpots.length; i++) {
    const [tx, ty] = tokenSpots[i];
    tokens.push({ id: i, x: tx + rng.range(-30, 30), y: ty + rng.range(-30, 30), taken: false });
  }

  // Health and ammo crates near the hospital, the docks and the park.
  pickups.push({ kind: 'health', x: 1560, y: 660 });
  pickups.push({ kind: 'ammo', x: 1640, y: 660 });
  pickups.push({ kind: 'health', x: 2620, y: 1780 });
  pickups.push({ kind: 'ammo', x: 1300, y: 1120 });
  pickups.push({ kind: 'health', x: 300, y: 900 });

  return {
    seed,
    buildings,
    trees,
    containers,
    parkedCars,
    tokens,
    pickups,
    // Fixed places the story uses.
    places: {
      rosaGarage: { x: 2320, y: 420, label: "Rosa's garage" },
      docksGate: { x: 2620, y: 1620, label: 'Dockside gate' },
      beachMeet: { x: 250, y: 1500, label: 'Beach meet' },
      downtownBank: { x: 1500, y: 480, label: 'Solmar Bank' },
      hideout: { x: 2920, y: 420, label: 'Hideout' },
      hospital: { x: 1560, y: 620, label: 'Solmar General' },
      parkFountain: { x: 1300, y: 1200, label: 'Park fountain' },
      courierStart: { x: 800, y: 1800, label: 'Courier route' },
    },
  };
}

// True when a circle of radius r at (x, y) overlaps a building or a
// container. The ocean edge also blocks movement.
export function collidesSolid(world, x, y, r) {
  if (x < 130 + r || x > CONFIG.world.width - r || y < r || y > CONFIG.world.height - r) return true;
  for (const b of world.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 + r && Math.abs(y - b.y) < b.h / 2 + r) return true;
  }
  for (const c of world.containers) {
    if (Math.abs(x - c.x) < c.w / 2 + r && Math.abs(y - c.y) < c.h / 2 + r) return true;
  }
  return false;
}

// Slide a moving circle against solids: try the full step, then x-only,
// then y-only, so cars and walkers slide along walls instead of sticking.
export function moveWithCollision(world, x, y, dx, dy, r) {
  if (!collidesSolid(world, x + dx, y + dy, r)) return { x: x + dx, y: y + dy };
  if (!collidesSolid(world, x + dx, y, r)) return { x: x + dx, y };
  if (!collidesSolid(world, x, y + dy, r)) return { x, y: y + dy };
  return { x, y };
}
