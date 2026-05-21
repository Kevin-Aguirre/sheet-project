package handler

import (
	"io"
	"log/slog"
	"net/http"

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
