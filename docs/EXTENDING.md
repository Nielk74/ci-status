# Extending the badge

An adapter returns up to 100 runs using `listRuns(target, context)`. The registry qualifies IDs with provider/source IDs, validates the result, removes unexpected fields, and normalizes statuses before the UI sees them.

```js
import {createStatusService} from '../src/core/service.mjs';
import {createProviderRegistry} from '../src/providers/registry.mjs';

const registry = createProviderRegistry([{
  id: 'my-ci',
  label: 'My CI',
  async listRuns(target) {
    const result = await yourReadOnlyClient(target);
    return [{
      id: result.id,
      name: result.name,
      repository: result.repository,
      branch: result.branch,
      status: result.state, // running | success | failed | waiting | queued ...
      jobs: result.jobs,
    }];
  },
}]);
const service = createStatusService({registry, config: {
  mode: 'live', pollIntervalMs: 30000,
  sources: [{id: 'build', name: 'My build', provider: 'my-ci',
    options: {project: 'website'}}],
}});
```

Use `target.options` for custom provider settings. The small built-in source form supports the four included adapters; custom targets can be supplied in JSON. The provider owns validation of its custom options. Throw an error for an unavailable or malformed source; the service retains previous runs for that source and reports it stale. Health checks should return `kind: 'service'`, a status and a short detail such as `HTTP 200 · 45 ms`.

Run fields and states are defined in `src/core/types.d.ts` and `src/core/model.mjs`. `progress(run)` counts completed jobs; sources can instead supply `progressPercent`. No job total means indeterminate progress. Unknown results remain unknown rather than passing. Prefer stable run IDs and canonical source URLs.

Host code owns network access and credentials. Use timeouts, bounded pagination and sanitized errors. Never return tokens. Built-in providers use environment variables, ETags where available, and reject redirects. `src/providers/client.mjs` is a reusable authenticated JSON client.

The widget inherits Claude's native HSL theme tokens (`--bg-000`, `--text-100`, `--text-400`, `--border-300`, and the semantic status colors) across the shadow boundary. Standalone use has light/dark fallbacks. Customize the `--ci-*` tokens in `src/ui/styles.css` when needed. CSS respects `prefers-reduced-motion`. The badge is 26px tall with 12px text; the closed widget occupies only its own inline width.
