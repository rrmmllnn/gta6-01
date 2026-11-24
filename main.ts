// Solmar Bay's hand-in program (Node 22, standard library only). The game
// is the plain static files in game/ beside this file, plus the four
// screenshots in screenshots/. This program copies both folders into the
// output directory — /output on the grader, or $MAKEFUN_OUTPUT_DIR when
// that is set — and writes /output/dossier.json with the vendored make.fun
// library, which is the summary the judge reads. It reads only the files
// beside itself and writes only into the output directory.
//
// Try it locally:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps, from the kit's gate: the dossier text is capped at
// 160 KiB, at most 4 screenshots of 256 KiB each, and game/ holds at most
// 993 files and 48 MiB in all.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
