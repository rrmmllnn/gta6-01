# Solmar Bay

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/rrmmllnn/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/rrmmllnn/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game in the spirit of GTA 6, built for the
[Make GTA 6 bounty](https://make.fun/bounty/gta6-01) on make.fun. Explore the
sun-soaked city of Solmar Bay on foot and by car, steal vehicles, outrun the
Solmar PD through a five-star wanted system, run six story jobs for the fixer
Rosa Delgado, and collect the ten gold palm tokens hidden around the city.

Everything here is invented: the city, the districts (downtown, beach,
docks, park, suburbs), the characters, the vehicles, the story, the art and
the synthesised sound. No part of any commercial game.

## Play it

```sh
node serve.ts
```

Then open <http://localhost:8080> in a desktop browser. Any static file
server works too — the game is plain files under `game/` with no build step
and no network request. `main.ts` (Node 22) hands the game in: it copies
`game/` and `screenshots/` to the output directory and writes
`dossier.json` with the vendored make.fun library.

## The city

- A road grid of avenues and streets across five districts, generated from
  a fixed seed so every run builds the same city.
- Traffic driving the roads and pedestrians on the sidewalks.
- Any parked or driven car can be stolen (E). Sports cars, taxis, trucks
  and the bank van all drive differently.
- A 5-star wanted level: police cars chase, foot cops try to arrest you,
  and the heat cools off if you lay low.
- Combat with mouse aim and click to shoot, R to reload.
- Six story missions from Rosa Delgado — pickups, a tail job, a dockside
  shootout, a beach getaway and the big score — with briefings, objectives
  and cash rewards.
- A HUD with cash, wanted stars, health, ammo and a live minimap; a start
  screen; and a save (localStorage) that keeps your cash, finished jobs
  and gold palms.
- Synthesised WebAudio: engine hum, sirens, gunfire and a bass-driven
  music loop. M mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive in a car |
| Mouse | Aim |
| Click | Shoot |
| E | Enter / exit a car |
| Shift | Run on foot, boost in a car |
| Space | Brake |
| R | Reload |
| P | Pause |
| M | Mute |

## Screenshots

The four shots in `screenshots/` are real renders of the game, staged by
the `?shot=` parameter and played forward by an autopilot: a 3-star police
chase (`1-chase.jpg`), a downtown crossroads on foot (`2-street.jpg`),
Rosa's dockside job mid-fight (`3-mission.jpg`) and a sunset beach cruise
(`4-beach.jpg`).

## License

MIT — see `LICENSE`.
