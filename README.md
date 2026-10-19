# CI status badge

Small configurable badges beside the Claude Desktop prompt, such as **API · Passed** and **Build · 1 running**. Each badge can appear everywhere or only in one Claude Project or Code folder. A spinner shows active work; color and an icon distinguish passed, failed, approval, queued and unknown states. Click for a small popover with repository, branch, source path and progress.

The underlying provider interface supports **GitHub Actions**, **Bitbucket Cloud Pipelines**, **TeamCity**, and **HTTP health checks**. HTTP sources can check a status code and an optional JSON property/value. The UI is plain JavaScript/CSS; esbuild is the only development dependency.

**Start here:** [Quick start and examples](docs/QUICKSTART.md) — connect a source, copy a configuration, or try a custom provider.

## Preview

Node.js 22 or newer:

```powershell
npm ci
npm start
```

Open http://127.0.0.1:4319/ to see the badge in a composer fixture. The small state selector is a preview control. Click the badge → **Add source** to enter the provider, URL/path, repository and branch. Adding a source switches from sample data to live checks. Removing all sources returns to sample data.

Open a badge → **Badges → Add badge** to choose its label, sources and visibility. **Use current project** fills a detected Code folder or Claude project; a manual project selector is available when detection is unavailable. Common badges remain visible as projects change. All badges share one polling controller. See [scoped examples](examples/scoped-badges.json); existing configuration files keep their original combined CI badge.

Badges can also display metrics such as **Latency · 48 ms**. Set an HTTP source’s **Value property path**, then choose **Display → Source value / metric** in the badge editor, with an optional prefix/suffix. Custom providers can return a numeric or text `value`. The underlying health state remains visible through the icon and color.

Settings are stored in ignored `ci-status.config.json`; see `ci-status.config.example.json`. Credentials stay in environment variables. Set e.g. `$env:TEAMCITY_TOKEN` or `$env:GITHUB_TOKEN` before starting the host. The optional **Token environment variable** field contains a variable name, never its value. Bitbucket repository access tokens use Bearer; API tokens use Basic with base64(email:token) stored in the selected variable. HTTP redirects are treated as failed checks.

## Use in a mod

```js
import {mountBadge} from './src/ui/app.mjs';

const badge = mountBadge(element, {request: hostBridge.request});
// Include src/ui/styles.css in this element's document or shadow root.
// When the containing view is removed:
badge.destroy();
```

The bridge accepts `snapshot`, `config.get`, and `config.set` requests. `createStatusService` in `src/core/service.mjs` implements that contract. Provider results pass through one status model, so the badge does not contain provider-specific rendering. See [extending](docs/EXTENDING.md).

## Desktop bundles

`npm run build` emits `dist/badge.js`, `dist/badge.css` and `dist/desktop/{main.cjs,preload.cjs,renderer.js}`. The renderer inserts the badge into `[data-signal-ci-slot]` when supplied; otherwise it tries the current prompt container. Its UI lives in a shadow root. The bridge accepts only Claude's trusted top-level `app://localhost` frame.

The Windows archive patch follows the approach in `../claude-mod`. It preserves current application bytes, including an existing Obsidian patch, in exact backups. **Native placement and automatic updates have been verified in installed Claude Desktop 2.42304.2**, with the Obsidian tab still present. The browser preview remains a fixture; build and preview alone do not install the patch.

To prepare a patch, provide the installed application's actual folder/version:

```powershell
npm run build
npm run stage:desktop -- --install-dir "$env:LOCALAPPDATA\AnthropicClaude\app-VERSION" --expected-version VERSION
```

Staging writes backups and a manifest under `.local/desktop/`; it does not install. Version agreement, archive entries and embedded integrity hashes are checked. This does not certify compatibility with a new Desktop version.

After reviewing the stage, fully quit Claude from its tray menu. `npm run install:desktop` applies that stage; `npm run restore:desktop` restores its exact prior files. Both refuse a running app or unexpected file changes. Restoring a Signal stage keeps any Obsidian patch that existed before that stage. Restore Signal before updating that underlying patch or Claude. Bundles refer to this checkout's configuration path, so rebuild after moving it.

## Verification

For a working demo through the **actual Desktop renderer, preload and IPC bridge**, using local mock TeamCity and HTTP servers:

```powershell
npm run prepare:demo
npm run demo:framework
```

This opens a disposable native Electron host with the same 26px badge. The mock sources cycle through running, 80% progress, passed, failed, unavailable and recovery. The badge reads real HTTP responses through the real provider adapters and updates on its normal 15-second polling timer. The dropdown changes upstream fixture data; it does not set the badge state.

The disposable host uses the Electron runtime from an existing Windows Obsidian installation, copied under ignored `.local/framework-demo/`. This is only a local test dependency. Supply another installation folder with `node scripts/prepare-framework-demo.mjs --runtime <folder>` if needed. Installed Claude and Obsidian are untouched by preparing/running this host.

For the installed-Desktop demonstration, `npm run demo:upstream` runs the two mock source endpoints on port 4320 and changes their real HTTP responses every 20 seconds. Its source configuration is written to `.local/mock-upstream/sources.json`. The currently installed badge uses those sources and polls every 15 seconds. If the mock process stops, source errors become stale/unavailable rather than a false passing state. Replace the mock sources through the badge's source editor when ready to connect your own services.

`npm run test:desktop` performs native assertions for preload/IPC trust, progress updates, pass/fail/stale/recovery, preserved composer drafts, reattachment after a composer remount, multiple badges, project switching, isolated source errors, metric configuration/updates and the 375px layout. It takes roughly three minutes because it waits for real polling. Results and captured screenshots are saved in `.local/framework-demo/report.json` and the same folder. Run `prepare:demo` first; this native test is separate from the ordinary Node suite.

```powershell
npm test
npm run build
```

Tests exercise state/progress normalization, the provider contract, API response mapping, pagination, ETags, local HTTP checks, stale/partial failures, configuration persistence, loopback origin/host checks, frame trust, archive preservation and installation rollback. Private provider instances and native Claude pixels require a separate integration check.
