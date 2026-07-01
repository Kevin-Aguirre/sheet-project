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
    // Always poll as a safety net (the WebSocket can miss the terminal event),
    // slower while the socket is live, and stop once the job is done.
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (s === "completed" || s === "failed") return false;
      return isConnected ? 10000 : 3000;
    },
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

  // The DB record is authoritative: once it reports a terminal state, trust it
  // over a possibly-stale WebSocket status (which can get stuck mid-pipeline if
  // the final "completed"/"failed" event was missed). Otherwise prefer the
  // low-latency WebSocket update.
  const jobStatus = job?.status;
  const status =
    jobStatus === "completed" || jobStatus === "failed"
      ? jobStatus
      : wsStatus || jobStatus || "pending";

  return {
    status,
    job,
    error: queryError,
    isConnected,
  };
}
