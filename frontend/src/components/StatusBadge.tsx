const statusConfig: Record<string, { color: string; label: string; animate: boolean }> = {
  pending: { color: "bg-gray-500", label: "Pending", animate: false },
  processing: { color: "bg-blue-500", label: "Transcribing", animate: true },
  converting: { color: "bg-yellow-500", label: "Converting", animate: true },
  completed: { color: "bg-green-500", label: "Completed", animate: false },
  failed: { color: "bg-red-500", label: "Failed", animate: false },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white ${config.color} ${config.animate ? "animate-pulse-slow" : ""}`}
    >
      {config.animate && (
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
      )}
      {config.label}
    </span>
  );
}
