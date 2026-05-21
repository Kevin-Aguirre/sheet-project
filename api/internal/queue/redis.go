package queue

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

type JobMessage struct {
	ID        string    `json:"id"`
	S3Key     string    `json:"s3_key"`
	CreatedAt time.Time `json:"created_at"`
}

type StatusMessage struct {
	JobID      string `json:"job_id"`
	Status     string `json:"status"`
	ResultKey  string `json:"result_key,omitempty"`
	Error      string `json:"error,omitempty"`
}

type RedisQueue struct {
	client *redis.Client
}

func NewRedisQueue(client *redis.Client) *RedisQueue {
	return &RedisQueue{client: client}
}

func (q *RedisQueue) Publish(ctx context.Context, job *JobMessage) error {
	data, err := json.Marshal(job)
	if err != nil {
		return err
	}
	return q.client.LPush(ctx, "jobs:pending", data).Err()
}

func (q *RedisQueue) PublishStatus(ctx context.Context, msg *StatusMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return q.client.Publish(ctx, "jobs:"+msg.JobID+":status", data).Err()
}

func (q *RedisQueue) Subscribe(ctx context.Context, jobID string) *redis.PubSub {
	return q.client.Subscribe(ctx, "jobs:"+jobID+":status")
}
