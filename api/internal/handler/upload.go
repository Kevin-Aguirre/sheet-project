package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sheetflow/api/internal/db"
	"github.com/sheetflow/api/internal/queue"
	"github.com/sheetflow/api/internal/storage"
)

type UploadHandler struct {
	store         *db.Store
	s3            *storage.S3Client
	queue         *queue.RedisQueue
	maxUploadSize int64
}

func NewUploadHandler(store *db.Store, s3 *storage.S3Client, q *queue.RedisQueue, maxSize int64) *UploadHandler {
	return &UploadHandler{store: store, s3: s3, queue: q, maxUploadSize: maxSize}
}

func (h *UploadHandler) Upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, h.maxUploadSize)

	if err := r.ParseMultipartForm(h.maxUploadSize); err != nil {
		slog.Error("file too large", "error", err)
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file too large, max 50MB"})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		slog.Error("missing file", "error", err)
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing file field"})
		return
	}
	defer file.Close()

	if !isValidMP3(header.Filename, file) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "only MP3 files are accepted"})
		return
	}

	jobID := uuid.New().String()
	s3Key := fmt.Sprintf("uploads/%s.mp3", jobID)
	now := time.Now()

	if err := h.s3.Upload(r.Context(), s3Key, file, "audio/mpeg"); err != nil {
		slog.Error("s3 upload failed", "error", err, "job_id", jobID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to store file"})
		return
	}

	job := &db.Job{
		ID:           jobID,
		Status:       "pending",
		Filename:     fmt.Sprintf("%s.mp3", jobID),
		OriginalName: header.Filename,
		S3Key:        s3Key,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if err := h.store.CreateJob(r.Context(), job); err != nil {
		slog.Error("db insert failed", "error", err, "job_id", jobID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create job"})
		return
	}

	msg := &queue.JobMessage{ID: jobID, S3Key: s3Key, CreatedAt: now}
	if err := h.queue.Publish(r.Context(), msg); err != nil {
		slog.Error("queue publish failed", "error", err, "job_id", jobID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to queue job"})
		return
	}

	slog.Info("job created", "job_id", jobID, "filename", header.Filename)
	writeJSON(w, http.StatusCreated, map[string]string{"job_id": jobID, "status": "pending"})
}

func isValidMP3(filename string, file io.ReadSeeker) bool {
	if !strings.HasSuffix(strings.ToLower(filename), ".mp3") {
		return false
	}
	buf := make([]byte, 3)
	if _, err := file.Read(buf); err != nil {
		return false
	}
	file.Seek(0, io.SeekStart)
	// Check for ID3 tag or MP3 frame sync
	return string(buf) == "ID3" || (buf[0] == 0xFF && (buf[1]&0xE0) == 0xE0)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
