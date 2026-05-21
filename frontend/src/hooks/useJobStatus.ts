import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJob } from "../api/client";

interface StatusUpdate {
  job_id: string;
  status: string;
  result_key?: string;
  error?: string;
}

export function useJobStatus(jobId: string) {
  const [wsStatus, setWsStatus] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const { data: job, error: queryError } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJob(jobId),
    refetchInterval: isConnected ? false : 3000,
  });

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/jobs/${jobId}/ws`);

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => {
      setIsConnected(false);
      // Reconnect after 3s unless completed/failed
      setTimeout(() => {
        if (
          wsRef.current === ws &&
          wsStatus !== "completed" &&
          wsStatus !== "failed"
        ) {
          connect();
        }
      }, 3000);
    };
    ws.onmessage = (event) => {
      try {
        const update: StatusUpdate = JSON.parse(event.data);
        setWsStatus(update.status);
      } catch {
        // ignore malformed messages
      }
    };
    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [jobId, wsStatus]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const status = wsStatus || job?.status || "pending";

  return {
    status,
    job,
    error: queryError,
    isConnected,
  };
}
