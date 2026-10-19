# CI badge quick start

A small badge beside your Claude prompt shows pipeline and service status. Click it for the repository, branch, progress, and source settings. It uses Claude’s colors and respects reduced motion.

## Try it

From the project folder, with Node.js 22 or newer:

```powershell
npm ci
npm start
```

Open [the local preview](http://127.0.0.1:4319/). Use **Badge state** to preview running, passed, failed, and approval states.

For the mock TeamCity/API sources used by the installed Claude demonstration, run:

```powershell
npm run demo:upstream
```

Those sources change every 20 seconds. The installed demo badge polls every 15 seconds. Keep this command running while using the demo.

## Connect a source

Click **CI → Add source**, choose a provider, fill in its fields, and **Save**. To edit or remove it, click its name in the popover’s settings list. Adding a source switches to live checks; removing every source returns to sample data.

| Provider | What to enter |
| --- | --- |
| GitHub Actions | Repository as `owner/repo`; optional branch |
| Bitbucket Cloud | Repository as `workspace/repo`; optional branch |
| TeamCity | Server URL, build configuration ID, optional branch |
| HTTP | Endpoint URL, expected status code, optional JSON check |

**Authentication:** enter an environment variable’s name, such as `TEAMCITY_TOKEN`, in the optional authentication field. Its value must be available to the host process. For the preview:

```powershell
$env:TEAMCITY_TOKEN = '<your-token>'
npm start
```

Installed Claude must inherit the variable when it starts. Never paste a token into the URL or source configuration. Bitbucket access tokens use **Bearer**; API tokens use **Basic**, with `base64(email:token)` as the variable’s value.

## Configuration examples

The UI saves `ci-status.config.json` in the project folder. For manual configuration, put source objects inside `sources`:

```json
{
  "mode": "live",
  "pollIntervalMs": 30000,
  "sources": []
}
```

Use unique source IDs. The interval is in milliseconds, with a minimum of `15000`. Restart the host after editing the file directly; changes made through the badge apply immediately.

### GitHub Actions

```json
{
  "id": "website-ci", "name": "Website CI", "provider": "github",
  "owner": "acme", "repo": "website", "branch": "main"
}
```

Public repositories can work without authentication. For private repositories, provide a token through `GITHUB_TOKEN`, `GH_TOKEN`, or an explicit `tokenEnv`.

### Bitbucket Cloud

```json
{
  "id": "api-ci", "name": "API pipeline", "provider": "bitbucket",
  "workspace": "acme", "repo": "api", "branch": "main",
  "tokenEnv": "BITBUCKET_TOKEN", "authScheme": "bearer"
}
```

### TeamCity

```json
{
  "id": "release", "name": "Release build", "provider": "teamcity",
  "url": "https://ci.example.com/teamcity",
  "buildType": "Website_Release", "branch": "main",
  "tokenEnv": "TEAMCITY_TOKEN"
}
```

`buildType` is TeamCity’s configuration ID, rather than its display name. The server URL can include a context path such as `/teamcity`.

### HTTP health check

```json
{
  "id": "payments", "name": "Payments API", "provider": "http",
  "url": "https://api.example.com/health", "expectedStatus": 200,
  "jsonPath": "service.status", "expectedValue": "ok"
}
```

This expects HTTP 200 and a response like `{"service":{"status":"ok"}}`. Omit `jsonPath` and `expectedValue` to check only the status code. Redirects count as failed checks.

A complete file containing these four sources is in [examples/sources.json](../examples/sources.json). Replace the placeholder hosts and repositories before using it.

## Add your own provider

A provider implements `listRuns(target)` and returns runs with a stable ID, name, and status:

```js
const provider = {
  id: 'my-ci',
  label: 'My CI',
  async listRuns(target) {
    return [{
      id: 'build-42', name: 'Build', status: 'running',
      repository: 'acme/website', branch: target.branch,
      progressPercent: 35,
    }];
  },
};
```

Register it in the host’s provider registry. Keep the built-in adapters in that registry when you also need them. The badge renders the shared run format automatically; custom source settings can be supplied in JSON. See the [extension guide](EXTENDING.md) for wiring a provider into the host and the supported fields.

Run the self-contained example to see the complete registration flow:

```powershell
node examples/custom-provider.mjs
```

```text
running -> CI · 1 running
success -> CI · Passed
failed -> CI · 1 failed
```

## Understand the status

| Badge | Meaning |
| --- | --- |
| Running | Work is active; progress uses completed jobs or a provider’s percentage |
| Passed / Failed | The source reported that outcome |
| Approval / Queued | Waiting for a person or a runner |
| Stale | A source failed to refresh; previous results remain visible |
| Unknown / Unavailable | No recognized result, or no source data is available |

If a source fails, open the badge for the error. Check the URL, repository/build ID, branch, and token variable. A stopped local mock server causes stale or failed status. Unknown progress remains indeterminate.

For Desktop installation, rollback, and native verification commands, see the [README](../README.md#desktop-bundles).
