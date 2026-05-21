import { useState, useRef, useCallback } from "react";
import { Upload, Music, AlertCircle } from "lucide-react";
import { uploadFile } from "../api/client";
import { useNavigate } from "react-router-dom";

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export default function UploadZone() {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      if (!file.name.toLowerCase().endsWith(".mp3")) {
        setError("Only MP3 files are accepted");
        return;
      }
      if (file.size > MAX_SIZE) {
        setError("File must be under 50MB");
        return;
      }

      setUploading(true);
      setProgress(0);

      try {
        const result = await uploadFile(file, setProgress);
        navigate(`/jobs/${result.job_id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setUploading(false);
      }
    },
    [navigate]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="w-full max-w-xl mx-auto">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-200 ${
          dragOver
            ? "border-accent bg-accent/10 scale-[1.02]"
            : "border-dark-400 hover:border-accent/50 hover:bg-dark-900"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,audio/mpeg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        <div className="flex flex-col items-center gap-4">
          {uploading ? (
            <>
              <Music className="w-12 h-12 text-accent animate-bounce" />
              <div className="w-full max-w-xs">
                <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-sm text-gray-400 mt-2">
                  Uploading... {progress}%
                </p>
              </div>
            </>
          ) : (
            <>
              <Upload className="w-12 h-12 text-gray-400" />
              <div>
                <p className="text-lg font-medium text-gray-200">
                  Drop your MP3 file here
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  or click to browse (max 50MB)
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
