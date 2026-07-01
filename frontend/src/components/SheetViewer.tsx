import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import PlaybackEngine from "osmd-audio-player";
import {
  PlaybackEvent,
  PlaybackState,
} from "osmd-audio-player/dist/PlaybackEngine";
import {
  Play,
  Pause,
  Square,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface Props {
  musicXmlUrl: string;
  jobId: string;
}

export default function SheetViewer({ musicXmlUrl, jobId }: Props) {
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
  const [defaultBpm, setDefaultBpm] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const bpmKey = `sheetflow:bpm:${jobId}`;

  // The OSMD page <svg> elements (excludes the cursor overlay).
  const getPageEls = (): HTMLElement[] => {
    const root = containerRef.current;
    if (!root) return [];
    const byId = Array.from(
      root.querySelectorAll<HTMLElement>('[id^="osmdSvgPage"]')
    );
    if (byId.length) return byId;
    return Array.from(root.querySelectorAll<HTMLElement>(":scope > svg"));
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Guards the async load/render against StrictMode's double-mount: the first
    // (orphaned) instance must not render after cleanup, or its pages stack on
    // top of the second instance's — doubling the page count and the PDF.
    let disposed = false;

    const osmd = new OpenSheetMusicDisplay(containerRef.current, {
      autoResize: true,
      backend: "svg",
      drawTitle: true,
      drawComposer: false,
      followCursor: true,
      pageFormat: "A4_P",
      pageBackgroundColor: "#FFFFFF",
      // A bold translucent highlight over the current notes — far clearer than
      // the default thin cursor line.
      cursorsOptions: [{ type: 0, color: "#22c55e", alpha: 0.45, follow: true }],
    });

    osmdRef.current = osmd;
    const player = new PlaybackEngine();
    playerRef.current = player;

    player.on(PlaybackEvent.STATE_CHANGE, (state: PlaybackState) => {
      setPlaybackState(state);
    });

    // Keep the moving cursor in view while playing (also updates the page
    // indicator via the scroll handler).
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
        if (disposed) return; // orphaned StrictMode instance — do not render
        // The sheet is renderable now — show it regardless of whether the
        // audio player can load it. Playback is a best-effort bonus.
        osmd.render();
        setLoaded(true);
        setPageCount(getPageEls().length || 1);
        setCurrentPage(1);
        // autoResize re-paginates shortly after the first render; refresh the
        // page count once that settles so the counter isn't stale.
        setTimeout(() => {
          if (!disposed) setPageCount(getPageEls().length || 1);
        }, 600);

        // Tempo the worker baked into the MusicXML (the estimated tempo of the
        // original mp3) is the default. A per-job saved value overrides it.
        const sheetBpm = osmd.Sheet?.DefaultStartTempoInBpm;
        const rounded = sheetBpm && sheetBpm > 0 ? Math.round(sheetBpm) : null;
        setDefaultBpm(rounded);

        const saved = Number(localStorage.getItem(bpmKey));
        const startBpm = saved && saved >= 40 ? saved : rounded ?? 120;
        setBpm(startBpm);

        return player
          .loadScore(osmd as any)
          .then(() => {
            player.setBpm(startBpm);
            setPlayable(true);
            // Show the cursor now (after full layout) so the "now playing"
            // highlight is correctly sized and visible from the first note.
            try {
              osmd.cursor?.reset();
              osmd.cursor?.show();
            } catch {
              // cursor optional
            }
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
      disposed = true;
      try {
        player.stop();
      } catch {
        // ignore
      }
      // Dispose OSMD's rendered DOM. Without this, StrictMode's double-mount
      // (and any re-run) leaves a second full set of page SVGs behind, which
      // doubles the page count and the exported PDF.
      try {
        osmd.clear();
      } catch {
        // ignore
      }
      osmdRef.current = null;
      playerRef.current = null;
    };
  }, [musicXmlUrl]);

  const play = () => playerRef.current?.play();
  const pause = () => playerRef.current?.pause();
  const stop = () => playerRef.current?.stop();

  const applyBpm = (value: number) => {
    const clamped = Math.max(40, Math.min(240, Math.round(value)));
    setBpm(clamped);
    playerRef.current?.setBpm(clamped);
    try {
      localStorage.setItem(bpmKey, String(clamped));
    } catch {
      // ignore storage failures (private mode, quota)
    }
  };

  const adjustBpm = (delta: number) => applyBpm(bpm + delta);

  const goToPage = (n: number) => {
    const vp = scrollRef.current;
    const pages = getPageEls();
    if (!vp || !pages.length) return;
    const clamped = Math.max(1, Math.min(pages.length, n));
    const el = pages[clamped - 1];
    const top =
      el.getBoundingClientRect().top - vp.getBoundingClientRect().top + vp.scrollTop;
    vp.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" });
    setCurrentPage(clamped);
  };

  // Export the rendered OSMD pages to a real PDF (one PDF page per sheet page,
  // sized exactly to each page's SVG so nothing clips or overflows).
  const downloadPdf = async () => {
    const pages = getPageEls();
    if (!pages.length) return;
    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      await import("svg2pdf.js");
      let pdf: any = null;
      for (let i = 0; i < pages.length; i++) {
        const svg = pages[i] as unknown as SVGSVGElement;
        const w =
          (svg as any).width?.baseVal?.value ||
          parseFloat(svg.getAttribute("width") || "0") ||
          svg.clientWidth;
        const h =
          (svg as any).height?.baseVal?.value ||
          parseFloat(svg.getAttribute("height") || "0") ||
          svg.clientHeight;
        const orientation = w > h ? "landscape" : "portrait";
        if (i === 0) {
          pdf = new jsPDF({
            orientation,
            unit: "px",
            format: [w, h],
            hotfixes: ["px_scaling"],
          });
        } else {
          pdf.addPage([w, h], orientation);
        }
        await pdf.svg(svg, { x: 0, y: 0, width: w, height: h });
      }
      pdf.save("sheet-music.pdf");
    } catch (e) {
      console.error("PDF export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  const handleScroll = () => {
    const vp = scrollRef.current;
    const pages = getPageEls();
    if (!vp || !pages.length) return;
    setPageCount(pages.length);
    const vpTop = vp.getBoundingClientRect().top;
    let cur = 1;
    pages.forEach((el, i) => {
      if (el.getBoundingClientRect().top - vpTop <= vp.clientHeight * 0.4) {
        cur = i + 1;
      }
    });
    setCurrentPage(cur);
  };

  const playing = playbackState === PlaybackState.PLAYING;

  return (
    <div className="space-y-4">
      {/* Controls — hidden when printing */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-dark-800 rounded-xl px-4 py-3">
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

        {/* BPM */}
        <div className="ml-2 flex items-center gap-2 text-sm text-gray-300">
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
          {defaultBpm != null && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              default {defaultBpm}
              {bpm !== defaultBpm && (
                <button
                  onClick={() => applyBpm(defaultBpm)}
                  title="Reset to original tempo"
                  className="p-1 rounded hover:bg-dark-600 text-gray-400"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          )}
        </div>

        {/* Pagination + print */}
        <div className="ml-auto flex items-center gap-2 text-sm text-gray-300">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-dark-600 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs w-16 text-center">
            {currentPage} / {pageCount}
          </span>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= pageCount}
            className="p-1 rounded hover:bg-dark-600 disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={downloadPdf}
            disabled={!loaded || exporting}
            title="Download as PDF"
            className="ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-600 hover:bg-dark-500 transition disabled:opacity-40"
          >
            <Printer className="w-4 h-4" />
            <span className="text-xs">{exporting ? "..." : "PDF"}</span>
          </button>
        </div>
      </div>

      {/* Paginated sheet music — one page per document page */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="sheet-print-area bg-dark-900 rounded-xl overflow-y-auto p-4"
        style={{ maxHeight: "78vh" }}
      >
        <div ref={containerRef} className="osmd-container" />
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
