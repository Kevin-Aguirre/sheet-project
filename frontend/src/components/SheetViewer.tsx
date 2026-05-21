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
        osmd.render();
        return player.loadScore(osmd as any);
      })
      .then(() => {
        // Use tempo from MusicXML if available, otherwise default
        const scoreBpm = player.playbackSettings?.bpm;
        if (scoreBpm && scoreBpm > 0) {
          setBpm(Math.round(scoreBpm));
        } else {
          player.setBpm(bpm);
        }
        setLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load MusicXML:", err);
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

  const adjustBpm = (delta: number) => {
    const newBpm = Math.max(40, Math.min(240, bpm + delta));
    setBpm(newBpm);
    playerRef.current?.setBpm(newBpm);
  };

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
            disabled={!loaded}
            className="p-2 rounded-lg bg-accent hover:bg-accent-dark transition disabled:opacity-40"
          >
            <Play className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={stop}
          disabled={!loaded}
          className="p-2 rounded-lg bg-dark-600 hover:bg-dark-500 transition disabled:opacity-40"
        >
          <Square className="w-5 h-5" />
        </button>

        <div className="ml-4 flex items-center gap-2 text-sm text-gray-300">
          <button
            onClick={() => adjustBpm(-10)}
            className="p-1 rounded hover:bg-dark-600"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="w-20 text-center font-mono">{bpm} BPM</span>
          <button
            onClick={() => adjustBpm(10)}
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
      {!loaded && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          Loading sheet music...
        </div>
      )}
    </div>
  );
}
