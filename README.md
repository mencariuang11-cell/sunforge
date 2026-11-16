# SUNFORGE

**Bend the dawn. Burn the night.**

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/mencariuang11-cell/sunforge/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/mencariuang11-cell/sunforge/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

SUNFORGE is a sunbeam tower defense in plain JavaScript — no library, no build step, no network. The sun crosses the sky *during* every wave and its beam sweeps with it, so you bend that beam with mirror, prism and lens towers to burn the Murk as it walks the winding path to the Dawn Crystal. Survive all 15 waves and the dawn is restored — then the victory screen offers the Endless Night beyond them; let the Crystal's 20 health reach zero and the night wins.

## How to play

- **Choose the night:** on the title screen pick a difficulty — **DAWN**, **DUSK** or **ECLIPSE** — with keys **1** / **2** / **3** or by clicking its chip. DAWN is the standard night (foes at ×1.0 hit points, 120 starting Sunlight); DUSK makes every foe ×1.35 as tough and starts you with 110; ECLIPSE ×1.8 and 100. The chosen difficulty is named in the HUD all run long.
- **Build:** click a tower card in the side panel (Mirror 25, Prism 60, Lens 50 Sunlight), then click an empty field tile. Towers cannot stand on the path. You start with 120 Sunlight on DAWN.
- **Aim:** select a placed mirror and rotate its face with **Q** / **E** (15° steps) or by dragging it. The traced beam network previews live while you build, exactly as it will fire.
- **Mind the sun:** the sun rides its arc continuously while a wave runs — sunrise slants in from the left, noon falls straight down, sunset slants away right. A network aimed at the morning sun is wrong for the evening, so re-aim mid-wave.
- **Match the colours:** a white beam burns everything at 60% strength. A prism splits it into red, green and blue beams that burn enemies of their own colour at full strength and everything else at only 25% — route the right colour onto the right wisp.
- **Manage the treasury:** kills pay Sunlight bounties and clearing a wave pays a bonus. **U** upgrades the selected tower (to level 3), **X** sells it back at 70% of what you sank into it.
- **Go beyond the dawn:** clearing wave 15 wins the campaign — and the victory screen offers **N** (or a click on the offer) to face the **Endless Night**: procedurally composed waves 16, 17, 18… with the same towers, treasury and Crystal, until the Crystal falls. The defeat screen names the wave you reached.
- **Keys:** 1 / 2 / 3 difficulty (title) · Q / E rotate · U upgrade · X sell · N endless (victory) · P pause · M mute · R restart.

## Systems

**The beam** — base burn 30 damage per second before factors, applied to any enemy standing in the light (7 px half-width, 4 px when focused). White light burns at ×0.6 against everything; coloured light burns at full strength against its own colour and ×0.25 against other colours and the colourless. One traced network is capped at 140 segments, splits included.

**Solar flare** — on waves 10 and up (the whole late campaign and the Endless Night), while the sun crosses the peak of its arc (wave progress 0.45–0.55), every beam widens (half-width ×1.6) and burns harder (damage ×1.5) under a "SOLAR FLARE — THE SUN SURGES" banner; a pure function of wave progress, so it fires at the same moment of the crossing every run.

**Difficulty** — chosen on the title screen and applied to every spawn of the run: DAWN foes ×1.0 hit points and 120 starting Sunlight, DUSK ×1.35 and 110, ECLIPSE ×1.8 and 100. Bosses scale by the same multiplier, on top of their wave scale.

**The Endless Night** — after the wave-15 victory, press **N** to keep the same field into procedurally generated waves 16+: five compositions cycle (mixed march, splitters, gloam wall, wisp storm, boss wave — a boss every fifth endless wave), each cycle adds to the group counts, hit points keep scaling +18% per wave, and the solar flare still fires from wave 10 up. The run ends when the Crystal falls, and the defeat screen names the wave reached.

**Towers** — every tower upgrades to level 3 (an upgrade costs 80% of the base price × current level) and sells at 70% of its total invested Sunlight:

| Tower | Cost | What it does to the beam |
| --- | --- | --- |
| Mirror | 25 | Reflects the beam specularly off its face; polish raises beam power ×1 / ×1.2 / ×1.45 by level |
| Prism | 60 | Splits a white beam into red, green and blue beams fanned 12° apart; split gain ×1 / ×1.3 / ×1.65 by level |
| Lens | 50 | Focuses a passing beam into a thinner line that burns ×3 / ×3.6 / ×4.3 by level |

**The Murk** — enemy hit points scale +18% per wave; bounties are paid per kill:

| Enemy | HP | Speed | Bounty | Notes |
| --- | --- | --- | --- | --- |
| Shade | 60 | 44 px/s | 6 | Colourless bulk |
| Ember / Verdant / Tide Wisp | 36 | 56 px/s | 7 | Fast; red, green and blue — only a matching beam burns them at full strength |
| Splitter | 84 | 30 px/s | 8 | Bursts into two Minis (18 HP, 2 bounty) when killed |
| Gloam | 320 | 20 px/s | 16 | Slow tank; shrugs off half of every beam, and costs the Crystal 2 health if it leaks |
| The Hollow Sun (boss) | 1500 | 16 px/s | 150 | Walks on waves 5, 10 and 15 at ×1 / ×2 / ×3 health; cycles its colour phase — red, green, blue, colourless — every 4 seconds, and costs 5 Crystal health if it leaks |

**Campaign and economy** — 15 waves of spawn groups that teach one thing at a time (shades, then one wisp colour at a time, then splitters, then gloams), with a boss and escort every fifth wave; each wave lasts 46–78 seconds, the length of the sun's crossing, and the Endless Night's generated waves run 64–76 seconds. Clearing a wave pays 25 + 5 × wave Sunlight. The simulation runs at a fixed 60 Hz with seeded, precomputed spawn schedules — the same wave always plays the same.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 to play. The game is static files, so any static file server pointed at `game/` works too (ES modules need http, not file://). `node main.ts` regenerates the deterministic `dossier.json` that describes the game to the grader (written to `$MAKEFUN_OUTPUT_DIR`, or `/output` by default).

## License

MIT — see the `LICENSE` file in this repository.

---

<sub>Entered on [make.fun](https://make.fun/?ref=emnkdrqh&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
