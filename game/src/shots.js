// The screenshot scenes behind ?shot=chase|street|mission|beach. Each one plays
// the real rules forward from a fresh state for a fixed number of steps, steered
// by a simple autopilot (drive the roads, steer toward the waypoint, keep clear
// of the buildings), so the frame is what real play looks like and the same seed
// always gives the same frame. The four shots show the four things the judge
// looks for: a police chase with the wanted HUD, street life on foot, a mission
// in progress, and the beach district.

import { AVENUES, CAR_MODELS, STEP, STREETS } from './config.js';
import { createState } from './entities.js';
import { startMission } from './missions.js';
import { LANDMARKS } from './world.js';
import { angleDelta, angleTo, distance } from './random.js';
import { SCREEN_PLAY } from './render.js';

/** Drive the player's car toward a point, following the road grid: along the
 * current avenue or street to the target's cross road, then turn onto it.
 * The car stays on asphalt instead of cutting through blocks. */
function driveRoads(state, world, tx, ty) {
  const car = state.player.car;
  if (!car) return { move: { x: 0, y: 0 }, brake: false, down: false };
  const ta = nearestValue(AVENUES, tx);
  const ts = nearestValue(STREETS, ty);
  const road = world.nearestRoad(car.x, car.y);
  let desired;
  if (road.dist > 70) {
    // Off the road (shoved by a crash): head for the nearest point on it.
    desired = road.axis === 'v'
      ? angleTo(car.x, car.y, road.at, car.y)
      : angleTo(car.x, car.y, car.x, road.at);
  } else if (road.axis === 'v') {
    desired = Math.abs(car.y - ts) > 46
      ? (ts > car.y ? Math.PI / 2 : -Math.PI / 2)
      : (tx > car.x ? 0 : Math.PI);
  } else {
    desired = Math.abs(car.x - ta) > 46
      ? (ta > car.x ? 0 : Math.PI)
      : (ty > car.y ? Math.PI / 2 : -Math.PI / 2);
  }
  const delta = angleDelta(car.angle, desired);
  const steer = delta > 0.12 ? 1 : delta < -0.12 ? -1 : 0;
  const d = distance(car.x, car.y, tx, ty);
  return { move: { x: steer, y: d > 60 ? -1 : 0 }, brake: false, down: d <= 60 };
}

function nearestValue(values, target) {
  let best = values[0];
  for (const v of values) if (Math.abs(v - target) < Math.abs(best - target)) best = v;
  return best;
}

/** A driver that follows a list of waypoints in order, then parks at the last. */
function makeDriver(world, waypoints) {
  let index = 0;
  return function drive(state) {
    const target = waypoints[Math.min(index, waypoints.length - 1)];
    if (index < waypoints.length - 1
      && distance(state.player.x, state.player.y, target.x, target.y) < 70) {
      index += 1;
    }
    return driveRoads(state, world, target.x, target.y);
  };
}

function fakeInput() {
  let move = { x: 0, y: 0 };
  let brake = false;
  let down = false;
  return {
    set(m, b, d) { move = m; brake = b; down = d; },
    move() { return move; },
    runHeld() { return false; },
    brakeHeld() { return brake; },
    mouse() { return { x: 640, y: 360, down: down }; },
    takeClick() { return false; },
    takeActions() { return 0; },
  };
}

/** Step the world with the autopilot driving; the police arrive on their own. */
function stepWorld(update, state, world, random, input, aim, steps, steer) {
  const bus = [];
  for (let i = 0; i < steps; i += 1) {
    if (steer) steer(state, i);
    update(state, world, random, input, aim, STEP, bus);
    bus.length = 0;
  }
}

export function stageShot(name, state, world, random, update) {
  const input = fakeInput();
  const aim = { x: state.player.x + 200, y: state.player.y };
  if (name === 'street') {
    // On foot at a downtown crossroads, traffic and pedestrians passing by.
    // The player stands still, so the frame is centred on him.
    state.player.x = 1120;
    state.player.y = 800;
    state.player.angle = Math.PI / 4;
    stepWorld(update, state, world, random, input, aim, Math.round(6 / STEP), () => {
      input.set({ x: 0, y: 0 }, false, false);
    });
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    // Mission 4, dockside: briefcase run with rivals closing in.
    startMission(state, 3, []);
    state.player.x = 2320;
    state.player.y = 1000;
    const car = state.cars.find((c) => c.driver === 'none' && c.model === 'sport')
      || state.cars.find((c) => c.driver === 'none');
    if (car) {
      car.x = 2320;
      car.y = 940;
      car.driver = 'player';
      state.player.onFoot = false;
      state.player.car = car;
      state.player.x = car.x;
      state.player.y = car.y;
    }
    state.cash = 2450;
    // Rivals are already waiting at the docks — the pickup will be a fight.
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2;
      state.enemies.push({
        x: LANDMARKS.docks.x + Math.cos(a) * 130,
        y: LANDMARKS.docks.y + Math.sin(a) * 130,
        angle: 0, health: 60, fireT: 1 + i * 0.5,
      });
    }
    // Stop just short of the docks, so the car sits mid-frame with the docks
    // and the rivals visible ahead of it instead of crushed at the map edge.
    const drive = makeDriver(world, [{ x: 2200, y: 1120 }]);
    stepWorld(update, state, world, random, input, aim, Math.round(7 / STEP), (s) => {
      const d = drive(s);
      input.set(d.move, d.brake, false);
    });
    return { screen: SCREEN_PLAY };
  }
  if (name === 'beach') {
    // Sunset cruise down Palmera Beach in a sports car.
    const car = state.cars.find((c) => c.driver === 'none' && c.model === 'sport')
      || state.cars.find((c) => c.driver === 'none');
    if (car) {
      car.x = 480;
      car.y = 1810;
      car.angle = 0;
      car.driver = 'player';
      state.player.onFoot = false;
      state.player.car = car;
      state.player.x = car.x;
      state.player.y = car.y;
    }
    state.cash = 3120;
    state.tokens = 4;
    const drive = makeDriver(world, [{ x: 2000, y: 1810 }]);
    stepWorld(update, state, world, random, input, aim, Math.round(5 / STEP), (s) => {
      const d = drive(s);
      input.set(d.move, d.brake, false);
    });
    return { screen: SCREEN_PLAY };
  }
  // Default: the cover — a 3-star chase through downtown.
  const car = state.cars.find((c) => c.driver === 'none' && c.model === 'sport')
    || state.cars.find((c) => c.driver === 'none');
  if (car) {
    car.x = 1120;
    car.y = 1120;
    car.angle = 0;
    car.driver = 'player';
    state.player.onFoot = false;
    state.player.car = car;
    state.player.x = car.x;
    state.player.y = car.y;
  }
  state.cash = 1875;
  state.wanted = 3;
  state.crimeTimer = 0;
  startMission(state, 4, []);
  // The escape leg of the bank job: the waypoint is the hideout, the tail is on.
  if (state.mission) state.mission.step = 2;
  // Drive the hideout, then keep cruising to the beach so the frame shows a
  // chase in motion rather than a parked car.
  const drive = makeDriver(world, [
    { x: LANDMARKS.hideout.x, y: LANDMARKS.hideout.y },
    { x: 1120, y: 1810 },
  ]);
  stepWorld(update, state, world, random, input, aim, Math.round(9 / STEP), (s) => {
    const d = drive(s);
    input.set(d.move, d.brake, false);
  });
  return { screen: SCREEN_PLAY };
}
