import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

export interface Job {
  id: string;
  status: string;
  filename: string;
  original_name: string;
  s3_key: string;
  result_key: string;
  error_message: string;
  created_at: string;
  updated_at: string;
}

export async function uploadFile(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ job_id: string; status: string }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (e.total && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
  });
  return data;
}

export async function getJob(id: string): Promise<Job> {
  const { data } = await api.get(`/jobs/${id}`);
  return data;
}

export async function getJobs(): Promise<Job[]> {
  const { data } = await api.get("/jobs");
  return data;
}

export async function deleteJob(id: string): Promise<void> {
  await api.delete(`/jobs/${id}`);
}

export async function deleteAllJobs(): Promise<{ deleted: number }> {
  const { data } = await api.delete("/jobs");
  return data;
}

export function getSheetUrl(id: string): string {
  return `/api/jobs/${id}/sheet`;
}
