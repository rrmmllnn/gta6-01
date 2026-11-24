// Everything drawn on the canvas: the city, the cars and people, the HUD
// with its minimap, and the title, pause and briefing screens. Top-down 2D,
// warm sun-soaked colours; the beach shot switches the palette to sunset.
import { CONFIG } from './config.js';
import { districtAt } from './world.js';
import { MISSIONS, missionMarker, missionObjective } from './missions.js';

const { canvas, palette } = CONFIG;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarShape(ctx, car, spec) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const len = spec.length;
  const wid = spec.width;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  roundRect(ctx, -len / 2 + 3, -wid / 2 + 4, len, wid, 7);
  ctx.fill();
  ctx.fillStyle = car.color;
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 7);
  ctx.fill();
  // Windshield and rear window.
  ctx.fillStyle = 'rgba(180,220,235,0.85)';
  ctx.fillRect(len * 0.08, -wid / 2 + 3, len * 0.2, wid - 6);
  ctx.fillStyle = 'rgba(40,50,60,0.85)';
  ctx.fillRect(-len * 0.32, -wid / 2 + 3, len * 0.14, wid - 6);
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(len / 2 - 3, -wid / 2 + 2, 3, 5);
  ctx.fillRect(len / 2 - 3, wid / 2 - 7, 3, 5);
  if (car.police) {
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(-len * 0.12, -wid / 2, len * 0.24, wid);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PD', 0, 0);
    // Light bar.
    ctx.fillStyle = Math.floor(performance.now() / 260) % 2 === 0 ? '#ff3b30' : '#2f7bff';
    ctx.fillRect(-6, -wid / 2 - 3, 12, 5);
  }
  ctx.restore();
}

