package handler

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/sheetflow/api/internal/db"
	"github.com/sheetflow/api/internal/storage"
)

type JobHandler struct {
	store *db.Store
	s3    *storage.S3Client
}

func NewJobHandler(store *db.Store, s3 *storage.S3Client) *JobHandler {
	return &JobHandler{store: store, s3: s3}
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

	url, err := h.s3.PresignedURL(r.Context(), job.ResultKey, 15*time.Minute)
	if err != nil {
		slog.Error("presign failed", "error", err, "job_id", id)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate download URL"})
		return
	}
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
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
