package statusync

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/redis/go-redis/v9"
	"github.com/sheetflow/api/internal/db"
)

type statusMessage struct {
	JobID     string `json:"job_id"`
	Status    string `json:"status"`
	ResultKey string `json:"result_key"`
	Error     string `json:"error"`
}

// Run subscribes to all job status updates from the worker via Redis
// and syncs them to the PostgreSQL database.
func Run(ctx context.Context, rdb *redis.Client, store *db.Store) {
	sub := rdb.PSubscribe(ctx, "jobs:*:status")
	defer sub.Close()

	ch := sub.Channel()
	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var sm statusMessage
			if err := json.Unmarshal([]byte(msg.Payload), &sm); err != nil {
				slog.Error("failed to parse status message", "error", err)
				continue
			}
			if err := store.UpdateJobStatus(ctx, sm.JobID, sm.Status, sm.ResultKey, sm.Error); err != nil {
				slog.Error("failed to update job in db", "error", err, "job_id", sm.JobID)
			} else {
				slog.Info("job status synced to db", "job_id", sm.JobID, "status", sm.Status)
			}
		case <-ctx.Done():
			return
		}
	}
}
