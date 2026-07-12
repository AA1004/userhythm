#!/usr/bin/env python3
"""Generate Userhythm audio-analysis JSON from a local audio file."""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ANALYZER_VERSION = "0.2.0"

LANE_PATTERNS: dict[str, tuple[int, ...]] = {
    "sub": (0, 3),
    "low": (0, 3),
    "mid": (1, 2),
    "high": (2, 1),
    "wide": (0, 1, 2, 3),
    "unknown": (0, 1, 2, 3),
}


def _load_dependencies():
    try:
        import librosa  # type: ignore
        import numpy as np  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "Missing dependencies. Run: pip install -r tools/audio-analyzer/requirements.txt"
        ) from exc
    return librosa, np


def _normalize(values: Any):
    max_value = float(values.max()) if values.size else 0.0
    if max_value <= 0:
        return values
    return values / max_value


def _classify_band(low: float, mid: float, high: float) -> str:
    values = {"low": low, "mid": mid, "high": high}
    best = max(values, key=values.get)
    if values[best] <= 0:
        return "unknown"
    if max(values.values()) - min(values.values()) < 0.08:
        return "wide"
    return best


def _thin_onsets(candidates: list[dict[str, Any]], min_gap_ms: float) -> list[dict[str, Any]]:
    if min_gap_ms <= 0:
        return candidates

    result: list[dict[str, Any]] = []
    for onset in sorted(candidates, key=lambda item: item["timeMs"]):
        if not result:
            result.append(onset)
            continue

        previous = result[-1]
        if onset["timeMs"] - previous["timeMs"] >= min_gap_ms:
            result.append(onset)
            continue

        if onset.get("strength", 0) > previous.get("strength", 0):
            result[-1] = onset

    return result


def _snap_time(time_ms: float, first_beat_ms: float | None, bpm: float, subdivision: int) -> float:
    if subdivision <= 0 or first_beat_ms is None or bpm <= 0:
        return time_ms
    grid_ms = 60_000 / bpm / subdivision
    return first_beat_ms + round((time_ms - first_beat_ms) / grid_ms) * grid_ms


def _generate_note_candidates(
    onsets: list[dict[str, Any]],
    bpm: float,
    first_beat_ms: float | None,
    min_strength: float,
    min_gap_ms: float,
    snap_subdivision: int,
) -> list[dict[str, Any]]:
    """Convert onset analysis into reviewable four-lane tap-note candidates.

    This deliberately emits candidates, not an authoritative chart. A mixed song
    cannot reveal a player's intended pattern or long-note holds reliably.
    """
    filtered = [item for item in onsets if float(item.get("strength", 0)) >= min_strength]
    filtered.sort(key=lambda item: float(item["timeMs"]))

    # Keep only the strongest onset in a short burst before assigning lanes.
    thinned = _thin_onsets(filtered, min_gap_ms)
    cursors = {band: 0 for band in LANE_PATTERNS}
    last_lane: int | None = None
    occupied: set[tuple[int, int]] = set()
    candidates: list[dict[str, Any]] = []

    for onset in thinned:
        band = str(onset.get("band", "unknown"))
        if band not in LANE_PATTERNS:
            band = "unknown"
        lanes = LANE_PATTERNS[band]
        cursor = cursors[band] % len(lanes)
        lane = lanes[cursor]
        if lane == last_lane and len(lanes) > 1:
            lane = lanes[(cursor + 1) % len(lanes)]
        cursors[band] = (cursor + 1) % len(lanes)

        original_time = float(onset["timeMs"])
        time_ms = max(0.0, _snap_time(original_time, first_beat_ms, bpm, snap_subdivision))
        slot = (round(time_ms), lane)
        if slot in occupied:
            continue

        occupied.add(slot)
        last_lane = lane
        strength = float(onset.get("strength", 0))
        candidates.append(
            {
                "id": len(candidates) + 1,
                "timeMs": round(time_ms, 3),
                "originalTimeMs": round(original_time, 3),
                "lane": lane,
                "type": "tap",
                "durationMs": 0,
                "strength": round(strength, 4),
                "band": band,
                "source": "onset",
                "confidence": round(min(1.0, 0.25 + strength * 0.75), 4),
            }
        )

    return candidates


