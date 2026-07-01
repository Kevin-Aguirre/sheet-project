import logging
import tempfile
import time
from collections import defaultdict
from pathlib import Path

import pretty_midi
from .metrics import conversion_duration_seconds

logger = logging.getLogger(__name__)

PIANO_LOW = 21   # A0
PIANO_HIGH = 108  # C8
MIDDLE_C = 60

MAX_DUR_Q = 4.0   # cap pedal-sustained notes at one 4/4 bar
MIN_DUR_Q = 0.25  # 16th-note floor so quantization can't zero a note out

# Bounds within which the left/right-hand split point is allowed to roam.
SPLIT_LOW = 48    # C3
SPLIT_HIGH = 72   # C5
SPLIT_SMOOTH = 0.7  # inertia of the moving split point


def _snap(value, grid):
    """Snap a value to the nearest grid point."""
    return round(value / grid) * grid


def _assign_hands(notes):
    """Split notes between the two staves with an adaptive boundary.

    A fixed split at middle C overloads one hand for music that sits high or
    low. Instead we track a moving split point: within each chord we look for a
    clear pitch gap (melody on top, accompaniment below) and split there,
    otherwise we follow a smoothed boundary. This keeps the melody in the right
    hand and mid-register accompaniment in the left.
    """
    from collections import defaultdict

    groups = defaultdict(list)
    for n in notes:
        groups[round(n[0], 4)].append(n)

    treble, bass = [], []
    split = float(MIDDLE_C)

    for onset in sorted(groups):
        group = sorted(groups[onset], key=lambda x: x[2])
        pitches = [x[2] for x in group]

        local = split
        if len(pitches) >= 2:
            gap, idx = max(
                (pitches[i + 1] - pitches[i], i) for i in range(len(pitches) - 1)
            )
            if gap >= 5:  # a fourth or wider — a real hand separation
                local = (pitches[idx] + pitches[idx + 1]) / 2.0

        local = min(max(local, SPLIT_LOW), SPLIT_HIGH)
        for n in group:
            (treble if n[2] >= local else bass).append(n)

        split = SPLIT_SMOOTH * split + (1 - SPLIT_SMOOTH) * local

    return treble, bass


