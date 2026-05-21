import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Music, ExternalLink } from "lucide-react";
import UploadZone from "../components/UploadZone";
import StatusBadge from "../components/StatusBadge";
import { getJobs } from "../api/client";

export default function HomePage() {
  const { data: jobs } = useQuery({
    queryKey: ["jobs"],
    queryFn: getJobs,
    refetchInterval: 10000,
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
          <h2 className="text-lg font-semibold text-gray-200 mb-4">
            Recent Transcriptions
          </h2>
          <div className="space-y-2">
            {jobs.map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.id}`}
                className="flex items-center justify-between bg-dark-800 hover:bg-dark-700 rounded-xl px-5 py-4 transition group"
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
