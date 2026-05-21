package handler

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"github.com/sheetflow/api/internal/queue"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSHandler struct {
	queue *queue.RedisQueue
}

func NewWSHandler(q *queue.RedisQueue) *WSHandler {
	return &WSHandler{queue: q}
}

func (h *WSHandler) HandleWS(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("websocket upgrade failed", "error", err)
		return
	}
	defer conn.Close()

	ctx := r.Context()
	sub := h.queue.Subscribe(ctx, jobID)
	defer sub.Close()

	ch := sub.Channel()
	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, []byte(msg.Payload)); err != nil {
				slog.Debug("websocket write failed", "error", err, "job_id", jobID)
				return
			}
		case <-ctx.Done():
			return
		}
	}
}
