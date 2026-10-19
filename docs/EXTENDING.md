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

## Several badges, one controller

`mountBadge(element, {request, context: []})` renders the configured badge row with one polling timer and one popover. The existing export remains compatible with a single badge. A snapshot includes its `badges` definitions; each badge summarizes only its selected sources, including source errors. `config.get` and `config.set` read/write the complete shared configuration.

Set optional `badges` in the configuration; see [the complete example](../examples/scoped-badges.json). Each has an `id`, `label`, `scope` (`global` or `project`), optional `sourceIds`, and a `project` for project scope. A project is `{kind: 'folder' | 'claude', id: string, name?: string}`. Omitted `sourceIds` includes all sources; an empty array includes none. There are at most 20 sources and 20 badges. The order of the badge array determines display order.

Host integrations can supply exact context directly:

```js
const row = mountBadge(element, {
  request: hostBridge.request,
  context: [{kind: 'folder', id: 'C:/work/website'}],
});
row.setContext([{kind: 'claude', id: 'project-one'}], {navigation: true});
// Dispose the entire row when its host is removed.
row.destroy();
```

Alternatively, expose `data-signal-project-kind="folder"`, `data-signal-project-id="C:/work/website"`, and optional `data-signal-project-name="Website"` on a host element. The Desktop adapter observes these attributes, known primary Code folder controls, Claude `/project/<id>` routes, and project header breadcrumbs. It never scans prompt text or infers a project from a basename or an unselected sidebar link. Windows paths compare without case; POSIX paths compare with case. Matching is exact, not recursive. Manual context selection is a fallback and clears on navigation.

Project scope controls badge visibility. Sources share the same host credentials and polling service; it is not an access-control boundary, and hidden sources may still be polled. UI changes are persisted immediately. Removing a source also removes its explicit references from badges; an empty badge remains editable.

## Metric values

A run can return `value: number | string`, for example `{id: 'latency', name: 'API latency', status: 'success', value: 48}`. Nonfinite numbers and objects are dropped; text is limited to 120 characters and escaped when rendered. HTTP sources extract the same field using `valuePath: 'metrics.latencyMs'`.

Configure a badge with `display: {type: 'value', sourceId: 'api', prefix: '', suffix: ' ms'}` to show **48 ms** instead of **Passed**. That source must be included in the badge. Prefix/suffix are plain text, limited to 24 characters each. The first returned run from that source supplies the value; adapters should return their newest run first. Zero is valid; a missing current value shows **—**, even if an older run has a value. Status color/icon and accessible health text remain; failed, cancelled or stale checks show their status instead. Removing the value source resets that badge to normal status display. There is no executable formatting template.
