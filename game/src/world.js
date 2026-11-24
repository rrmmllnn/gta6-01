// The city of Solmar Bay: a fixed grid of avenues and streets, blocks filled with
// buildings, a park, a beach along the south edge and docks on the east edge. All
// of it is generated from one seed, so the same seed always builds the same city.
// Also answers the questions the game keeps asking: is this point on a road, is
// it inside a building, where is the nearest road.

import { AVENUES, PALETTE, ROAD, STREETS, WORLD } from './config.js';
import { clamp, pick, range } from './random.js';

export const ZONE = { DOWNTOWN: 'downtown', BEACH: 'beach', DOCKS: 'docks', PARK: 'park', HOMES: 'homes' };

/** Landmarks the missions and the HUD point at, by name. */
export const LANDMARKS = {
  garage: { x: 800, y: 800, label: "Rosa's Garage" },
  hideout: { x: 480, y: 1440, label: 'Hideout' },
  bank: { x: 1440, y: 800, label: 'Solmar Bank' },
  docks: { x: 2400, y: 1120, label: 'East Docks' },
  hospital: { x: 1120, y: 480, label: 'St. Anselm Hospital' },
  beach: { x: 1120, y: 1840, label: 'Palmera Beach' },
  park: { x: 1760, y: 480, label: 'Cactus Park' },
};

export function createWorld(random) {
  const buildings = [];
  const palms = [];
  const lamps = [];

  // One block is the rectangle between two neighbouring avenues and streets.
  for (let ax = 0; ax < AVENUES.length - 1; ax += 1) {
    for (let sy = 0; sy < STREETS.length - 1; sy += 1) {
      const x0 = AVENUES[ax] + ROAD / 2 + 14;
      const x1 = AVENUES[ax + 1] - ROAD / 2 - 14;
      const y0 = STREETS[sy] + ROAD / 2 + 14;
      const y1 = STREETS[sy + 1] - ROAD / 2 - 14;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      // The park block stays green; the beach strip stays sand.
      if (ax === 4 && sy === 0) continue;
      if (sy === STREETS.length - 1) continue;
      const downtown = ax >= 2 && ax <= 4 && sy >= 1 && sy <= 3;
      const homes = ax === 0;
      const count = homes ? 2 : downtown ? 1 : 2 + Math.floor(random() * 2);
      for (let b = 0; b < count; b += 1) {
        const w = range(random, 70, (x1 - x0) / count - 26);
        const h = range(random, 60, (y1 - y0) - 40);
        const bx = x0 + ((x1 - x0) / count) * b + range(random, 8, 24);
        const by = y0 + range(random, 10, Math.max(11, y1 - y0 - h - 10));
        buildings.push({
          x: bx, y: by, w, h,
          tall: downtown && random() < 0.6,
          color: pick(random, PALETTE.building),
          roof: pick(random, PALETTE.roof),
        });
      }
      // Palms line the sidewalks; lamps stand at the corners.
      if (random() < 0.8) palms.push({ x: x0 + 8, y: y0 + 8 });
      if (random() < 0.6) palms.push({ x: x1 - 8, y: y1 - 8 });
      lamps.push({ x: x0 - 6, y: y0 - 6 });
      lamps.push({ x: x1 + 6, y: y0 - 6 });
    }
  }
  // Beach palms along the sand.
  for (let i = 0; i < 14; i += 1) {
    palms.push({ x: 120 + i * 170 + range(random, -30, 30), y: 1830 + range(random, -14, 14) });
  }
  // Dock crates on the east edge.
  for (let i = 0; i < 8; i += 1) {
    buildings.push({
      x: 2430 + range(random, -20, 60), y: 300 + i * 160 + range(random, -20, 20),
      w: 46, h: 46, tall: false, color: '#8a6a4a', roof: '#5a4632',
    });
  }

  function onRoad(x, y) {
    for (const a of AVENUES) if (Math.abs(x - a) < ROAD / 2) return true;
    for (const s of STREETS) if (Math.abs(y - s) < ROAD / 2) return true;
    return false;
  }

  function zoneAt(x, y) {
    if (y > STREETS[STREETS.length - 1] + ROAD / 2) return ZONE.BEACH;
    if (x > AVENUES[AVENUES.length - 1] + ROAD / 2) return ZONE.DOCKS;
    if (x > 1600 && x < 1950 && y > 320 && y < 640) return ZONE.PARK;
    if (x > 880 && x < 1680 && y > 640 && y < 1280) return ZONE.DOWNTOWN;
    if (x < 340) return ZONE.HOMES;
    return ZONE.HOMES;
  }

  /** True when the circle at (x, y, r) overlaps a building or leaves the city. */
  function blocked(x, y, r) {
    if (x < r || y < r || x > WORLD.width - r || y > WORLD.height - r) return true;
    for (const b of buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
    }
    return false;
  }

  /** Push a circle out of buildings and the city edge; returns the fixed position. */
  function resolveCollision(x, y, r) {
    let nx = clamp(x, r, WORLD.width - r);
    let ny = clamp(y, r, WORLD.height - r);
    for (const b of buildings) {
      if (nx + r > b.x && nx - r < b.x + b.w && ny + r > b.y && ny - r < b.y + b.h) {
        const pushLeft = (nx + r) - b.x;
        const pushRight = (b.x + b.w) - (nx - r);
        const pushUp = (ny + r) - b.y;
        const pushDown = (b.y + b.h) - (ny - r);
        const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
        if (min === pushLeft) nx = b.x - r;
        else if (min === pushRight) nx = b.x + b.w + r;
        else if (min === pushUp) ny = b.y - r;
        else ny = b.y + b.h + r;
      }
    }
    return { x: nx, y: ny };
  }

  /** A random point on a road, for spawning traffic and pedestrians. */
  function randomRoadPoint() {
    if (random() < 0.5) {
      return { x: pick(random, AVENUES) + range(random, -28, 28), y: range(random, 60, WORLD.height - 60) };
    }
    return { x: range(random, 60, WORLD.width - 60), y: pick(random, STREETS) + range(random, -28, 28) };
  }

  /** A random sidewalk point (just off a road, not inside a building). */
  function randomSidewalkPoint() {
    for (let tries = 0; tries < 20; tries += 1) {
      const p = randomRoadPoint();
      const x = p.x + (random() < 0.5 ? -58 : 58) * (random() < 0.5 ? 1 : 0);
      const y = p.y + (random() < 0.5 ? -58 : 58) * (random() < 0.5 ? 1 : 0);
      if (!blocked(x, y, 14) && !onRoad(x, y)) return { x, y };
    }
    return { x: 800, y: 900 };
  }

  /** The nearest avenue or street centre to a point, and which way it runs. */
  function nearestRoad(x, y) {
    let bestA = AVENUES[0];
    let bestD = Math.abs(x - bestA);
    for (const a of AVENUES) {
      const d = Math.abs(x - a);
      if (d < bestD) { bestD = d; bestA = a; }
    }
    let bestS = STREETS[0];
    let bestSD = Math.abs(y - bestS);
    for (const s of STREETS) {
      const d = Math.abs(y - s);
      if (d < bestSD) { bestSD = d; bestS = s; }
    }
    if (bestD <= bestSD) return { axis: 'v', at: bestA, dist: bestD };
    return { axis: 'h', at: bestS, dist: bestSD };
  }

  return {
    buildings, palms, lamps,
    onRoad, zoneAt, blocked, resolveCollision,
    randomRoadPoint, randomSidewalkPoint, nearestRoad,
  };
}
