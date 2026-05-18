# Extension Icons

Chrome extension PNG icons in three sizes:

- `icon16.png` — toolbar icon
- `icon48.png` — extensions page
- `icon128.png` — Chrome Web Store listing

## Regenerating

The icons are rendered from `assets/branding/icon.html` (a single 100%-sized squircle with the MeetSync gradient and video glyph). To regenerate:

1. Serve `assets/branding/` over HTTP (e.g. `python3 -m http.server`).
2. Open `icon.html` in a headless browser, resize the viewport to the target size (16, 48, or 128), and screenshot.

The source HTML scales the squircle and glyph proportionally, so a viewport resize is the only thing that changes between sizes.
