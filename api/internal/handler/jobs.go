package handler

import (
	"context"
	"io"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"
	"github.com/sheetflow/api/internal/db"
	"github.com/sheetflow/api/internal/storage"
)

type JobHandler struct {
	store *db.Store
	s3    *storage.S3Client
	rdb   *redis.Client
}

func NewJobHandler(store *db.Store, s3 *storage.S3Client, rdb *redis.Client) *JobHandler {
	return &JobHandler{store: store, s3: s3, rdb: rdb}
}

func (h *JobHandler) GetJob(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	job, err := h.store.GetJob(r.Context(), id)
	if err != nil {
		slog.Error("job not found", "error", err, "job_id", id)
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (h *JobHandler) GetSheet(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	job, err := h.store.GetJob(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
		return
	}
	if job.Status != "completed" || job.ResultKey == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "sheet not ready"})
		return
	}

	body, err := h.s3.Download(r.Context(), job.ResultKey)
	if err != nil {
		slog.Error("s3 download failed", "error", err, "job_id", id)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch sheet"})
		return
	}
	defer body.Close()

	w.Header().Set("Content-Type", "application/vnd.recordare.musicxml+xml")
	io.Copy(w, body)
}

func (h *JobHandler) GetOriginal(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	job, err := h.store.GetJob(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
		return
	}

	body, err := h.s3.Download(r.Context(), job.S3Key)
	if err != nil {
		slog.Error("s3 download failed", "error", err, "job_id", id)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch audio"})
		return
	}
	defer body.Close()

	w.Header().Set("Content-Type", "audio/mpeg")
	io.Copy(w, body)
}

func (h *JobHandler) DeleteJob(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	job, err := h.store.GetJob(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
		return
	}

	h.deleteArtifacts(r.Context(), job)
	if err := h.store.DeleteJob(r.Context(), id); err != nil {
		slog.Error("delete job failed", "error", err, "job_id", id)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete job"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *JobHandler) DeleteAllJobs(w http.ResponseWriter, r *http.Request) {
	jobs, err := h.store.ListAllJobs(r.Context())
	if err != nil {
		slog.Error("list jobs failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list jobs"})
		return
	}

	for i := range jobs {
		h.deleteArtifacts(r.Context(), &jobs[i])
	}
	// Drop any still-queued jobs so the worker doesn't process orphans.
	h.rdb.Del(r.Context(), "jobs:pending")

	count, err := h.store.DeleteAllJobs(r.Context())
	if err != nil {
		slog.Error("delete all jobs failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete jobs"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"deleted": count})
}

// deleteArtifacts best-effort removes a job's S3 objects and Redis status hash.
// Failures are logged but don't abort the delete — the DB row is the source of
// truth for what's listed, so removing it is what matters most.
func (h *JobHandler) deleteArtifacts(ctx context.Context, job *db.Job) {
	if job.S3Key != "" {
		if err := h.s3.Delete(ctx, job.S3Key); err != nil {
			slog.Warn("failed to delete upload object", "error", err, "key", job.S3Key)
		}
	}
	if job.ResultKey != "" {
		if err := h.s3.Delete(ctx, job.ResultKey); err != nil {
			slog.Warn("failed to delete result object", "error", err, "key", job.ResultKey)
		}
	}
	h.rdb.Del(ctx, "jobs:"+job.ID)
}

func (h *JobHandler) ListJobs(w http.ResponseWriter, r *http.Request) {
	jobs, err := h.store.ListJobs(r.Context(), 20)
	if err != nil {
		slog.Error("list jobs failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list jobs"})
		return
	}
	if jobs == nil {
		jobs = []db.Job{}
	}
	writeJSON(w, http.StatusOK, jobs)
}