def _write_chart_output(
    output_path: Path,
    candidates: list[dict[str, Any]],
    bpm: float,
    duration_ms: float,
    source_file: str,
) -> None:
    notes = [
        {
            "id": index + 1,
            "lane": item["lane"],
            "time": item["timeMs"],
            "duration": 0,
            "endTime": item["timeMs"],
            "type": "tap",
            "y": 0,
            "hit": False,
        }
        for index, item in enumerate(candidates)
    ]
    payload = {
        "version": 1,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "chart": {
            "title": f"Auto notes: {source_file}",
            "author": "Userhythm Local Audio Analyzer",
            "bpm": round(bpm, 4),
            "beatsPerMeasure": 4,
            "timelineExtraMs": round(duration_ms, 3),
            "notes": notes,
        },
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def analyze_audio(
    input_path: Path,
    output_path: Path,
    bpm: float | None,
    offset_ms: float,
    sensitivity: float,
    min_gap_ms: float,
    mode: str,
    note_threshold: float,
    note_min_gap_ms: float,
    note_snap_subdivision: int,
    chart_output_path: Path | None,
) -> None:
    librosa, np = _load_dependencies()

    hop_length = 256 if mode == "detailed" else 512
    y, sr = librosa.load(str(input_path), sr=None, mono=True)
    duration_ms = len(y) / sr * 1000

    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    onset_env_norm = _normalize(onset_env)

    estimated_tempo, beat_frames = librosa.beat.beat_track(
        y=y,
        sr=sr,
        hop_length=hop_length,
        start_bpm=bpm if bpm else 120,
        tightness=100,
        trim=False,
    )
    if isinstance(estimated_tempo, np.ndarray):
        estimated_tempo = float(estimated_tempo[0]) if estimated_tempo.size else 0.0
    estimated_tempo = float(bpm if bpm else estimated_tempo)

    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length) * 1000 + offset_ms
    beats: list[dict[str, Any]] = []
    for index, time_ms in enumerate(beat_times):
        if time_ms < 0:
            continue
        frame = int(beat_frames[index])
        strength = float(onset_env_norm[frame]) if 0 <= frame < len(onset_env_norm) else 0.0
        beats.append(
            {
                "timeMs": round(float(time_ms), 3),
                "measure": int(index // 4 + 1),
                "beatInMeasure": int(index % 4 + 1),
                "strength": round(strength, 4),
                "confidence": round(min(1.0, 0.45 + strength * 0.55), 4),
            }
        )

    stft = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop_length))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    low_mask = (freqs >= 20) & (freqs < 250)
    mid_mask = (freqs >= 250) & (freqs < 2500)
    high_mask = freqs >= 2500

    low_energy = _normalize(stft[low_mask].mean(axis=0)) if low_mask.any() else np.zeros(stft.shape[1])
    mid_energy = _normalize(stft[mid_mask].mean(axis=0)) if mid_mask.any() else np.zeros(stft.shape[1])
    high_energy = _normalize(stft[high_mask].mean(axis=0)) if high_mask.any() else np.zeros(stft.shape[1])

    onset_threshold = max(0.05, min(0.95, 1.0 - sensitivity))
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_env,
        sr=sr,
        hop_length=hop_length,
        units="frames",
        backtrack=False,
        delta=onset_threshold,
    )

    onsets: list[dict[str, Any]] = []
    for frame in onset_frames:
        if frame < 0 or frame >= len(onset_env_norm):
            continue
        time_ms = float(librosa.frames_to_time(frame, sr=sr, hop_length=hop_length) * 1000 + offset_ms)
        if time_ms < 0:
            continue
        low = float(low_energy[min(frame, len(low_energy) - 1)])
        mid = float(mid_energy[min(frame, len(mid_energy) - 1)])
        high = float(high_energy[min(frame, len(high_energy) - 1)])
        strength = float(onset_env_norm[frame])
        band = _classify_band(low, mid, high)
        onsets.append(
            {
                "timeMs": round(time_ms, 3),
                "strength": round(strength, 4),
                "band": band,
                "type": "percussive" if strength >= 0.55 else "unknown",
                "confidence": round(min(1.0, 0.3 + strength * 0.7), 4),
            }
        )

    onsets = _thin_onsets(onsets, min_gap_ms)
    first_beat_ms = float(beats[0]["timeMs"]) if beats else None
    note_candidates = _generate_note_candidates(
        onsets=onsets,
        bpm=estimated_tempo,
        first_beat_ms=first_beat_ms,
        min_strength=note_threshold,
        min_gap_ms=note_min_gap_ms,
        snap_subdivision=note_snap_subdivision,
    )

    bands = []
    frame_step = 4 if mode == "fast" else 2
    frame_times = librosa.frames_to_time(np.arange(len(low_energy)), sr=sr, hop_length=hop_length) * 1000 + offset_ms
    for idx in range(0, len(frame_times), frame_step):
        start = float(frame_times[idx])
        if start < 0:
            continue
        end_idx = min(len(frame_times) - 1, idx + frame_step)
        bands.append(
            {
                "startMs": round(start, 3),
                "endMs": round(float(frame_times[end_idx]), 3),
                "low": round(float(low_energy[idx]), 4),
                "mid": round(float(mid_energy[idx]), 4),
                "high": round(float(high_energy[idx]), 4),
            }
        )

    section_ms = 8000
    sections = []
    section_count = max(1, math.ceil(duration_ms / section_ms))
    for section_index in range(section_count):
        start = section_index * section_ms
        end = min(duration_ms, start + section_ms)
        section_onsets = [item for item in onsets if start <= item["timeMs"] < end]
        density = len(section_onsets) / max(1, (end - start) / 1000)
        energy = sum(item.get("strength", 0) for item in section_onsets) / max(1, len(section_onsets))
        sections.append(
            {
                "startMs": round(start + offset_ms, 3),
                "endMs": round(end + offset_ms, 3),
                "label": "section",
                "energy": round(float(min(1, energy)), 4),
                "density": round(float(min(1, density / 8)), 4),
            }
        )

    payload = {
        "metadata": {
            "version": 1,
            "sourceFile": input_path.name,
            "durationMs": round(duration_ms, 3),
            "sampleRate": int(sr),
            "analyzer": "userhythm-local-analyzer",
            "analyzerVersion": ANALYZER_VERSION,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "mode": mode,
        },
        "timing": {
            "estimatedBpm": round(float(estimated_tempo), 4),
            "bpmConfidence": 0.75 if bpm else 0.62,
            "firstBeatMs": beats[0]["timeMs"] if beats else None,
            "offsetMs": round(offset_ms, 3),
            "beatsPerMeasure": 4,
        },
        "beats": beats,
        "onsets": onsets,
        "noteCandidates": note_candidates,
        "noteGeneration": {
            "strategy": "frequency-band-alternating",
            "noteThreshold": round(note_threshold, 4),
            "noteMinGapMs": round(note_min_gap_ms, 3),
            "snapSubdivision": note_snap_subdivision,
            "laneCount": 4,
        },
        "bands": bands,
        "sections": sections,
    }

    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    if chart_output_path is not None:
        _write_chart_output(
            output_path=chart_output_path,
            candidates=note_candidates,
            bpm=estimated_tempo,
            duration_ms=duration_ms,
            source_file=input_path.name,
        )
    print(f"Wrote {output_path}")
    if chart_output_path is not None:
        print(f"Wrote {chart_output_path}")
    print(f"beats={len(beats)} onsets={len(onsets)} noteCandidates={len(note_candidates)} durationMs={duration_ms:.0f}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create Userhythm local audio-analysis JSON.")
    parser.add_argument("input", type=Path, help="Audio file path, e.g. mp3/wav/flac.")
    parser.add_argument("--output", "-o", type=Path, default=None, help="Output JSON path.")
    parser.add_argument("--bpm", type=float, default=None, help="Manual BPM override.")
    parser.add_argument("--offset-ms", type=float, default=0.0, help="Shift analysis markers by milliseconds.")
    parser.add_argument("--sensitivity", type=float, default=0.65, help="0.05~0.95. Higher means more onsets.")
    parser.add_argument("--min-gap-ms", type=float, default=60.0, help="Minimum gap between onset markers.")
    parser.add_argument(
        "--note-threshold",
        type=float,
        default=0.45,
        help="Minimum normalized onset strength for automatic note candidates (0~1).",
    )
    parser.add_argument(
        "--note-min-gap-ms",
        type=float,
        default=100.0,
        help="Minimum gap between automatic note candidates.",
    )
    parser.add_argument(
        "--note-snap-subdivision",
        type=int,
        default=0,
        help="Snap candidates to beat subdivisions; 0 keeps original onset timing.",
    )
    parser.add_argument(
        "--chart-output",
        type=Path,
        default=None,
        help="Optional Userhythm chart JSON containing the automatic note candidates.",
    )
    parser.add_argument("--mode", choices=["fast", "balanced", "detailed"], default="balanced")
    args = parser.parse_args()

    input_path = args.input.expanduser().resolve()
    if not input_path.exists():
      raise SystemExit(f"Input file not found: {input_path}")

    output_path = args.output
    if output_path is None:
        output_path = input_path.with_name(f"{input_path.stem}.userhythm-analysis.json")
    output_path = output_path.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not 0 <= args.note_threshold <= 1:
        raise SystemExit("--note-threshold must be between 0 and 1")
    if args.note_min_gap_ms < 0:
        raise SystemExit("--note-min-gap-ms must be 0 or greater")
    if args.note_snap_subdivision < 0:
        raise SystemExit("--note-snap-subdivision must be 0 or greater")

    chart_output_path = args.chart_output.expanduser().resolve() if args.chart_output else None
    if chart_output_path is not None:
        chart_output_path.parent.mkdir(parents=True, exist_ok=True)

    analyze_audio(
        input_path=input_path,
        output_path=output_path,
        bpm=args.bpm,
        offset_ms=args.offset_ms,
        sensitivity=args.sensitivity,
        min_gap_ms=args.min_gap_ms,
        mode=args.mode,
        note_threshold=args.note_threshold,
        note_min_gap_ms=args.note_min_gap_ms,
        note_snap_subdivision=args.note_snap_subdivision,
        chart_output_path=chart_output_path,
    )


if __name__ == "__main__":
    main()

