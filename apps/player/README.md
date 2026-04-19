# UseRhythm Player (Electron)

Windows-focused Electron wrapper for validating GPU-accelerated gameplay on `https://userhythm.kr`.

## Commands

From repository root:

```bash
npm run player:dev
npm run player:build
npm run player:dist
```

Directly inside `apps/player`:

```bash
npm run dev
npm run build
npm run dist
```

## Environment

- `PLAYER_TARGET_URL` (optional)
  - default: `https://userhythm.kr`
  - used by both dev and packaged builds

## Notes

- `nodeIntegration` is disabled.
- `contextIsolation` and `sandbox` are enabled.
- Player uses an isolated profile path under the OS app-data directory.

