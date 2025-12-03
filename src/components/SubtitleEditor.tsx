import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Note } from '../types/game';
import {
  SubtitleCue,
  SubtitleTrack,
  DEFAULT_SUBTITLE_STYLE,
  DEFAULT_SUBTITLE_TRACKS,
} from '../types/subtitle';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';
import { SubtitleTimeline } from './subtitle/SubtitleTimeline';
import { SubtitleInspector } from './subtitle/SubtitleInspector';
import { SubtitlePreviewCanvas } from './subtitle/SubtitlePreviewCanvas';
import { useYoutubeAudio } from '../hooks/useYoutubeAudio';
import { useChartAutosave } from '../hooks/useChartAutosave';
import { localSubtitleStorage, subtitleAPI } from '../lib/subtitleAPI';
import { isSupabaseConfigured } from '../lib/supabaseClient';

interface SubtitleEditorProps {
  chartId: string;
  chartData: {
    notes: Note[];
    bpm: number;
    youtubeVideoId?: string | null;
    youtubeUrl?: string;
    title?: string;
  };
  onClose: () => void;
}

export const SubtitleEditor: React.FC<SubtitleEditorProps> = ({
  chartId,
  chartData,
  onClose,
}) => {
  const [tracks, setTracks] = useState<SubtitleTrack[]>(DEFAULT_SUBTITLE_TRACKS);
  const [subtitles, setSubtitles] = useState<SubtitleCue[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [selectedTrackId, setSelectedTrackId] = useState<string>(
    () => DEFAULT_SUBTITLE_TRACKS[0]?.id ?? 'track-1'
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState<number>(4);
  const [noteValue, setNoteValue] = useState<number>(4);
  const [isPlayheadLocked, setIsPlayheadLocked] = useState<boolean>(false);
  const [gridOffsetMs, setGridOffsetMs] = useState<number>(0);
  const subtitlesLoadedRef = useRef(false);
  const hadLocalSubtitlesRef = useRef(false);
  const supabaseSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [activeChartId, setActiveChartId] = useState(chartId);
  const [chartIdInput, setChartIdInput] = useState(chartId);

  useEffect(() => {
    setActiveChartId(chartId);
    setChartIdInput(chartId);
  }, [chartId]);
  const subtitleAutosaveKey = useMemo(() => `subtitle-editor-${activeChartId}`, [activeChartId]);

  const durationMs = useMemo(() => {
    if (!chartData.notes.length) return 60000;
    const lastNote = Math.max(...chartData.notes.map((n) => n.endTime || n.time));
    return Math.max(lastNote + 5000, 60000);
  }, [chartData.notes]);

  // YouTube 오디오 (있을 때만)
  const hasYoutube = !!chartData.youtubeVideoId;
  const { containerRef: audioContainerRef } = useYoutubeAudio({
    videoId: chartData.youtubeVideoId ?? null,
    currentTimeMs,
    isPlaying,
  });

  const beatDurationMs = useMemo(() => {
    const bpm = chartData.bpm || 120;
    const denominatorFactor = 4 / Math.max(1, noteValue);
    return (60000 / Math.max(1, bpm)) * denominatorFactor;
  }, [chartData.bpm, noteValue]);

  const gridOffsetDisplay = useMemo(() => {
    if (!beatDurationMs) return '0';
    const beats = gridOffsetMs / beatDurationMs;
    if (Math.abs(beats) < 0.001) return '0';
    const formatted = beats
      .toFixed(2)
      .replace(/\.0+$/, '')
      .replace(/(\.\d*?)0+$/, '$1');
    return `${beats > 0 ? '+' : ''}${formatted}`;
  }, [gridOffsetMs, beatDurationMs]);

  const handleGridOffsetAdjust = useCallback(
    (direction: -1 | 1) => {
      setGridOffsetMs((prev) => prev + direction * beatDurationMs);
    },
    [beatDurationMs]
  );

  const handleApplyChartId = useCallback(() => {
    const nextId = chartIdInput.trim();
    if (!nextId) {
      alert('Chart ID를 입력하세요.');
      return;
    }
    setActiveChartId(nextId);
    try {
      localStorage.setItem('subtitle-session-id', nextId);
    } catch (error) {
      console.warn('Failed to persist subtitle session id:', error);
    }
    try {
      window.dispatchEvent(new CustomEvent('subtitle-chart-id-update', { detail: nextId }));
    } catch {
      // ignore
    }
  }, [chartIdInput]);

  // 로컬 저장소에서 기존 자막 복원 (게임 테스트용 임시 저장)
  useEffect(() => {
    hadLocalSubtitlesRef.current = false;
    const storedCues = localSubtitleStorage.get(chartId);
    if (storedCues.length > 0) {
      hadLocalSubtitlesRef.current = true;
      setSubtitles((prev) => (prev.length > 0 ? prev : storedCues));
    }
    subtitlesLoadedRef.current = true;
  }, [chartId]);

  useEffect(() => {
    if (!subtitlesLoadedRef.current) return;
    if (!activeChartId) return;
    localSubtitleStorage.save(activeChartId, subtitles);

    if (isSupabaseConfigured) {
      if (supabaseSaveTimeoutRef.current) {
        clearTimeout(supabaseSaveTimeoutRef.current);
      }

      supabaseSaveTimeoutRef.current = setTimeout(async () => {
        try {
          await subtitleAPI.upsertSubtitles(activeChartId, subtitles);
        } catch (error) {
          console.error('Failed to sync subtitles to Supabase:', error);
        }
      }, 800);
    }
  }, [activeChartId, subtitles]);

  useEffect(() => {
    return () => {
      if (supabaseSaveTimeoutRef.current) {
        clearTimeout(supabaseSaveTimeoutRef.current);
      }
    };
  }, []);

  const subtitleAutosaveData = useMemo(
    () => ({
      chartId: activeChartId,
      tracks,
      subtitles,
      beatsPerMeasure,
      noteValue,
      isPlayheadLocked,
      gridOffsetMs,
      selectedTrackId,
      currentTimeMs,
    }),
    [
      activeChartId,
      tracks,
      subtitles,
      beatsPerMeasure,
      noteValue,
      isPlayheadLocked,
      gridOffsetMs,
      selectedTrackId,
      currentTimeMs,
    ]
  );

  const handleSubtitleRestore = useCallback((data: any) => {
    if (data && typeof data === 'object') {
      if (typeof data.chartId === 'string') {
        setActiveChartId(data.chartId);
        setChartIdInput(data.chartId);
        try {
          localStorage.setItem('subtitle-session-id', data.chartId);
        } catch {
          // ignore
        }
        try {
          window.dispatchEvent(new CustomEvent('subtitle-chart-id-update', { detail: data.chartId }));
        } catch {
          // ignore
        }
      }
      if (Array.isArray(data.tracks) && data.tracks.length > 0) {
        setTracks(data.tracks);
      }
      if (Array.isArray(data.subtitles)) {
        setSubtitles(data.subtitles);
      }
      if (typeof data.beatsPerMeasure === 'number') {
        setBeatsPerMeasure(data.beatsPerMeasure);
      }
      if (typeof data.noteValue === 'number') {
        setNoteValue(data.noteValue);
      }
      if (typeof data.gridOffsetMs === 'number') {
        setGridOffsetMs(data.gridOffsetMs);
      }
      if (typeof data.isPlayheadLocked === 'boolean') {
        setIsPlayheadLocked(data.isPlayheadLocked);
      }
      if (typeof data.selectedTrackId === 'string') {
        setSelectedTrackId(data.selectedTrackId);
      }
      if (typeof data.currentTimeMs === 'number') {
        setCurrentTimeMs(Math.max(0, data.currentTimeMs));
      }
    }
  }, []);

  // 자동 저장 훅 (로컬)
  useChartAutosave(subtitleAutosaveKey, subtitleAutosaveData, handleSubtitleRestore);

  // Supabase 연동 (옵션)
  useEffect(() => {
    let isMounted = true;

    async function loadSupabaseSubtitles() {
      if (!isSupabaseConfigured) return;
      if (!chartId) return;
      if (hadLocalSubtitlesRef.current) return;

      try {
        const cues = await subtitleAPI.getSubtitlesByChartId(chartId);
        if (!isMounted) return;
        if (cues.length > 0) {
          setSubtitles(cues);
          localSubtitleStorage.save(chartId, cues);
        }
      } catch (error) {
        console.error('Failed to load subtitles from Supabase:', error);
      }
    }

    if (subtitles.length === 0) {
      loadSupabaseSubtitles();
    }

    return () => {
      isMounted = false;
    };
  }, [chartId, subtitles.length]);

  // --- 에디터 전용 타이머 (재생선 시간 소스) ---
  useEffect(() => {
    if (!isPlaying) return;

    let rafId: number;
    let lastTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const deltaMs = now - lastTime;
      lastTime = now;

      setCurrentTimeMs((prev) => {
        const next = prev + deltaMs;
        // durationMs를 직접 참조하지 않고 상태 업데이트 함수 내에서만 사용
        if (next >= durationMs) {
          // 끝에 도달하면 정지
          setIsPlaying(false);
          return durationMs;
        }
        return next;
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, durationMs, setIsPlaying]);

  const handleAddSubtitle = useCallback(() => {
    const baseTrack =
      tracks.find((t) => t.id === selectedTrackId) ?? tracks[0] ?? DEFAULT_SUBTITLE_TRACKS[0];
    const start = currentTimeMs;
    const end = Math.min(currentTimeMs + 2000, durationMs);

    const next: SubtitleCue = {
      id: `sub-${Date.now()}`,
      chartId: activeChartId,
      trackId: baseTrack.id,
      startTimeMs: start,
      endTimeMs: end,
      text: '새 자막',
      style: {
        ...DEFAULT_SUBTITLE_STYLE,
        ...(baseTrack.defaultStyle ?? {}),
        trackId: baseTrack.id,
      },
    };
    setSubtitles((prev) => [...prev, next]);
    setSelectedSubtitleId(next.id);
  }, [chartId, currentTimeMs, durationMs, tracks]);

  // 끝 시간에서 이어서 복사본 생성
  const handleDuplicateAtEnd = useCallback((baseCue: SubtitleCue) => {
    const duration = baseCue.endTimeMs - baseCue.startTimeMs;
    const newStart = baseCue.endTimeMs;
    const newEnd = Math.min(newStart + duration, durationMs);

    const newCue: SubtitleCue = {
      id: `sub-${Date.now()}`,
      chartId: activeChartId,
      trackId: baseCue.trackId,
      startTimeMs: newStart,
      endTimeMs: newEnd,
      text: baseCue.text, // 텍스트도 복사
      style: { ...baseCue.style }, // 스타일 전체 복사
    };

    setSubtitles((prev) => [...prev, newCue]);
    setSelectedSubtitleId(newCue.id);
    setCurrentTimeMs(newStart); // 재생선도 이동
  }, [activeChartId, durationMs]);

  // 자막 삭제
  const handleDeleteCue = useCallback((cueId: string) => {
    setSubtitles((prev) => prev.filter((cue) => cue.id !== cueId));
    setSelectedSubtitleId(null);
  }, []);

  const handleChangeSubtitleTime = useCallback(
    (id: string, startTimeMs: number, endTimeMs: number) => {
      setSubtitles((prev) =>
        prev.map((cue) =>
          cue.id === id ? { ...cue, startTimeMs, endTimeMs } : cue
        )
      );
    },
    []
  );

  const handleChangeCue = useCallback((next: SubtitleCue) => {
    setSubtitles((prev) => prev.map((c) => (c.id === next.id ? next : c)));
  }, []);

  const handleChangeCueStyle = useCallback(
    (id: string, nextStyle: any) => {
      setSubtitles((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                style: {
                  ...c.style,
                  ...nextStyle,
                },
              }
            : c
        )
      );
    },
    []
  );

  const selectedCue = useMemo(
    () => subtitles.find((c) => c.id === selectedSubtitleId) ?? null,
    [subtitles, selectedSubtitleId]
  );

  const handleAddTrack = useCallback(() => {
    const index = tracks.length + 1;
    const id = `track-${Date.now()}`;
    const newTrack: SubtitleTrack = {
      id,
      name: `트랙 ${index}`,
      positionPreset: 'bottom',
      defaultStyle: {
        position: { x: 0.5, y: 0.9 },
        align: { horizontal: 'center', vertical: 'bottom' },
        trackId: id,
      },
    };
    setTracks((prev) => [...prev, newTrack]);
    setSelectedTrackId(id);
  }, [tracks.length]);

  const handleRemoveTrack = useCallback(
    (id: string) => {
      if (tracks.length <= 1) {
        alert('최소 한 개의 트랙은 필요합니다.');
        return;
      }

      const hasCues = subtitles.some((cue) => {
        const trackId = cue.trackId ?? cue.style.trackId ?? 'default';
        return trackId === id;
      });

      if (hasCues) {
        alert('트랙에 자막이 남아 있어 삭제할 수 없습니다.');
        return;
      }

      const nextTracks = tracks.filter((t) => t.id !== id);
      setTracks(nextTracks);

      if (selectedTrackId === id && nextTracks.length > 0) {
        setSelectedTrackId(nextTracks[0].id);
      }
    },
    [tracks, subtitles, selectedTrackId]
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: `radial-gradient(circle at top left, ${CHART_EDITOR_THEME.accentSoft}, ${CHART_EDITOR_THEME.rootBackground})`,
        color: CHART_EDITOR_THEME.textPrimary,
        padding: '12px 16px',
        boxSizing: 'border-box',
        gap: 10,
        zIndex: 1000,
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderRadius: CHART_EDITOR_THEME.radiusLg,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
          background:
            'linear-gradient(90deg, rgba(15,23,42,0.98), rgba(17,24,39,0.98))',
          boxShadow: CHART_EDITOR_THEME.shadowSoft,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Subtitle Editor</div>
          <div
            style={{
              fontSize: 12,
              color: CHART_EDITOR_THEME.textSecondary,
            }}
          >
            {chartData.title || 'Untitled'} · BPM {chartData.bpm} · 자막{' '}
            {subtitles.length}개
          </div>
          <div
            style={{
              fontSize: 11,
              color: CHART_EDITOR_THEME.textMuted,
            }}
          >
            {hasYoutube
              ? `YouTube와 동기화됨 · 현재 시간 ${(currentTimeMs / 1000).toFixed(2)}s`
              : `무음 모드 (YouTube 없음) · 현재 시간 ${(currentTimeMs / 1000).toFixed(2)}s`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => {
              setIsPlaying((prev) => !prev);
            }}
            style={{
              padding: '6px 10px',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              border: 'none',
              background: isPlaying
                ? 'linear-gradient(135deg, #f97373, #fb7185)'
                : 'linear-gradient(135deg, #22c55e, #4ade80)',
              color: '#022c22',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isPlaying ? '일시정지' : '재생'}
          </button>
          <button
            onClick={handleAddSubtitle}
            style={{
              padding: '6px 12px',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              border: 'none',
              background:
                'linear-gradient(135deg, #22c55e, #4ade80)',
              color: '#022c22',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            자막 추가
          </button>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: 'rgba(15,23,42,0.75)',
              padding: '4px 8px',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: CHART_EDITOR_THEME.textSecondary }}>박자표</span>
              <input
                type="number"
                min={1}
                max={16}
                value={beatsPerMeasure}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (Number.isNaN(value)) return;
                  setBeatsPerMeasure(Math.min(16, Math.max(1, value)));
                }}
                style={{
                  width: 36,
                  padding: '2px 4px',
                  backgroundColor: 'rgba(2,6,23,0.9)',
                  color: CHART_EDITOR_THEME.textPrimary,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  textAlign: 'center',
                }}
              />
              <span style={{ color: CHART_EDITOR_THEME.textSecondary }}>/</span>
              <select
                value={noteValue}
                onChange={(e) => setNoteValue(parseInt(e.target.value, 10))}
                style={{
                  padding: '2px 4px',
                  backgroundColor: 'rgba(2,6,23,0.9)',
                  color: CHART_EDITOR_THEME.textPrimary,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                }}
              >
                {[1, 2, 4, 8, 16].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: 'rgba(2,6,23,0.85)',
                padding: '4px 6px',
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              }}
            >
              <button
                onClick={() => handleGridOffsetAdjust(-1)}
                style={{
                  padding: '4px 6px',
                  border: 'none',
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  backgroundColor: 'rgba(148,163,184,0.2)',
                  color: CHART_EDITOR_THEME.textPrimary,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                당기기
              </button>
              <span
                style={{
                  minWidth: 48,
                  textAlign: 'center',
                  fontSize: 12,
                  color: CHART_EDITOR_THEME.textPrimary,
                }}
              >
                {gridOffsetDisplay}칸
              </span>
              <button
                onClick={() => handleGridOffsetAdjust(1)}
                style={{
                  padding: '4px 6px',
                  border: 'none',
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  backgroundColor: 'rgba(34,211,238,0.2)',
                  color: CHART_EDITOR_THEME.accentStrong,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                밀기
              </button>
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                color: CHART_EDITOR_THEME.textSecondary,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={isPlayheadLocked}
                onChange={(e) => setIsPlayheadLocked(e.target.checked)}
              />
              재생선 고정
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: 'rgba(2,6,23,0.75)',
                padding: '4px 6px',
                borderRadius: CHART_EDITOR_THEME.radiusSm,
                border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              }}
            >
              <input
                value={chartIdInput}
                onChange={(e) => setChartIdInput(e.target.value)}
                placeholder="Chart ID"
                style={{
                  width: 180,
                  padding: '4px 6px',
                  backgroundColor: 'rgba(2,6,23,0.9)',
                  color: CHART_EDITOR_THEME.textPrimary,
                  border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  fontSize: 11,
                }}
              />
              <button
                onClick={handleApplyChartId}
                style={{
                  padding: '4px 8px',
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: 'none',
                  backgroundColor: 'rgba(34,211,238,0.18)',
                  color: CHART_EDITOR_THEME.accentStrong,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ID 적용
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '6px 12px',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              backgroundColor: 'rgba(15,23,42,0.9)',
              color: CHART_EDITOR_THEME.textPrimary,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            닫기
          </button>
        </div>
      </div>

      {/* 본문: 좌측 인스펙터 + 우측 프리뷰/타임라인 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: 10,
          minHeight: 0,
        }}
      >
        {/* 좌측: 트랙 리스트 + 속성 패널 */}
        <div
          style={{
            width: 320,
            borderRadius: CHART_EDITOR_THEME.radiusLg,
            backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            boxShadow: CHART_EDITOR_THEME.shadowSoft,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* 트랙 관리 */}
          <div
            style={{
              padding: '10px 12px',
              borderBottom: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              backgroundColor: '#020617',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: CHART_EDITOR_THEME.textSecondary,
                  letterSpacing: '0.06em',
                }}
              >
                트랙
              </span>
              <button
                onClick={handleAddTrack}
                style={{
                  padding: '2px 8px',
                  borderRadius: CHART_EDITOR_THEME.radiusSm,
                  border: 'none',
                  backgroundColor: 'rgba(34,197,94,0.18)',
                  color: '#4ade80',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                + 추가
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {tracks.map((track) => {
                const isActive = track.id === selectedTrackId;
  return (
                  <div
                    key={track.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <button
                      onClick={() => setSelectedTrackId(track.id)}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        borderRadius: CHART_EDITOR_THEME.radiusSm,
                        border: isActive
                          ? `1px solid ${CHART_EDITOR_THEME.accentStrong}`
                          : `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
                        backgroundColor: isActive
                          ? 'rgba(56,189,248,0.16)'
                          : 'rgba(15,23,42,0.9)',
                        color: CHART_EDITOR_THEME.textPrimary,
                        fontSize: 12,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      {track.name}
                    </button>
                    <button
                      onClick={() => handleRemoveTrack(track.id)}
                      title="트랙 삭제"
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '9999px',
                        border: 'none',
                        backgroundColor: 'rgba(239,68,68,0.15)',
                        color: '#fca5a5',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      ×
                    </button>
        </div>
                );
              })}
        </div>
      </div>

          <div
            style={{
              flex: 1,
              overflow: 'auto',
            }}
          >
            <SubtitleInspector
              selectedCue={selectedCue}
              allCues={subtitles}
              onChangeCue={handleChangeCue}
              onDuplicateAtEnd={handleDuplicateAtEnd}
              onDeleteCue={handleDeleteCue}
              bpm={chartData.bpm || 120}
              beatsPerMeasure={beatsPerMeasure}
              gridOffsetMs={gridOffsetMs}
            />
          </div>
        </div>

        {/* 우측: 프리뷰 + 타임라인 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            minWidth: 0,
            minHeight: 0,
          }}
        >
          {/* 프리뷰 영역: 가능한 한 크게 */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 0,
            }}
          >
            <SubtitlePreviewCanvas
              currentTimeMs={currentTimeMs}
              cues={subtitles}
              selectedCueId={selectedSubtitleId}
              onChangeCueStyle={(id, nextStyle) => handleChangeCueStyle(id, nextStyle)}
            />
            </div>

          {/* 타임라인: 맨 아래 고정 */}
          <div
            style={{
              flex: '0 0 auto',
            }}
          >
            <SubtitleTimeline
              tracks={tracks}
              subtitles={subtitles}
              durationMs={durationMs}
              currentTimeMs={currentTimeMs}
              bpm={chartData.bpm || 120}
              beatsPerMeasure={beatsPerMeasure}
              beatNoteValue={noteValue}
              lockPlayhead={isPlayheadLocked}
              timeSignatureOffset={gridOffsetMs}
              onChangeCurrentTime={setCurrentTimeMs}
              onSelectSubtitle={(id) => {
                setSelectedSubtitleId(id);
                if (id) {
                  const cue = subtitles.find((c) => c.id === id);
                  if (cue) {
                    const trackId =
                      cue.trackId ?? cue.style.trackId ?? tracks[0]?.id ?? 'track-1';
                    setSelectedTrackId(trackId);
                  }
                }
              }}
              onChangeSubtitleTime={handleChangeSubtitleTime}
            />
        </div>
        </div>

        {/* 숨겨진 YouTube 오디오 플레이어 (자막 편집용) */}
        {hasYoutube && (
          <div
            ref={audioContainerRef}
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              opacity: 0,
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
          />
        )}
      </div>
    </div>
  );
};

