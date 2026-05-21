from prometheus_client import Counter, Histogram, Gauge

jobs_processed_total = Counter(
    "jobs_processed_total",
    "Total number of jobs processed",
    ["status"],
)

job_duration_seconds = Histogram(
    "job_duration_seconds",
    "Total job processing duration in seconds",
    buckets=[1, 5, 10, 30, 60, 120, 300, 600],
)

jobs_in_progress = Gauge(
    "jobs_in_progress",
    "Number of jobs currently being processed",
)

transcription_duration_seconds = Histogram(
    "transcription_duration_seconds",
    "Audio-to-MIDI transcription duration in seconds",
    buckets=[1, 5, 10, 30, 60, 120, 300],
)

conversion_duration_seconds = Histogram(
    "conversion_duration_seconds",
    "MIDI-to-MusicXML conversion duration in seconds",
    buckets=[0.5, 1, 2, 5, 10, 30],
)
