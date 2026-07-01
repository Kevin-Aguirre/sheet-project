package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"

	"github.com/sheetflow/api/internal/config"
	"github.com/sheetflow/api/internal/db"
	"github.com/sheetflow/api/internal/handler"
	"github.com/sheetflow/api/internal/middleware"
	"github.com/sheetflow/api/internal/queue"
	"github.com/sheetflow/api/internal/statusync"
	"github.com/sheetflow/api/internal/storage"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	cfg := config.Load()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// PostgreSQL (retry up to 30s for DNS/connection readiness)
	var pool *pgxpool.Pool
	var err error
	for attempt := 1; attempt <= 10; attempt++ {
		pool, err = pgxpool.New(ctx, cfg.DatabaseURL)
		if err != nil {
			slog.Warn("waiting for database", "attempt", attempt, "error", err)
			time.Sleep(3 * time.Second)
			continue
		}
		if err = pool.Ping(ctx); err != nil {
			pool.Close()
			slog.Warn("waiting for database", "attempt", attempt, "error", err)
			time.Sleep(3 * time.Second)
			continue
		}
		break
	}
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	store := db.NewStore(pool)
	if err := store.Migrate(ctx); err != nil {
		slog.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}

	// Redis
	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		slog.Error("invalid redis URL", "error", err)
		os.Exit(1)
	}
	rdb := redis.NewClient(redisOpts)
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		slog.Error("failed to connect to redis", "error", err)
		os.Exit(1)
	}

	// S3
	s3Client, err := storage.NewS3Client(cfg)
	if err != nil {
		slog.Error("failed to create S3 client", "error", err)
		os.Exit(1)
	}

	// Handlers
	q := queue.NewRedisQueue(rdb)
	uploadHandler := handler.NewUploadHandler(store, s3Client, q, cfg.MaxUploadSize)
	jobHandler := handler.NewJobHandler(store, s3Client, rdb)
	wsHandler := handler.NewWSHandler(q)
	healthHandler := handler.NewHealthHandler(pool, rdb)

	// Router
	r := chi.NewRouter()
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.AllowedOrigins},
		AllowedMethods:   []string{"GET", "POST", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           300,
	}))
	r.Use(middleware.LoggingMiddleware)
	r.Use(middleware.PrometheusMiddleware)

	r.Get("/healthz", healthHandler.Liveness)
	r.Get("/readyz", healthHandler.Readiness)
	r.Handle("/metrics", promhttp.Handler())

	r.Route("/api", func(r chi.Router) {
		r.Post("/upload", uploadHandler.Upload)
		r.Get("/jobs", jobHandler.ListJobs)
		r.Delete("/jobs", jobHandler.DeleteAllJobs)
		r.Get("/jobs/{id}", jobHandler.GetJob)
		r.Delete("/jobs/{id}", jobHandler.DeleteJob)
		r.Get("/jobs/{id}/sheet", jobHandler.GetSheet)
		r.Get("/jobs/{id}/original", jobHandler.GetOriginal)
		r.Get("/jobs/{id}/ws", wsHandler.HandleWS)
	})

	// Server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.ServerPort),
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Sync worker status updates from Redis to PostgreSQL
	go statusync.Run(ctx, rdb, store)

	go func() {
		slog.Info("server starting", "port", cfg.ServerPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	// Graceful shutdown
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	slog.Info("shutting down")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "error", err)
	}
}
