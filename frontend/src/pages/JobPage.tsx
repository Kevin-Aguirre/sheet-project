import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Download, AlertTriangle, Loader2 } from "lucide-react";
import { useJobStatus } from "../hooks/useJobStatus";
import SheetViewer from "../components/SheetViewer";
import AudioComparison from "../components/AudioComparison";
import StatusBadge from "../components/StatusBadge";
import { getSheetUrl } from "../api/client";

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const { status, job } = useJobStatus(id!);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="p-2 rounded-lg hover:bg-dark-800 transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-100 truncate max-w-md">
              {job?.original_name || "Loading..."}
            </h1>
            <div className="mt-1">
              <StatusBadge status={status} />
            </div>
          </div>
        </div>

        {status === "completed" && (
          <a
            href={getSheetUrl(id!)}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dark rounded-lg text-sm font-medium transition"
          >
            <Download className="w-4 h-4" />
            Download MusicXML
          </a>
        )}
      </div>

      {/* Content */}
      {(status === "pending" || status === "processing" || status === "converting" || status === "separating" || status === "transcribing") && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <Loader2 className="w-12 h-12 animate-spin text-accent mb-4" />
          <p className="text-lg">
            {status === "pending" && "Waiting in queue..."}
            {status === "processing" && "Downloading audio..."}
            {status === "separating" && "Separating instruments..."}
            {status === "transcribing" && "Transcribing to MIDI..."}
            {status === "converting" && "Arranging for piano..."}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            This may take a minute depending on the file length
          </p>
        </div>
      )}

      {status === "failed" && (
        <div className="flex flex-col items-center justify-center py-24">
          <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
          <p className="text-lg text-red-400">Transcription Failed</p>
          {job?.error_message && (
            <p className="text-sm text-gray-500 mt-2 max-w-md text-center">
              {job.error_message}
            </p>
          )}
        </div>
      )}

      {status === "completed" && (
        <div className="space-y-6">
          <SheetViewer musicXmlUrl={getSheetUrl(id!)} />
          <AudioComparison
            originalUrl={`/api/jobs/${id!}/original`}
          />
        </div>
      )}
    </div>
  );
}
