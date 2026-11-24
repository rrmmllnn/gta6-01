// Solmar Bay: every tuning number and colour in one place. The camera shows a
// 1280x720 logical view of a 2560x1920 open city; nothing below depends on the
// browser window, so a screenshot and a live game render the same world.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** The city: avenues run north-south, streets east-west, 96 px of asphalt each. */
export const WORLD = { width: 2560, height: 1920 };
export const ROAD = 96;
export const AVENUES = [160, 480, 800, 1120, 1440, 1760, 2080, 2400];
export const STREETS = [160, 480, 800, 1120, 1440, 1760];

export const PLAYER = {
  radius: 12,
  walk: 175,
  run: 265,
  health: 100,
  pistolDamage: 34,
  pistolRange: 430,
  pistolRate: 0.22,
  magazine: 12,
  reloadTime: 1.1,
};

/** Car models: length, width, top speed, acceleration, handling, colour set. */
export const CAR_MODELS = {
  sedan: { length: 46, width: 22, top: 330, accel: 210, grip: 2.6, colors: ['#c94f4f', '#4f7ec9', '#c9b44f', '#7a7f8a'] },
  sport: { length: 44, width: 21, top: 430, accel: 300, grip: 3.4, colors: ['#e8b13c', '#d94f7a', '#3fd2c0'] },
  taxi: { length: 46, width: 22, top: 340, accel: 220, grip: 2.7, colors: ['#f2c230'] },
  truck: { length: 62, width: 26, top: 250, accel: 150, grip: 2.0, colors: ['#8a7a5a', '#5a7a8a'] },
  police: { length: 48, width: 23, top: 470, accel: 330, grip: 3.6, colors: ['#20242e'] },
  pickup: { length: 50, width: 23, top: 310, accel: 200, grip: 2.5, colors: ['#5a8a4f', '#a05a2a'] },
};

export const TRAFFIC_COUNT = 26;
export const PED_COUNT = 34;
export const MAX_WANTED = 5;

/** Seconds without a crime before one star fades, while no police is close. */
export const WANTED_DECAY_SECONDS = 25;
/** A cop on foot needs to stay this close this long to bust the player. */
export const BUST_DISTANCE = 30;
export const BUST_SECONDS = 1.2;

export const MISSION_REWARDS = [400, 650, 900, 1200, 2000, 3500];

export const PALETTE = {
  backdrop: '#10141c',
  grass: '#79a75c',
  grassDark: '#6b9a50',
  sand: '#e6cf9a',
  water: '#2e7ba6',
  waterDeep: '#256a92',
  asphalt: '#3b404b',
  asphaltDark: '#343943',
  lane: '#e8d44f',
  sidewalk: '#b9b3a4',
  park: '#5d9150',
  building: ['#d98a7a', '#7aa8d9', '#e8c87a', '#a58ad9', '#7ac9a8', '#d97aa8', '#c9c9c9', '#e09a5a'],
  roof: ['#8a5a4a', '#4a5a6a', '#6a6a5a', '#5a4a6a'],
  text: '#f2ede2',
  muted: '#b9b3a4',
  gold: '#f2c230',
  red: '#e5534b',
  blue: '#4f9de0',
  panel: 'rgba(16, 20, 28, 0.88)',
  panelLine: '#3a4152',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'solmar-bay.save.v1';
export const BEST_KEY = 'solmar-bay.best.v1';
