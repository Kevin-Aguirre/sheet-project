import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import PlaybackEngine from "osmd-audio-player";
import {
  PlaybackEvent,
  PlaybackState,
} from "osmd-audio-player/dist/PlaybackEngine";
import { Play, Pause, Square, Minus, Plus } from "lucide-react";

interface Props {
  musicXmlUrl: string;
}

export default function SheetViewer({ musicXmlUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const playerRef = useRef<PlaybackEngine | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [playable, setPlayable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(
    PlaybackState.INIT
  );
  const [bpm, setBpm] = useState(120);

  useEffect(() => {
    if (!containerRef.current) return;

    const osmd = new OpenSheetMusicDisplay(containerRef.current, {
      autoResize: true,
      backend: "svg",
      drawTitle: true,
      drawComposer: false,
      followCursor: false,
    });

    osmdRef.current = osmd;
    const player = new PlaybackEngine();
    playerRef.current = player;

    player.on(PlaybackEvent.STATE_CHANGE, (state: PlaybackState) => {
      setPlaybackState(state);
    });

    // Scroll the sheet container (not the page) to follow the cursor
    player.on(PlaybackEvent.ITERATION, () => {
      const cursor = osmd.cursor;
      if (!cursor || !scrollRef.current) return;
      const cursorEl = cursor.cursorElement;
      if (!cursorEl) return;
      const containerTop = scrollRef.current.getBoundingClientRect().top;
      const cursorTop = cursorEl.getBoundingClientRect().top;
      const offset = cursorTop - containerTop + scrollRef.current.scrollTop;
      const target = offset - scrollRef.current.clientHeight / 3;
      scrollRef.current.scrollTo({ top: target, behavior: "smooth" });
    });

    osmd
      .load(musicXmlUrl)
      .then(() => {
        // The sheet is renderable now — show it regardless of whether the
        // audio player can load it. Playback is a best-effort bonus.
        osmd.render();
        setLoaded(true);

        // Tempo the worker baked into the MusicXML (the estimated tempo of the
        // original mp3). OSMD parses it here — show it even if playback fails.
        const sheetBpm = osmd.Sheet?.DefaultStartTempoInBpm;
        if (sheetBpm && sheetBpm > 0) setBpm(Math.round(sheetBpm));

        return player
          .loadScore(osmd as any)
          .then(() => {
            const initialBpm =
              sheetBpm && sheetBpm > 0
                ? Math.round(sheetBpm)
                : Math.round(player.playbackSettings?.bpm || bpm);
            setBpm(initialBpm);
            player.setBpm(initialBpm);
            setPlayable(true);
          })
          .catch((err) => {
            console.warn("Playback unavailable for this score:", err);
          });
      })
      .catch((err) => {
        console.error("Failed to load MusicXML:", err);
        setError("Could not render this sheet music.");
      });

    return () => {
      player.stop();
      osmdRef.current = null;
      playerRef.current = null;
    };
  }, [musicXmlUrl]);

  const play = () => {
    playerRef.current?.play();
  };

  const pause = () => {
    playerRef.current?.pause();
  };

  const stop = () => {
    playerRef.current?.stop();
  };

  const applyBpm = (value: number) => {
    const clamped = Math.max(40, Math.min(240, Math.round(value)));
    setBpm(clamped);
    playerRef.current?.setBpm(clamped);
  };

  const adjustBpm = (delta: number) => applyBpm(bpm + delta);

  const playing = playbackState === PlaybackState.PLAYING;

  return (
    <div className="space-y-4">
      {/* Controls — always visible */}
      <div className="sticky top-0 z-10 flex items-center gap-3 bg-dark-800 rounded-xl px-4 py-3">
        {playing ? (
          <button
            onClick={pause}
            className="p-2 rounded-lg bg-accent hover:bg-accent-dark transition"
          >
            <Pause className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={play}
            disabled={!playable}
            className="p-2 rounded-lg bg-accent hover:bg-accent-dark transition disabled:opacity-40"
          >
            <Play className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={stop}
          disabled={!playable}
          className="p-2 rounded-lg bg-dark-600 hover:bg-dark-500 transition disabled:opacity-40"
        >
          <Square className="w-5 h-5" />
        </button>

        <div className="ml-4 flex items-center gap-2 text-sm text-gray-300">
          <button
            onClick={() => adjustBpm(-1)}
            className="p-1 rounded hover:bg-dark-600"
          >
            <Minus className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1 font-mono">
            <input
              type="number"
              min={40}
              max={240}
              value={bpm}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                if (Number.isNaN(v)) return;
                setBpm(v);
                playerRef.current?.setBpm(v);
              }}
              onBlur={() => applyBpm(bpm)}
              className="w-14 text-center bg-dark-700 rounded py-0.5 [appearance:textfield] focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <span>BPM</span>
          </div>
          <button
            onClick={() => adjustBpm(1)}
            className="p-1 rounded hover:bg-dark-600"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable sheet music container */}
      <div
        ref={scrollRef}
        className="bg-white rounded-xl overflow-y-auto"
        style={{ maxHeight: "70vh" }}
      >
        <div ref={containerRef} className="osmd-container p-6" />
      </div>
      {!loaded && !error && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          Loading sheet music...
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center py-12 text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
