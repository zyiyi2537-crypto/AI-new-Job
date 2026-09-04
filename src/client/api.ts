import type { Job, Overview, ResumeMaster, ResumeVariant, SourceDefinition } from "../shared/types";

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
  seedJobs: () => request<{ inserted: number }>("/api/jobs/seed", { method: "POST" }),
  importJob: (job: Record<string, unknown>) => request<{ inserted: number; ids: number[] }>("/api/jobs/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  }),
  analyzeJob: (id: number) => request<Job["analysis"]>(`/api/jobs/${id}/analyze`, { method: "POST" }),
  analyzeAll: () => request<{ analyzed: number }>("/api/jobs/analyze", { method: "POST" }),
  createVariant: (id: number) => request<ResumeVariant>(`/api/jobs/${id}/variants`, { method: "POST" }),
  variants: () => request<ResumeVariant[]>("/api/variants"),
  applications: () => request<Array<Record<string, unknown>>>("/api/applications"),
  setApplicationStatus: (jobId: number, status: string) => request<{ ok: boolean }>(`/api/applications/${jobId}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  }),
};
