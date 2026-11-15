# osu! resources

This directory contains sound effects and fallback skin sprites used by nowJS,
selected from the official [`ppy/osu-resources`](https://github.com/ppy/osu-resources)
repository.

- Source: <https://github.com/ppy/osu-resources>
- Commit: `343e0b9986497743370450101147d4cdb96238ed` (2026-11-12)
- Sound directory: `osu.Game.Resources/Samples`
- Skin directories: `osu.Game.Resources/Skins/Legacy`, `osu.Game.Resources/Skins/Retro`
- Copyright: ppy Pty Ltd and osu! contributors
- License: [Creative Commons Attribution-NonCommercial 4.0 International](LICENCE.md)
    - <https://creativecommons.org/licenses/by-nc/4.0/>

## Included sounds

Only the samples actually referenced by the game are included.

Gameplay hit sounds use the **Argon Pro** sample pack. If a sound is absent
from Argon Pro, the **Argon** pack is used, and finally the osu! default
samples are used. This applies to the normal/soft/drum hitnormal, hitclap,
hitwhistle, hitfinish and slidertick samples, as well as combo break and
spinner sounds.

The remaining sounds come from the osu! default resources:

- Catch banana, pause loop, restart, resume countdown
- Results impact and applause
- UI hover/click/dialog/notification sounds
- Song-select confirm/difficulty sounds
- Menu select/back sounds

Custom hit samples referenced by an imported `.osu` file take priority over
the bundled packs, matching the osu! file format.

## Fallback skin sprites

Some storyboards use `UseSkinSprites` and reference elements from the player's
skin. nowJS has no user-selectable skin system, so it falls back to the classic
osu! skin assets in `Skins/Default/`:

- `sliderb0.png`
- `sliderfollowcircle.png`
- `sliderscorepoint.png`
- `reversearrow.png`
- `spinner-background.png`
- `spinner-circle.png`

The Legacy 2x assets were resized to their logical 1x dimensions. The spinner
background comes from the Retro skin at its original size. Beatmap-provided
files always take priority over these fallbacks.

## Changes

The bundled sound files are copied **unmodified**, with their original
directory structure and file names preserved. No audio has been re-encoded or
edited. The fallback skin sprites from `Skins/Legacy` were resized to 1x; the
Retro spinner background is unchanged. Unused osu! resources are intentionally
not included to keep the repository small.

## Attribution / trademark

Sound effects: **ppy/osu-resources**, licensed under **CC BY-NC 4.0**.

`osu!` and `ppy` are trademarks of ppy Pty Ltd. nowJS is a fan project and is
not affiliated with, endorsed by, or sponsored by ppy Pty Ltd.
