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
  const [tracks] = useState<SubtitleTrack[]>(DEFAULT_SUBTITLE_TRACKS);
  const [subtitles, setSubtitles] = useState<SubtitleCue[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);

  const durationMs = useMemo(() => {
    if (!chartData.notes.length) return 60000;
    const lastNote = Math.max(...chartData.notes.map((n) => n.endTime || n.time));
    return Math.max(lastNote + 5000, 60000);
  }, [chartData.notes]);

  const handleAddSubtitle = useCallback(() => {
    const baseTrack = tracks[0] ?? DEFAULT_SUBTITLE_TRACKS[0];
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
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Subtitle Editor</div>
          <div
            style={{
              fontSize: 12,
              color: CHART_EDITOR_THEME.textSecondary,
              marginTop: 2,
            }}
          >
            {chartData.title || 'Untitled'} · BPM {chartData.bpm} · 자막{' '}
            {subtitles.length}개
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
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
        {/* 좌측: 속성 패널 */}
        <div
          style={{
            width: 320,
            borderRadius: CHART_EDITOR_THEME.radiusLg,
            backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
            border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
            boxShadow: CHART_EDITOR_THEME.shadowSoft,
            overflow: 'auto',
          }}
        >
          <SubtitleInspector selectedCue={selectedCue} onChangeCue={handleChangeCue} />
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
            onSelectSubtitle={setSelectedSubtitleId}
            onChangeSubtitleTime={handleChangeSubtitleTime}
          />
        </div>
      </div>
    </div>
  );
};

