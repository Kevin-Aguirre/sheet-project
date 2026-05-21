package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Job struct {
	ID           string    `json:"id"`
	Status       string    `json:"status"`
	Filename     string    `json:"filename"`
	OriginalName string    `json:"original_name"`
	S3Key        string    `json:"s3_key"`
	ResultKey    string    `json:"result_key,omitempty"`
	ErrorMessage string    `json:"error_message,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) Migrate(ctx context.Context) error {
	query := `
	CREATE TABLE IF NOT EXISTS jobs (
		id            TEXT PRIMARY KEY,
		status        TEXT NOT NULL DEFAULT 'pending',
		filename      TEXT NOT NULL,
		original_name TEXT NOT NULL,
		s3_key        TEXT NOT NULL,
		result_key    TEXT,
		error_message TEXT,
		created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`
	_, err := s.pool.Exec(ctx, query)
	return err
}

func (s *Store) CreateJob(ctx context.Context, job *Job) error {
	query := `
	INSERT INTO jobs (id, status, filename, original_name, s3_key, created_at, updated_at)
	VALUES ($1, $2, $3, $4, $5, $6, $7)`
	_, err := s.pool.Exec(ctx, query,
		job.ID, job.Status, job.Filename, job.OriginalName, job.S3Key, job.CreatedAt, job.UpdatedAt,
	)
	return err
}

func (s *Store) GetJob(ctx context.Context, id string) (*Job, error) {
	query := `SELECT id, status, filename, original_name, s3_key,
	          COALESCE(result_key, ''), COALESCE(error_message, ''), created_at, updated_at
	          FROM jobs WHERE id = $1`
	job := &Job{}
	err := s.pool.QueryRow(ctx, query, id).Scan(
		&job.ID, &job.Status, &job.Filename, &job.OriginalName, &job.S3Key,
		&job.ResultKey, &job.ErrorMessage, &job.CreatedAt, &job.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return job, nil
}

func (s *Store) UpdateJobStatus(ctx context.Context, id, status, resultKey, errorMsg string) error {
	query := `UPDATE jobs SET status = $2, result_key = $3, error_message = $4, updated_at = NOW() WHERE id = $1`
	_, err := s.pool.Exec(ctx, query, id, status, nilIfEmpty(resultKey), nilIfEmpty(errorMsg))
	return err
}

func (s *Store) ListJobs(ctx context.Context, limit int) ([]Job, error) {
	query := `SELECT id, status, filename, original_name, s3_key,
	          COALESCE(result_key, ''), COALESCE(error_message, ''), created_at, updated_at
	          FROM jobs ORDER BY created_at DESC LIMIT $1`
	rows, err := s.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []Job
	for rows.Next() {
		var j Job
		if err := rows.Scan(&j.ID, &j.Status, &j.Filename, &j.OriginalName, &j.S3Key,
			&j.ResultKey, &j.ErrorMessage, &j.CreatedAt, &j.UpdatedAt); err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}
	return jobs, nil
}

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
