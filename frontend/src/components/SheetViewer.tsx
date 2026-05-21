import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay, Cursor } from "opensheetmusicdisplay";
import { Play, Pause, Square, Minus, Plus } from "lucide-react";

interface Props {
  musicXmlUrl: string;
}

export default function SheetViewer({ musicXmlUrl }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const cursorRef = useRef<Cursor | null>(null);
  const timerRef = useRef<number | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [tempo, setTempo] = useState(1.0);

  useEffect(() => {
    if (!containerRef.current) return;

    const osmd = new OpenSheetMusicDisplay(containerRef.current, {
      autoResize: true,
      backend: "svg",
      drawTitle: true,
      drawComposer: false,
    });

    osmdRef.current = osmd;

    osmd
      .load(musicXmlUrl)
      .then(() => {
        osmd.render();
        osmd.cursor.show();
        cursorRef.current = osmd.cursor;
        setLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load MusicXML:", err);
      });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      osmdRef.current = null;
      cursorRef.current = null;
    };
  }, [musicXmlUrl]);

  const play = () => {
    if (!cursorRef.current) return;
    setPlaying(true);

    const bpm = 120 * tempo;
    const intervalMs = (60 / bpm) * 1000;

    timerRef.current = window.setInterval(() => {
      const cursor = cursorRef.current;
      if (!cursor || cursor.Iterator.EndReached) {
        stop();
        return;
      }
      cursor.next();
    }, intervalMs);
  };

  const pause = () => {
    setPlaying(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stop = () => {
    pause();
    if (cursorRef.current) {
      cursorRef.current.reset();
    }
  };

  const adjustTempo = (delta: number) => {
    const newTempo = Math.max(0.25, Math.min(2.0, tempo + delta));
    setTempo(newTempo);
    if (playing) {
      pause();
      setTimeout(() => play(), 50);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 bg-dark-800 rounded-xl px-4 py-3">
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
            onClick={() => adjustTempo(-0.25)}
            className="p-1 rounded hover:bg-dark-600"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="w-16 text-center font-mono">
            {tempo.toFixed(2)}x
          </span>
          <button
            onClick={() => adjustTempo(0.25)}
            className="p-1 rounded hover:bg-dark-600"
          >
            <Plus className="w-4 h-4" />
          </button>
          <span className="text-gray-500 ml-1">tempo</span>
        </div>
      </div>

      {/* Sheet music */}
      <div
        ref={containerRef}
        className="osmd-container bg-white rounded-xl p-6 min-h-[400px]"
      />
      {!loaded && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          Loading sheet music...
        </div>
      )}
    </div>
  );
}
