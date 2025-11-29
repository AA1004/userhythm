import React, { useState, useMemo, useCallback } from 'react';
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

  const durationMs = useMemo(() => {
    if (!chartData.notes.length) return 60000;
    const lastNote = Math.max(...chartData.notes.map((n) => n.endTime || n.time));
    return Math.max(lastNote + 5000, 60000);
  }, [chartData.notes]);

  // YouTube 오디오 (있을 때만)
  const hasYoutube = !!chartData.youtubeVideoId;
  const { containerRef: audioContainerRef, isReady: isAudioReady } =
    useYoutubeAudio({
      videoId: chartData.youtubeVideoId ?? null,
      currentTimeMs,
      setCurrentTimeMs,
      isPlaying,
    });

  const handleAddSubtitle = useCallback(() => {
    const baseTrack =
      tracks.find((t) => t.id === selectedTrackId) ?? tracks[0] ?? DEFAULT_SUBTITLE_TRACKS[0];
    const start = currentTimeMs;
    const end = Math.min(currentTimeMs + 2000, durationMs);

    const next: SubtitleCue = {
      id: `sub-${Date.now()}`,
      chartId,
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
              : 'YouTube 정보가 없어 사운드 재생이 비활성화되었습니다'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => {
              if (!hasYoutube || !isAudioReady) return;
              setIsPlaying((prev) => !prev);
            }}
            disabled={!hasYoutube || !isAudioReady}
            style={{
              padding: '6px 10px',
              borderRadius: CHART_EDITOR_THEME.radiusSm,
              border: 'none',
              background: hasYoutube
                ? isPlaying
                  ? 'linear-gradient(135deg, #f97373, #fb7185)'
                  : 'linear-gradient(135deg, #22c55e, #4ade80)'
                : 'rgba(31,41,55,0.8)',
              color: hasYoutube ? '#022c22' : CHART_EDITOR_THEME.textSecondary,
              fontSize: 12,
              fontWeight: 600,
              cursor: !hasYoutube || !isAudioReady ? 'not-allowed' : 'pointer',
              opacity: !hasYoutube || !isAudioReady ? 0.6 : 1,
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
            <SubtitleInspector selectedCue={selectedCue} onChangeCue={handleChangeCue} />
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
          }}
        >
          <SubtitlePreviewCanvas
            width={720}
            height={405}
            currentTimeMs={currentTimeMs}
            cues={subtitles}
            selectedCueId={selectedSubtitleId}
            onChangeCueStyle={(id, nextStyle) => handleChangeCueStyle(id, nextStyle)}
          />

          <SubtitleTimeline
            tracks={tracks}
            subtitles={subtitles}
            durationMs={durationMs}
            currentTimeMs={currentTimeMs}
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

