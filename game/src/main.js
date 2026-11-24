// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps, and the renderer paints what is there. The game moves between
// four screens: title, play, paused and game over. Progress (cash, missions,
// tokens) saves to localStorage whenever it changes.
//
// ?seed=N fixes the city. ?shot=chase|street|mission|beach (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createState, playerEnterCar, playerExitCar, say, updateEntities } from './entities.js';
import { abandonMission, startMission } from './missions.js';
import { ACTION_CONFIRM, ACTION_ENTER_CAR, ACTION_MUTE, ACTION_PAUSE, ACTION_RELOAD, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const world = createWorld(random);

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: state.missionIndex,
      tokens: state.tokens,
      best: state.best,
    }));
  } catch { /* storage can be off: the save then lasts this visit only */ }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

const save = readSave();
const state = createState(world, random, save);
state.best = Math.max(state.best, readBest(), state.cash);
const renderer = createRenderer(canvas, world);
const audio = createAudio();
audio.setMuted(false);

function runShot(name) {
  const scene = stageShot(name, state, world, random, updateEntities);
  // For testing: where the shot ended up, readable from the console.
  window.__shotInfo = {
    player: { x: Math.round(state.player.x), y: Math.round(state.player.y), onFoot: state.player.onFoot },
    wanted: state.wanted, health: Math.round(state.health), cash: state.cash,
    cars: state.cars.length, cops: state.cops.length, enemies: state.enemies.length,
    mission: state.mission ? state.mission.def.id : null,
  };
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, { muted: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let lastSavedCash = state.cash;
  let lastSavedMission = state.missionIndex;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function maybeSave() {
    if (state.cash !== lastSavedCash || state.missionIndex !== lastSavedMission) {
      lastSavedCash = state.cash;
      lastSavedMission = state.missionIndex;
      writeSave(state);
    }
  }

  function startStory() {
    state.gameOver = null;
    state.health = 100;
    state.wanted = 0;
    state.player.bustT = 0;
    if (state.missionIndex < 6) startMission(state, state.missionIndex, []);
    screen = SCREEN_PLAY;
    announce('Playing. Follow the yellow marker.');
  }

  function startFreeRoam() {
    state.gameOver = null;
    state.health = 100;
    screen = SCREEN_PLAY;
    announce('Free roam. Head to Rosa\'s Garage for the next mission.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (state.gameOver === 'busted') {
      state.cash = Math.max(0, state.cash - 200);
      audio.busted();
    } else if (state.gameOver === 'wasted') {
      state.cash = Math.max(0, state.cash - 200);
    }
    if (state.mission) abandonMission(state, []);
    if (state.cash > state.best) {
      state.best = state.cash;
      try { window.localStorage.setItem(BEST_KEY, String(state.best)); } catch { /* ignore */ }
    }
    writeSave(state);
    announce(state.gameOver === 'busted' ? 'Busted.' : 'Wasted.');
  }

  function step(dt) {
    if (screen !== SCREEN_PLAY) return;
    const bus = [];
    const mouse = input.mouse();
    const rect = canvas.getBoundingClientRect();
    const aim = renderer.toWorld(
      (mouse.x / rect.width) * canvas.width,
      (mouse.y / rect.height) * canvas.height,
    );
    updateEntities(state, world, random, input, aim, dt, bus);
    // Missions run on the same step, after the world moved.
    const { updateMission } = missionsApi;
    updateMission(state, dt, bus);
    for (const event of bus) {
      if (event === 'shot') audio.shot();
      else if (event === 'enemy-shot') audio.enemyShot();
      else if (event === 'crash') audio.crash();
      else if (event === 'pickup' || event === 'coin') audio.pickup();
      else if (event === 'mission-start') audio.missionStart();
      else if (event === 'mission-done') audio.missionDone();
      else if (event === 'mission-fail') audio.missionFail();
      else if (event === 'busted') audio.busted();
    }
    const player = state.player;
    const speedRatio = player.car ? Math.abs(player.car.speed) / 430 : (player.moving ? 0.4 : 0);
    audio.update(dt, speedRatio, state.wanted);
    if (state.gameOver) endGame();
    else if (state.missionIndex >= 6 && !state.mission && screen === SCREEN_PLAY && state.stats.missionsDone >= 6) {
      state.gameOver = 'complete';
      endGame();
    }
    maybeSave();
  }

  function handleActions() {
    const actions = input.takeActions();
    audio.unlock();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      say(state, audio.isMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) {
        startStory();
      } else if (screen === SCREEN_OVER) {
        state.player.x = 800;
        state.player.y = 900;
        state.health = 100;
        state.wanted = 0;
        state.gameOver = null;
        if (state.player.car) playerExitCar(state, world);
        startFreeRoam();
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_ENTER_CAR && screen === SCREEN_PLAY) {
      if (state.player.onFoot) playerEnterCar(state, world, []);
      else playerExitCar(state, world);
    }
    if (actions & ACTION_RELOAD && screen === SCREEN_PLAY && state.player.onFoot) {
      if (state.player.ammo < 12 && state.player.reloading <= 0) {
        state.player.reloading = 1.1;
        say(state, 'Reloading…');
      }
    }
    if (input.takeClick() && screen === SCREEN_TITLE) startStory();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE) {
      // The title shows the living city behind its panel.
      const bus = [];
      const idle = { move: () => ({ x: 0, y: 0 }), runHeld: () => false, brakeHeld: () => false, mouse: () => ({ x: 0, y: 0, down: false }), takeClick: () => false, takeActions: () => 0 };
      while (accumulator >= STEP) {
        updateEntities(state, world, random, idle, { x: state.player.x, y: state.player.y }, STEP, bus);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        step(STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(state, screen, { muted: audio.isMuted(), best: state.best, hasSave: Boolean(save) });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

// Missions are imported lazily here so the module graph stays a simple tree:
// main owns the loop, entities own the sim, missions own the story.
import('./missions.js').then((mod) => {
  missionsApi.updateMission = mod.updateMission;
  if (shot) runShot(shot);
  else runGame();
});
const missionsApi = { updateMission: () => {} };
