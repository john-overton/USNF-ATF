# Phase 1 baseline: repo scaffold, shell, packaging

Recorded per build plan section 1 ("baselines are recorded, not remembered").

## macOS (Apple Silicon)

- Date: 2026-09-08
- Machine: Apple M3, macOS 26.6.2 (build 25G83)
- Commit: see `git log` for the phase 1 scaffold commit

### Tool versions

| Tool | Version |
| --- | --- |
| bun | 1.4.2 |
| node | v22.14.0 |
| electron | 44.2.0 (Chromium 152.0.7977.76) |
| electron-builder | 26.15.3 |
| three | 0.185.1 |
| vite | 8.2.2 |
| react | 19.2.8 |
| typescript | 5.9.3 |
| eslint / typescript-eslint | 9.39.5 / 8.70.0 |

### `bun run probe` (packaged app, `build/mac/mac-arm64/USNF-ATF.app`), exit 0

```json
{
  "shell": {
    "name": "electron",
    "version": "0.1.0 (electron 44.2.0, chrome 152.0.7977.76)",
    "os": "darwin",
    "arch": "arm64",
    "capabilities": {
      "persistentWrites": true,
      "nativeWindow": true,
      "powerState": true
    }
  },
  "probe": {
    "renderer": "ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)",
    "vendor": "Google Inc. (Apple)",
    "unmaskedInfo": true,
    "glVersion": "WebGL 2.0 (OpenGL ES 3.0 Chromium)",
    "glslVersion": "WebGL GLSL ES 3.00 (OpenGL ES GLSL ES 3.0 Chromium)",
    "maxTextureSize": 16384,
    "maxVertexTextureImageUnits": 16,
    "maxColorAttachments": 8,
    "maxSamples": 4,
    "maxUniformBlockSize": 16384,
    "extColorBufferFloat": true,
    "maxAnisotropy": 16,
    "extensionCount": 36,
    "softwareRenderer": false
  }
}
```

The unpackaged bundle (`bun run probe --unpackaged`) reports the identical result.

### `bun run check`

Exit 0. Typecheck of engine, shell, importer clean; ESLint 0 errors 0 warnings; Prettier clean; 12 tests pass (FixedStepClock, software-renderer heuristic).

### `bun run build`

- Wall time: 49 s (Vite build 0.4 s; electron-builder for macOS, arm64 + x64, dmg + zip, unsigned, x64 Electron and dmgbuild downloaded on this run and cached afterwards).
- Output under `build/mac/`:

| Artifact | Size |
| --- | --- |
| `mac-arm64/USNF-ATF.app` | 244 MB on disk |
| `USNF-ATF-0.1.0-arm64.dmg` | 116.1 MB |
| `USNF-ATF-0.1.0-arm64-mac.zip` | 116.0 MB |
| `mac/USNF-ATF.app` (x64) | 247 MB on disk |
| `USNF-ATF-0.1.0.dmg` (x64) | 119.8 MB |
| `USNF-ATF-0.1.0-mac.zip` (x64) | 119.7 MB |

Renderer bundle: 714 kB JS (192 kB gzip), almost all Three.js.

Notes:
- The unsigned arm64 app launched directly from `build/mac/mac-arm64` without Gatekeeper interference (Electron's binary carries an ad-hoc signature; electron-builder skipped signing with `identity: null`). Nothing was run from the DMG.
- Bun's bundler bakes `__dirname` to the source path; the main process locates `dist/` via `app.getAppPath()` instead, so the unpackaged run is `electron <shell dir>`.

## Linux GPU box

_Not yet recorded. Fill in: date, CPU/GPU, distro and kernel, driver version, tool versions, the `bun run probe` JSON from the AppImage (renderer must be hardware, exit 0), `bun run check` result, build wall time, AppImage and deb sizes._
