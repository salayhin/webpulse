# Icon sources

Vector sources for the extension icon. These are **not** shipped — only the
rendered PNGs in `src/public/icon/` are bundled (wired via `manifest.icons` in
`wxt.config.ts`).

- `icon.svg` — full mark (dot grid + pulse), used for 32/48/128px.
- `icon-16.svg` — simplified, grid-less variant used for 16px (the grid turns to
  mush at favicon size).

## Regenerate the PNGs

Requires `rsvg-convert` (`brew install librsvg`):

```sh
cd assets/icon-src
rsvg-convert -w 16  -h 16  icon-16.svg -o ../../src/public/icon/16.png
rsvg-convert -w 32  -h 32  icon.svg    -o ../../src/public/icon/32.png
rsvg-convert -w 48  -h 48  icon.svg    -o ../../src/public/icon/48.png
rsvg-convert -w 128 -h 128 icon.svg    -o ../../src/public/icon/128.png
```
