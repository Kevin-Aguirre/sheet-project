import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Music, ExternalLink, Trash2 } from "lucide-react";
import UploadZone from "../components/UploadZone";
import StatusBadge from "../components/StatusBadge";
import { getJobs, deleteJob, deleteAllJobs } from "../api/client";

export default function HomePage() {
  const queryClient = useQueryClient();
  const { data: jobs } = useQuery({
    queryKey: ["jobs"],
    queryFn: getJobs,
    refetchInterval: 10000,
  });

  const removeJob = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const clearAll = useMutation({
    mutationFn: deleteAllJobs,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Music className="w-10 h-10 text-accent" />
          <h1 className="text-4xl font-bold tracking-tight">SheetFlow</h1>
        </div>
        <p className="text-gray-400 text-lg">
          Transform audio into playable sheet music
        </p>
      </div>

      {/* Upload */}
      <UploadZone />

      {/* Recent Jobs */}
      {jobs && jobs.length > 0 && (
        <div className="mt-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-200">
              Recent Transcriptions
            </h2>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Delete all transcriptions? This cannot be undone."
                  )
                ) {
                  clearAll.mutate();
                }
              }}
              disabled={clearAll.isPending}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-400 transition disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Clear all
            </button>
          </div>
          <div className="space-y-2">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-2 bg-dark-800 hover:bg-dark-700 rounded-xl pl-5 pr-3 py-4 transition group"
              >
                <Link
                  to={`/jobs/${job.id}`}
                  className="flex items-center justify-between gap-3 flex-1 min-w-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Music className="w-5 h-5 text-gray-500 shrink-0" />
                    <span className="truncate text-gray-200">
                      {job.original_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={job.status} />
                    <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition" />
                  </div>
                </Link>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete "${job.original_name}"?`)) {
                      removeJob.mutate(job.id);
                    }
                  }}
                  disabled={removeJob.isPending}
                  aria-label="Delete transcription"
                  className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-50 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