export function drawWorld(ctx, game) {
  const cam = game.camera;
  const sunset = game.sunset;
  const view = { x0: cam.x - canvas.width / 2, y0: cam.y - canvas.height / 2, x1: cam.x + canvas.width / 2, y1: cam.y + canvas.height / 2 };
  const W = CONFIG.world;

  // Ground: grass everywhere, then the districts paint over it.
  ctx.fillStyle = sunset ? '#8a7a52' : palette.grass;
  ctx.fillRect(view.x0, view.y0, canvas.width, canvas.height);

  // Ocean on the west edge, sand beside it.
  ctx.fillStyle = sunset ? '#b4622d' : palette.ocean;
  ctx.fillRect(view.x0, view.y0, Math.max(0, 150 - view.x0), canvas.height);
  ctx.fillStyle = sunset ? '#c98a4b' : palette.oceanDeep;
  ctx.fillRect(view.x0, view.y0, Math.max(0, 60 - view.x0), canvas.height);
  if (sunset) {
    // Low sun over the water.
    const sunX = 90;
    const sunY = cam.y - 60;
    const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 150);
    glow.addColorStop(0, 'rgba(255,190,90,0.95)');
    glow.addColorStop(0.35, 'rgba(255,130,60,0.55)');
    glow.addColorStop(1, 'rgba(255,130,60,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 160, sunY - 160, 320, 320);
    ctx.fillStyle = '#ffd98a';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = sunset ? '#d9a860' : palette.sand;
  ctx.fillRect(Math.max(view.x0, 150), view.y0, Math.max(0, 400 - Math.max(view.x0, 150)), canvas.height);

  // Park lawn and pond.
  const park = CONFIG.districts.park;
  ctx.fillStyle = sunset ? '#6d7a44' : palette.parkGrass;
  ctx.fillRect(park.x0, park.y0, park.x1 - park.x0, park.y1 - park.y0);
  ctx.fillStyle = sunset ? '#7d6a3d' : '#5da8c4';
  ctx.beginPath();
  ctx.ellipse(1300, 1200, 120, 70, 0, 0, Math.PI * 2);
  ctx.fill();

  // Docks concrete.
  const docks = CONFIG.districts.docks;
  ctx.fillStyle = sunset ? '#7a6a58' : '#9a938a';
  ctx.fillRect(docks.x0, docks.y0, docks.x1 - docks.x0, docks.y1 - docks.y0);

  // Roads: asphalt strips with centre dashes and crosswalks.
  ctx.fillStyle = palette.asphalt;
  for (const ax of CONFIG.avenues) ctx.fillRect(ax - CONFIG.roadHalf, view.y0, CONFIG.roadHalf * 2, canvas.height);
  for (const sy of CONFIG.streets) ctx.fillRect(view.x0, sy - CONFIG.roadHalf, canvas.width, CONFIG.roadHalf * 2);
  ctx.strokeStyle = palette.asphaltLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  ctx.beginPath();
  for (const ax of CONFIG.avenues) {
    ctx.moveTo(ax, view.y0);
    ctx.lineTo(ax, view.y1);
  }
  for (const sy of CONFIG.streets) {
    ctx.moveTo(view.x0, sy);
    ctx.lineTo(view.x1, sy);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(240,240,230,0.75)';
  for (const ax of CONFIG.avenues) {
    for (const sy of CONFIG.streets) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(ax - 26 + i * 8, sy - CONFIG.roadHalf - 4, 4, 8);
        ctx.fillRect(ax - 26 + i * 8, sy + CONFIG.roadHalf - 4, 4, 8);
      }
    }
  }
  void W;
  void districtAt;

  // Containers at the docks.
  for (const c of game.world.containers) {
    if (c.x < view.x0 - 100 || c.x > view.x1 + 100 || c.y < view.y0 - 100 || c.y > view.y1 + 100) continue;
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
    ctx.beginPath();
    ctx.moveTo(c.x - c.w / 2, c.y);
    ctx.lineTo(c.x + c.w / 2, c.y);
    ctx.stroke();
  }

  // Buildings with a roof, a darker edge and a few lit windows.
  for (const b of game.world.buildings) {
    if (b.x < view.x0 - 120 || b.x > view.x1 + 120 || b.y < view.y0 - 120 || b.y > view.y1 + 120) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x - b.w / 2 + 6, b.y - b.h / 2 + 7, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    ctx.strokeStyle = palette.buildingEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    ctx.fillStyle = 'rgba(255,240,180,0.55)';
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if ((i * 7 + j * 3 + b.height) % 4 === 0) {
          ctx.fillRect(b.x - b.w / 2 + 8 + i * 26, b.y - b.h / 2 + 8 + j * 26, 10, 12);
        }
      }
    }
  }

  // Trees and palms.
  for (const t of game.world.trees) {
    if (t.x < view.x0 - 40 || t.x > view.x1 + 40 || t.y < view.y0 - 40 || t.y > view.y1 + 40) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(t.x + 4, t.y + 5, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.palm ? palette.palm : palette.tree;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.palm ? 11 : 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(t.x - 4, t.y - 4, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Gold palm tokens, pulsing.
  const pulse = 0.6 + 0.4 * Math.sin(game.time * 4);
  for (const tok of game.world.tokens) {
    if (tok.taken) continue;
    ctx.save();
    ctx.translate(tok.x, tok.y);
    ctx.fillStyle = `rgba(255,200,40,${0.25 + 0.2 * pulse})`;
    ctx.beginPath();
    ctx.arc(0, 0, 20 + 4 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcf3f';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5b00';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
    ctx.restore();
  }

  // Health and ammo crates.
  for (const pk of game.world.pickups) {
    ctx.fillStyle = pk.kind === 'health' ? '#e74c3c' : '#2e86c1';
    ctx.fillRect(pk.x - 11, pk.y - 11, 22, 22);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(pk.x - 11, pk.y - 11, 22, 22);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pk.kind === 'health' ? '+' : 'A', pk.x, pk.y + 1);
  }

  // Rosa's garage marker.
  const g = game.world.places.rosaGarage;
  ctx.fillStyle = '#f1c40f';
  ctx.beginPath();
  ctx.arc(g.x, g.y, 16 + 3 * Math.sin(game.time * 3), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a5b00';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('R', g.x, g.y + 1);

  // Mission marker: a gold beacon with a bouncing arrow.
  const marker = missionMarker(game);
  if (marker) {
    const bob = Math.sin(game.time * 5) * 6;
    ctx.fillStyle = 'rgba(255,200,40,0.25)';
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcf3f';
    ctx.beginPath();
    ctx.moveTo(marker.x, marker.y - 46 + bob);
    ctx.lineTo(marker.x - 12, marker.y - 66 + bob);
    ctx.lineTo(marker.x + 12, marker.y - 66 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7a5b00';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function drawEntities(ctx, game) {
  // Skid marks under everything.
  for (const car of game.cars) {
    for (const s of car.skid) {
      ctx.fillStyle = `rgba(20,20,20,${0.35 * (s.life / 0.7)})`;
      ctx.fillRect(s.x - 8, s.y - 2, 16, 4);
    }
  }
  // Parked cars.
  for (const pc of game.world.parkedCars) {
    const spec = CONFIG.cars[pc.type] || CONFIG.cars.sedan;
    drawCarShape(ctx, { x: pc.x, y: pc.y, angle: pc.angle, color: spec.color, type: pc.type, police: false, skid: [] }, spec);
  }
  // Traffic and police cars.
  for (const car of game.cars) {
    const spec = CONFIG.cars[car.type] || CONFIG.cars.sedan;
    drawCarShape(ctx, car, spec);
  }
  // Pedestrians.
  for (const ped of game.peds) {
    if (ped.dead) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(ped.x + 2, ped.y + 3, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5d7b8';
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 5, 0, Math.PI * 2);
    ctx.fill();
    if (ped.hostile) {
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ped.x, ped.y, 13, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // The player: on foot a walker with a facing tick, in a car the car itself.
  const p = game.player;
  if (!p.inCar) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x + 2, p.y + 4, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2c7fb8';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5d7b8';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    // Aim tick.
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.aimAngle) * 10, p.y + Math.sin(p.aimAngle) * 10);
    ctx.lineTo(p.x + Math.cos(p.aimAngle) * 20, p.y + Math.sin(p.aimAngle) * 20);
    ctx.stroke();
  }
  // Bullets.
  for (const b of game.bullets) {
    ctx.strokeStyle = '#ffe27a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - Math.cos(b.angle) * 10, b.y - Math.sin(b.angle) * 10);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Particles.
  for (const part of game.particles) {
    ctx.globalAlpha = Math.max(0, part.life / part.max);
    ctx.fillStyle = part.color;
    ctx.beginPath();
    ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawMinimap(ctx, game) {
  const mw = 190;
  const mh = 142;
  const mx = canvas.width - mw - 14;
  const my = canvas.height - mh - 14;
  const sx = mw / CONFIG.world.width;
  const sy = mh / CONFIG.world.height;
  ctx.fillStyle = 'rgba(10,16,22,0.82)';
  roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // District blocks.
  ctx.fillStyle = '#2f7f9e';
  ctx.fillRect(mx, my, 400 * sx, mh);
  ctx.fillStyle = '#69a24e';
  ctx.fillRect(mx + 1000 * sx, my + 900 * sy, 600 * sx, 600 * sy);
  ctx.fillStyle = '#8a8378';
  ctx.fillRect(mx + 2400 * sx, my + 1500 * sy, 800 * sx, 900 * sy);
  // Roads.
  ctx.strokeStyle = 'rgba(220,220,210,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const ax of CONFIG.avenues) {
    ctx.moveTo(mx + ax * sx, my);
    ctx.lineTo(mx + ax * sx, my + mh);
  }
  for (const sy of CONFIG.streets) {
    ctx.moveTo(mx, my + sy * sy);
    ctx.lineTo(mx + mw, my + sy * sy);
  }
  ctx.stroke();
  // Tokens.
  ctx.fillStyle = '#ffcf3f';
  for (const tok of game.world.tokens) {
    if (tok.taken) continue;
    ctx.fillRect(mx + tok.x * sx - 1, my + tok.y * sy - 1, 3, 3);
  }
  // Mission marker.
  const marker = missionMarker(game);
  if (marker) {
    ctx.fillStyle = '#ffcf3f';
    ctx.beginPath();
    ctx.arc(mx + marker.x * sx, my + marker.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police.
  ctx.fillStyle = '#ff4d4d';
  for (const car of game.cars) {
    if (!car.police) continue;
    ctx.beginPath();
    ctx.arc(mx + car.x * sx, my + car.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player.
  const p = game.player;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(mx + p.x * sx, my + p.y * sy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  ctx.stroke();
  // View rectangle.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.strokeRect(mx + (game.camera.x - canvas.width / 2) * sx, my + (game.camera.y - canvas.height / 2) * sy, canvas.width * sx, canvas.height * sy);
}

export function drawHUD(ctx, game) {
  // Top-left: cash and objective.
  ctx.fillStyle = 'rgba(10,16,22,0.72)';
  roundRect(ctx, 12, 12, 330, 64, 8);
  ctx.fill();
  ctx.fillStyle = '#7CFC98';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`$${game.cash.toLocaleString()}`, 26, 34);
  ctx.fillStyle = '#fff';
  ctx.font = '15px sans-serif';
  const objective = missionObjective(game);
  ctx.fillText(objective.length > 52 ? objective.slice(0, 52) + '…' : objective, 26, 60);
  // Top-right: wanted stars.
  ctx.fillStyle = 'rgba(10,16,22,0.72)';
  roundRect(ctx, canvas.width - 210, 12, 198, 44, 8);
  ctx.fill();
  for (let i = 0; i < CONFIG.wanted.maxStars; i++) {
    ctx.fillStyle = i < game.wanted ? '#ffd23f' : 'rgba(255,255,255,0.25)';
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', canvas.width - 188 + i * 36, 36);
  }
  // Bottom-left: health and ammo.
  ctx.fillStyle = 'rgba(10,16,22,0.72)';
  roundRect(ctx, 12, canvas.height - 64, 250, 52, 8);
  ctx.fill();
  ctx.fillStyle = '#333';
  ctx.fillRect(26, canvas.height - 50, 150, 12);
  ctx.fillStyle = game.player.health > 30 ? '#4ade80' : '#ef4444';
  ctx.fillRect(26, canvas.height - 50, 150 * Math.max(0, game.player.health / 100), 12);
  ctx.fillStyle = '#fff';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`HP ${Math.ceil(game.player.health)}`, 184, canvas.height - 43);
  ctx.fillText(`Ammo ${game.player.ammo}  •  Palms ${game.tokens}/${CONFIG.tokensTotal}  •  Jobs ${game.mission.completed.length}/6`, 26, canvas.height - 24);
  // Floating banner message.
  if (game.messageTimer > 0) {
    ctx.fillStyle = 'rgba(10,16,22,0.8)';
    const w = Math.min(640, 20 + game.message.length * 8);
    roundRect(ctx, canvas.width / 2 - w / 2, 84, w, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#ffe27a';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(game.message, canvas.width / 2, 102);
  }
  // Crosshair when on foot.
  if (!game.player.inCar && game.state === 'playing') {
    const m = game.input.mouse;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(m.x - 14, m.y);
    ctx.lineTo(m.x - 5, m.y);
    ctx.moveTo(m.x + 5, m.y);
    ctx.lineTo(m.x + 14, m.y);
    ctx.moveTo(m.x, m.y - 14);
    ctx.lineTo(m.x, m.y - 5);
    ctx.moveTo(m.x, m.y + 5);
    ctx.lineTo(m.x, m.y + 14);
    ctx.stroke();
  }
  drawMinimap(ctx, game);
}

export function drawTitle(ctx, game) {
  ctx.fillStyle = 'rgba(8,14,20,0.62)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SOLMAR BAY', canvas.width / 2, 190);
  ctx.fillStyle = '#fff';
  ctx.font = '24px sans-serif';
  ctx.fillText('An open-world crime story — sun, sea and trouble', canvas.width / 2, 252);
  ctx.fillStyle = '#7CFC98';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(game.saveData && game.saveData.cash > 0 ? 'Press ENTER to continue your story' : 'Press ENTER to start', canvas.width / 2, 330);
  ctx.fillStyle = '#dfe7ee';
  ctx.font = '17px sans-serif';
  const lines = [
    'WASD / arrows — move & drive      Mouse — aim      Click — shoot',
    'E — enter / exit car      Shift — run      Space — brake',
    'R — reload      P — pause      M — mute',
    'Steal cars, lose the cops, run Rosa\'s jobs, collect the 10 gold palms.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, 400 + i * 30));
  if (game.saveData) {
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '15px sans-serif';
    ctx.fillText(`Saved: $${game.saveData.cash.toLocaleString()}  •  jobs done ${game.saveData.missionsDone.length}/6  •  palms ${game.saveData.tokens.length}/10`, canvas.width / 2, 560);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '13px sans-serif';
  ctx.fillText('An original game. Solmar Bay, Rosa Delgado and every street here are invented — no part of any commercial game.', canvas.width / 2, 640);
}

export function drawPause(ctx) {
  ctx.fillStyle = 'rgba(8,14,20,0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 20);
  ctx.font = '18px sans-serif';
  ctx.fillText('Press P to keep playing', canvas.width / 2, canvas.height / 2 + 30);
}

export function drawBriefing(ctx, game) {
  ctx.fillStyle = 'rgba(8,14,20,0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const m = MISSIONS[game.mission.index];
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Job ${m.id + 1} of 6 — ${m.title}`, canvas.width / 2, 210);
  ctx.fillStyle = '#fff';
  ctx.font = '19px sans-serif';
  const words = m.briefing.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).length > 72) { lines.push(line); line = w; }
    else line = line ? line + ' ' + w : w;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, 280 + i * 30));
  ctx.fillStyle = '#7CFC98';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(`Reward: $${m.reward.toLocaleString()}`, canvas.width / 2, 280 + lines.length * 30 + 20);
  ctx.fillStyle = '#dfe7ee';
  ctx.font = '18px sans-serif';
  ctx.fillText('Press ENTER to take the job — or E to walk away', canvas.width / 2, 280 + lines.length * 30 + 60);
}

export function drawEnd(ctx, game) {
  ctx.fillStyle = 'rgba(8,14,20,0.66)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = game.state === 'busted' ? '#7db4ff' : '#ff6b6b';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(game.state === 'busted' ? 'BUSTED' : 'WASTED', canvas.width / 2, 300);
  ctx.fillStyle = '#fff';
  ctx.font = '19px sans-serif';
  ctx.fillText(game.state === 'busted' ? 'The Solmar PD caught up with you. Rosa is not impressed.' : 'Solmar General patched you up. The city is still waiting.', canvas.width / 2, 360);
  ctx.fillText('Press ENTER to get back out there', canvas.width / 2, 410);
}
