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
  options?: Record<string, unknown>;
}
export interface Provider {
  id: string;
  label: string;
  fields?: string[];
  listRuns(target: Target, context: Record<string, unknown>): Promise<Run[]>;
}
