# osu! sound resources

This directory contains the sound effects used by nowJS, selected from the
official [`ppy/osu-resources`](https://github.com/ppy/osu-resources) repository.

- Source: <https://github.com/ppy/osu-resources>
- Commit: `343e0b9986497743370450101147d4cdb96238ed` (2026-11-12)
- Original directory: `osu.Game.Resources/Samples`
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

## Changes

The included files are copied **unmodified**, with their original directory
structure and file names preserved. No audio has been re-encoded or edited.
Unused osu! samples are intentionally not included to keep the repository small.

## Attribution / trademark

Sound effects: **ppy/osu-resources**, licensed under **CC BY-NC 4.0**.

`osu!` and `ppy` are trademarks of ppy Pty Ltd. nowJS is a fan project and is
not affiliated with, endorsed by, or sponsored by ppy Pty Ltd.
