package config

import (
	"os"
	"strconv"
)

type Config struct {
	ServerPort     string
	DatabaseURL    string
	RedisURL       string
	S3Endpoint     string
	S3Bucket       string
	S3Region       string
	S3AccessKey    string
	S3SecretKey    string
	S3UsePathStyle bool
	MaxUploadSize  int64
	AllowedOrigins string
}

func Load() *Config {
	return &Config{
		ServerPort:     getEnv("SERVER_PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://sheetflow:sheetflow@localhost:5432/sheetflow?sslmode=disable"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		S3Endpoint:     getEnv("S3_ENDPOINT", "http://localhost:9000"),
		S3Bucket:       getEnv("S3_BUCKET", "sheetflow"),
		S3Region:       getEnv("S3_REGION", "us-east-1"),
		S3AccessKey:    getEnv("S3_ACCESS_KEY", "minioadmin"),
		S3SecretKey:    getEnv("S3_SECRET_KEY", "minioadmin"),
		S3UsePathStyle: getEnvBool("S3_USE_PATH_STYLE", true),
		MaxUploadSize:  getEnvInt64("MAX_UPLOAD_SIZE", 50<<20),
		AllowedOrigins: getEnv("ALLOWED_ORIGINS", "http://localhost:3000"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return fallback
		}
		return b
	}
	return fallback
}

func getEnvInt64(key string, fallback int64) int64 {
	if v := os.Getenv(key); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			return fallback
		}
		return n
	}
	return fallback
}
