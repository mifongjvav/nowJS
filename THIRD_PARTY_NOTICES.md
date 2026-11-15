# Third-party notices

## osu! resources

Selected sound effects and fallback skin sprites in this project are copied
from [`ppy/osu-resources`](https://github.com/ppy/osu-resources).

- Source: <https://github.com/ppy/osu-resources>
- Commit: `343e0b9986497743370450101147d4cdb96238ed` (2026-11-12)
- Source directories: `osu.Game.Resources/Samples`,
  `osu.Game.Resources/Skins/Legacy`, `osu.Game.Resources/Skins/Retro`
- Copyright: ppy Pty Ltd and osu! contributors
- License: Creative Commons Attribution-NonCommercial 4.0 International
    - Full license: [`public/osu-resources/LICENCE.md`](public/osu-resources/LICENCE.md)
    - <https://creativecommons.org/licenses/by-nc/4.0/>

Only the samples referenced by nowJS are included. Gameplay hit sounds use the
Argon Pro pack with Argon and osu! default fallbacks; other sounds use the
osu! default resources. The copied sounds are unmodified and keep their original
directory structure. A small set of classic skin sprites is included as a
fallback for storyboards that reference skin files; Legacy 2x sprites were
resized to their logical 1x dimensions. All resources are used for
non-commercial purposes only.

`osu!` and `ppy` are trademarks of ppy Pty Ltd. nowJS is not affiliated with,
endorsed by, or sponsored by ppy Pty Ltd.

See [`public/osu-resources/README.md`](public/osu-resources/README.md) for the
asset-level attribution and usage notes.