def convert_to_musicxml(midi_path: Path) -> Path:
    """Convert MIDI to MusicXML piano arrangement with proper chords."""
    logger.info("starting conversion", extra={"midi_path": str(midi_path)})
    start = time.time()

    try:
        from music21 import stream, note as m21note, chord as m21chord
        from music21 import instrument, tempo, meter, duration, analysis

        pm = pretty_midi.PrettyMIDI(str(midi_path))

        # Get tempo
        tempo_changes = pm.get_tempo_changes()
        bpm = float(tempo_changes[1][0]) if len(tempo_changes[1]) > 0 else 120.0
        logger.info("detected tempo", extra={"bpm": round(bpm, 1)})

        quarter_dur = 60.0 / bpm
        sixteenth = quarter_dur / 4.0  # seconds per 16th note
        max_dur_16 = round(MAX_DUR_Q * 4)  # pedal-note cap, in 16ths

        # Snap onsets/offsets to integer 16th-note units, then convert to quarter
        # lengths as k/4. Working in integers avoids float drift, so every value
        # is an exact clean note length (0.25, 0.5, ...) — no tuplet blow-ups and
        # no measures that overflow by a rounding error. Durations are capped so
        # pedal-sustained notes don't sprawl across bars, and floored to a 16th.
        notes = []  # (onset_q, dur_q, pitch, velocity)
        for pm_inst in pm.instruments:
            if pm_inst.is_drum:
                continue
            for n in pm_inst.notes:
                if n.pitch < PIANO_LOW or n.pitch > PIANO_HIGH:
                    continue
                onset_16 = round(n.start / sixteenth)
                dur_16 = round(n.end / sixteenth) - onset_16
                dur_16 = max(1, min(dur_16, max_dur_16))
                notes.append((onset_16 / 4.0, dur_16 / 4.0, n.pitch, n.velocity))

        # Split into hands with an adaptive, gap-aware boundary.
        treble_notes, bass_notes = _assign_hands(notes)
        logger.info("notes to convert", extra={
            "treble": len(treble_notes), "bass": len(bass_notes)
        })

        # Group simultaneous notes into chords
        treble_part = _build_part_with_chords(treble_notes)
        treble_part.insert(0, instrument.Piano())

        bass_part = _build_part_with_chords(bass_notes)
        bass_part.insert(0, instrument.Piano())

        # Build score
        piano_score = stream.Score()
        piano_score.insert(0, meter.TimeSignature('4/4'))

        # Tempo must live inside a part's first measure to survive MusicXML
        # export — a score-level MetronomeMark gets dropped, leaving the viewer
        # to fall back to a default 120 BPM. Put it on the top non-empty part.
        top_part = treble_part if treble_part.notes else bass_part
        top_part.insert(0, tempo.MetronomeMark(number=round(bpm)))

        # Detect key
        try:
            all_pitches = [n[2] for n in treble_notes[:200]] + [n[2] for n in bass_notes[:200]]
            if all_pitches:
                tmp = stream.Part()
                for i, p in enumerate(all_pitches):
                    tmp.insert(i * 0.25, m21note.Note(p))
                detected_key = analysis.discrete.KrumhanslSchmuckler().getSolution(tmp)
                if detected_key:
                    piano_score.insert(0, detected_key)
        except Exception:
            logger.debug("key detection failed, skipping")

        if treble_part.notes:
            piano_score.insert(0, treble_part)
        if bass_part.notes:
            piano_score.insert(0, bass_part)

        piano_score.makeMeasures(inPlace=True)
        # Split notes that cross a barline into tied notes; otherwise a note
        # spilling past the bar overflows the measure and OSMD won't render it.
        for part in piano_score.parts:
            part.makeTies(inPlace=True)

        output_path = Path(tempfile.mktemp(suffix=".musicxml"))
        piano_score.write("musicxml", fp=str(output_path))

        dur = time.time() - start
        conversion_duration_seconds.observe(dur)
        logger.info("conversion complete", extra={
            "output_path": str(output_path), "duration_s": round(dur, 2)
        })
        return output_path

    except Exception:
        logger.exception("conversion failed")
        raise


def _build_part_with_chords(notes):
    """Build a music21 Part, grouping simultaneous notes into Chords.

    Notes are laid out as a single non-overlapping voice: each chord's duration
    is trimmed so it never runs past the next onset in this hand. Without this,
    overlapping (pedal-sustained) notes overflow their measures, which OSMD
    cannot render — the sheet silently fails to load.
    """
    from music21 import stream, note as m21note, chord as m21chord, duration

    part = stream.Part()
    if not notes:
        return part

    # Group notes by onset time
    by_onset = defaultdict(list)
    for onset_q, dur_q, pitch, velocity in notes:
        by_onset[onset_q].append((dur_q, pitch, velocity))

    onsets = sorted(by_onset.keys())
    for i, onset_q in enumerate(onsets):
        group = by_onset[onset_q]
        max_dur = max(d for d, _, _ in group)

        # Trim to the gap before the next onset so voices never overlap.
        if i + 1 < len(onsets):
            dur_q = min(max_dur, onsets[i + 1] - onset_q)
        else:
            dur_q = max_dur
        if dur_q <= 0:
            continue

        pitches = [p for _, p, _ in group]
        max_vel = max(v for _, _, v in group)

        el = m21note.Note(pitches[0]) if len(pitches) == 1 else m21chord.Chord(pitches)
        el.duration = duration.Duration(dur_q)
        el.volume.velocity = max_vel
        part.insert(onset_q, el)

    return part
