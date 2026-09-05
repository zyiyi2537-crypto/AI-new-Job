import type { AIStatus, Job, Overview, PreparedJob, ResumeMaster, ResumeVariant, SearchLink, SearchPlan, SourceDefinition } from "../shared/types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return data;
}

export const api = {
  overview: () => request<Overview>("/api/overview"),
  master: () => request<ResumeMaster>("/api/resumes/master"),
  uploadResume: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<{ duplicate: boolean; parser: string; master: ResumeMaster }>("/api/resumes/import", { method: "POST", body });
  },
  sources: () => request<SourceDefinition[]>("/api/sources"),
  jobs: () => request<Job[]>("/api/jobs"),
  seedJobs: () => request<{ inserted: number }>("/api/jobs/seed", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
  importJob: (job: Record<string, unknown>) => request<{ inserted: number; ids: number[] }>("/api/jobs/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  }),
  analyzeJob: (id: number, mode: "rules" | "ai" = "rules") => request<Job["analysis"]>(`/api/jobs/${id}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  }),
  analyzeAll: () => request<{ analyzed: number }>("/api/jobs/analyze", { method: "POST" }),
  createVariant: (id: number) => request<ResumeVariant>(`/api/jobs/${id}/variants`, { method: "POST" }),
  variants: () => request<ResumeVariant[]>("/api/variants"),
  applications: () => request<Array<Record<string, unknown>>>("/api/applications"),
  aiStatus: () => request<AIStatus>("/api/ai/status"),
  configureAI: (config: { baseUrl: string; apiKey?: string; model: string }) => request<AIStatus>("/api/ai/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  }),
  testAI: () => request<{ ok: true; latencyMs: number; status: AIStatus }>("/api/ai/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
  searchLinks: (query: string, city: string) => request<SearchLink[]>(`/api/sources/search-links?q=${encodeURIComponent(query)}&city=${encodeURIComponent(city)}`),
  searchPlan: (city: string, options: { preferAI?: boolean; refresh?: boolean } = {}) => request<SearchPlan>("/api/search-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city, preferAI: options.preferAI ?? true, refresh: options.refresh ?? false }),
  }),
  collectorInfo: () => request<{ extensionPath: string; supportedSources: string[] }>("/api/collector/info"),
  importJobUrl: (url: string) => request<{ inserted: number; ids: number[]; job: Job }>("/api/jobs/import-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }),
  captureJobs: (jobs: Array<Record<string, unknown>>, autoAnalyze = false) => request<{ received: number; inserted: number; ids: number[]; analyzed: number; topMatches: Array<{ id: number; title: string; company: string; score: number }> }>("/api/jobs/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(autoAnalyze ? { jobs, autoAnalyze: true } : jobs),
  }),
  prepareJobs: (ids: number[], options: { maxVariants?: number; minScore?: number; mode?: "auto" | "rules" | "ai" } = {}) => request<{ scanned: number; eligible: number; prepared: PreparedJob[]; failures: string[] }>("/api/jobs/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, maxVariants: options.maxVariants ?? 3, minScore: options.minScore ?? 55, mode: options.mode ?? "auto" }),
  }),
  setApplicationStatus: (jobId: number, status: string) => request<{ ok: boolean }>(`/api/applications/${jobId}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  }),
};
