export type Status = 'running' | 'success' | 'failed' | 'queued' | 'waiting' | 'cancelled' | 'skipped' | 'unknown';
export interface Step {
  id: string | number;
  name: string;
  status: Status;
  startedAt?: string | null;
  completedAt?: string | null;
}
export interface Job extends Step { steps?: Step[] }
export interface Run extends Step {
  value?: number | string;
  kind?: 'pipeline' | 'service';
  repository?: string;
  branch?: string;
  commit?: string;
  number?: string | number;
  title?: string;
  detail?: string;
  environment?: string;
  url?: string | null;
  progressPercent?: number | null;
  jobs?: Job[];
}
export interface Target {
  id: string;
  provider: string;
  name?: string;
  owner?: string;
  workspace?: string;
  repo?: string;
  branch?: string;
  url?: string;
  buildType?: string;
  tokenEnv?: string;
  authScheme?: 'basic' | 'bearer';
  expectedStatus?: number;
  jsonPath?: string;
  expectedValue?: string;
  valuePath?: string;
  options?: Record<string, unknown>;
}
export interface Provider {
  id: string;
  label: string;
  fields?: string[];
  listRuns(target: Target, context: Record<string, unknown>): Promise<Run[]>;
}
export interface Project {
  kind: 'folder' | 'claude';
  id: string;
  name?: string;
}
export interface Badge {
  id: string;
  label: string;
  scope: 'global' | 'project';
  /** Omit to include all current and future sources. */
  sourceIds?: string[];
  project?: Project;
  display?: {type: 'status'} | {type: 'value'; sourceId: string; prefix?: string; suffix?: string};
}
export interface Config {
  mode: 'demo' | 'live';
  pollIntervalMs?: number;
  sources: Target[];
  /** Omit for the original combined CI badge; [] hides all status badges. */
  badges?: Badge[];
}
