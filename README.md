# CP-Lockin

A Firefox browser extension that tracks your competitive programming progress across Codeforces and LeetCode.

## Features

- **Daily tracking**: See how many problems you solved today across all platforms.
- **Weekly progress**: Track progress toward a configurable weekly goal (default: 25 problems).
- **Streak counter**: Maintain a streak of consecutive days with at least 1 solve.
- **Daily goal enforcement**: Visual indicator when your minimum daily goal is met.
- **Auto-sync**: Submissions are synced every 30 minutes in the background.

## Supported Platforms

- [Codeforces](https://codeforces.com) — via the public REST API
- [LeetCode](https://leetcode.com) — via the public GraphQL API

## Setup

1. Clone or download this repository.
2. Open Firefox and navigate to `about:debugging`.
3. Click **This Firefox** → **Load Temporary Add-on**.
4. Select the `manifest.json` file from the project root.
5. Click the extension icon in the toolbar.
6. Open **Settings** (gear icon) and enter your Codeforces and/or LeetCode handles.

## Development

Install [web-ext](https://github.com/mozilla/web-ext) for a live-reload development environment:

```bash
npm install
npm run run
```

Build a distributable `.zip`:

```bash
npm run build
```

Lint the extension:

```bash
npm run lint
```

## Project Structure

```
src/
  api/          - Platform-specific API clients
  background/   - Service worker for background sync
  config/       - Default configuration values
  options/      - Settings page
  popup/        - Popup UI
  services/     - Business logic (stats, streaks)
  storage/      - Storage abstraction
  utils/        - Shared utilities
```

## Adding a New Platform (e.g., AtCoder)

1. Create `src/api/atcoderApi.js` implementing `getSubmissions(handle)` that returns normalized `Submission[]`.
2. Register it in `src/api/platformFactory.js`.
3. Add `atcoderHandle` to the settings schema in `src/config/defaults.js` and `src/storage/storageService.js`.
4. Add the host permission to `manifest.json`.

