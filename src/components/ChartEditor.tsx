import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Note, BPMChange, TimeSignatureEvent, ChartTestPayload, SubtitleEditorChartData, Lane } from '../types/game';
import { ChartEditorHeader } from './ChartEditor/ChartEditorHeader';
import { ChartEditorSidebar } from './ChartEditor/ChartEditorSidebar';
import { ChartEditorTimeline } from './ChartEditor/ChartEditorTimeline';
import { ChartShareModal } from './ChartEditor/ChartShareModal';
import { useChartYoutubePlayer } from '../hooks/useChartYoutubePlayer';
import { useChartTimeline } from '../hooks/useChartTimeline';
import { useChartAutosave } from '../hooks/useChartAutosave';
import { TapBPMCalculator, isValidBPM } from '../utils/bpmAnalyzer';
import { calculateTotalBeatsWithChanges, formatSongLength } from '../utils/bpmUtils';
import { chartAPI, supabase } from '../lib/supabaseClient';
import {
  AUTO_SAVE_KEY,
  PIXELS_PER_SECOND,
  TIMELINE_TOP_PADDING,
  TIMELINE_BOTTOM_PADDING,
  MIN_TIMELINE_DURATION_MS,
  PLAYBACK_SPEED_OPTIONS,
  CHART_EDITOR_THEME,
} from './ChartEditor/constants';

const KEY_TO_LANE: Record<string, Lane> = {
  a: 0,
  s: 1,
  d: 2,
  f: 3,
};

const MIN_LONG_NOTE_DURATION = 50;

interface ChartEditorProps {
  onSave: (notes: Note[]) => void;
  onCancel: () => void;
  onTest?: (payload: ChartTestPayload) => void;
  onOpenSubtitleEditor?: (chartData: SubtitleEditorChartData) => void;
}

export const ChartEditor: React.FC<ChartEditorProps> = ({
  onSave,
  onCancel,
  onTest,
  onOpenSubtitleEditor,
}) => {
  // --- 기본 상태 ---
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1);
  const [volume, setVolume] = useState<number>(100);
  
  // --- BPM & Grid 상태 ---
  const [bpm, setBpm] = useState<number>(120);
  const [bpmChanges, setBpmChanges] = useState<BPMChange[]>([]);
  const [timeSignatures, setTimeSignatures] = useState<TimeSignatureEvent[]>([
    { id: 0, beatIndex: 0, beatsPerMeasure: 4 },
  ]);
  const [timeSignatureOffset, setTimeSignatureOffset] = useState<number>(0);
  const [gridDivision, setGridDivision] = useState<number>(1);
  
  // --- UI 상태 ---
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isBpmInputOpen, setIsBpmInputOpen] = useState<boolean>(false);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState<boolean>(true);
  const [isLongNoteMode, setIsLongNoteMode] = useState<boolean>(false);
  const [testStartInput, setTestStartInput] = useState<string>('0');
  
  // --- Refs & 기타 ---
  const noteIdRef = useRef(0);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const tapBpmCalculatorRef = useRef(new TapBPMCalculator());
  const [tapBpmResult, setTapBpmResult] = useState<{ bpm: number; confidence: number } | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const isDraggingPlayheadRef = useRef(false); // 훅으로 전달하기 위해 ref 사용
  const [pendingLongNote, setPendingLongNote] = useState<{ lane: Lane; startTime: number } | null>(null);

  // --- 공유 모달 상태 ---
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [shareTitle, setShareTitle] = useState<string>('');
  const [shareAuthor, setShareAuthor] = useState<string>('');
  const [shareDifficulty, setShareDifficulty] = useState<string>('Normal');
  const [shareDescription, setShareDescription] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [previewImageFile, setPreviewImageFile] = useState<File | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  // --- Hooks 호출 ---
  const {
    youtubeUrl,
    setYoutubeUrl,
    youtubeVideoId,
    videoDurationSeconds,
    isLoadingDuration,
    handleYouTubeUrlSubmit,
    handleYouTubeUrlPaste,
    seekTo,
    youtubePlayerRef,
  } = useChartYoutubePlayer({
    currentTime,
    setCurrentTime,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    volume,
    isDraggingPlayhead: isDraggingPlayheadRef.current,
  });

  // --- 계산된 값들 ---
  const beatDuration = useMemo(() => (60000 / bpm), [bpm]);
  
  const sortedBpmChanges = useMemo(() => {
    return [...bpmChanges].sort((a, b) => a.beatIndex - b.beatIndex);
  }, [bpmChanges]);

  const sortedTimeSignatures = useMemo(() => {
    return [...timeSignatures].sort((a, b) => a.beatIndex - b.beatIndex);
  }, [timeSignatures]);

  const timelineDurationMs = useMemo(() => {
    const lastNoteTime = notes.length > 0 
      ? Math.max(...notes.map(n => n.endTime || n.time)) 
      : 0;
    const videoDurationMs = (videoDurationSeconds || 0) * 1000;
    return Math.max(lastNoteTime + 5000, videoDurationMs, MIN_TIMELINE_DURATION_MS);
  }, [notes, videoDurationSeconds]);

  const timelineContentHeight = useMemo(() => {
    return TIMELINE_TOP_PADDING + TIMELINE_BOTTOM_PADDING + (timelineDurationMs / 1000) * PIXELS_PER_SECOND * zoom;
  }, [timelineDurationMs, zoom]);

  const {
    timeToY,
    yToTime,
    getNoteY,
    playheadY,
  } = useChartTimeline({
    zoom,
    currentTime,
    TIMELINE_BOTTOM_PADDING,
    PIXELS_PER_SECOND,
    timelineContentHeight,
  });

  const songInfo = useMemo(() => {
    const durationSeconds = timelineDurationMs / 1000;
    const totalBeats = calculateTotalBeatsWithChanges(
      durationSeconds,
      bpm,
      sortedBpmChanges
    );
    const beatsPerMeasure = timeSignatures[0]?.beatsPerMeasure || 4;
    
    return {
      durationFormatted: formatSongLength(durationSeconds, bpm, sortedBpmChanges, beatsPerMeasure),
      totalBeats,
      formattedLength: formatSongLength(durationSeconds, bpm, sortedBpmChanges, beatsPerMeasure),
      hasBpmChanges: sortedBpmChanges.length > 0,
      durationSeconds,
      baseBpm: bpm,
      bpmChanges: sortedBpmChanges
    };
  }, [timelineDurationMs, bpm, sortedBpmChanges, timeSignatures]);

  const clampTime = useCallback(
    (time: number) => Math.max(0, Math.min(time, timelineDurationMs)),
    [timelineDurationMs]
  );

  // --- 자동 저장 ---
  const autoSaveData = useMemo(() => ({
    notes,
    bpm,
    youtubeUrl,
    youtubeVideoId,
    timeSignatures,
    timeSignatureOffset,
    bpmChanges,
    chartTitle: shareTitle,
    chartAuthor: shareAuthor,
  }), [notes, bpm, youtubeUrl, youtubeVideoId, timeSignatures, timeSignatureOffset, bpmChanges, shareTitle, shareAuthor]);

  const handleRestore = useCallback((data: any) => {
    if (data.notes) {
      setNotes(data.notes);
      // ID Ref 복구
      const maxId = Math.max(0, ...data.notes.map((n: Note) => n.id));
      noteIdRef.current = maxId + 1;
    }
    if (data.bpm) setBpm(data.bpm);
    if (data.youtubeUrl) setYoutubeUrl(data.youtubeUrl);
    // videoId는 url submit시 자동 설정됨, 하지만 여기서도 설정 가능
    if (data.timeSignatures) setTimeSignatures(data.timeSignatures);
    if (data.timeSignatureOffset) setTimeSignatureOffset(data.timeSignatureOffset);
    if (data.bpmChanges) setBpmChanges(data.bpmChanges);
    if (data.chartTitle) setShareTitle(data.chartTitle);
    if (data.chartAuthor) setShareAuthor(data.chartAuthor);
    
    // URL이 있으면 로드 시도
    if (data.youtubeUrl) {
        // handleYouTubeUrlSubmit 호출은 훅 내부 함수라 여기서 직접 호출하기 애매함 (비동기라)
        // useEffect로 youtubeUrl 변경 시 자동 처리되거나, 사용자가 버튼 누르게 둠
    }
  }, [setYoutubeUrl]);

  useChartAutosave(AUTO_SAVE_KEY, autoSaveData, handleRestore);

  // --- 핸들러들 ---

  // 노트 추가/삭제
  const addNote = useCallback((lane: Lane, time: number, type: 'tap' | 'hold' = 'tap', duration: number = 0) => {
    const newNote: Note = {
      id: noteIdRef.current++,
      lane,
      time,
      type,
      duration,
      endTime: time + duration,
      y: 0, // 렌더링 시 계산
      hit: false,
    };
    setNotes((prev) => [...prev, newNote]);
  }, []);

  const deleteNote = useCallback((id: number) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // 타임라인 클릭 (재생선 이동)
  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineScrollRef.current) return;
    if (isDraggingPlayheadRef.current) return;

    const scrollRect = timelineScrollRef.current.getBoundingClientRect();
    const clickY = e.clientY - scrollRect.top + timelineScrollRef.current.scrollTop;
    const time = clampTime(yToTime(clickY));
    setIsPlaying(false);
    setCurrentTime(time);
    seekTo(time);
  }, [clampTime, yToTime, seekTo]);

  const handleLaneInput = useCallback((lane: Lane) => {
    const time = clampTime(currentTime);
    if (isLongNoteMode) {
      if (pendingLongNote && pendingLongNote.lane === lane) {
        const startTime = Math.min(pendingLongNote.startTime, time);
        const endTime = Math.max(pendingLongNote.startTime, time);
        const duration = endTime - startTime;
        if (duration > MIN_LONG_NOTE_DURATION) {
          addNote(lane, startTime, 'hold', duration);
        }
        setPendingLongNote(null);
      } else {
        setPendingLongNote({ lane, startTime: time });
      }
    } else {
      addNote(lane, time);
    }
  }, [addNote, clampTime, currentTime, isLongNoteMode, pendingLongNote, setPendingLongNote]);

  // 재생선 드래그
  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // 기본 드래그 동작 방지 (텍스트 선택 등)
    e.stopPropagation();
    isDraggingPlayheadRef.current = true;
    setIsPlaying(false); // 드래그 시 일시정지

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (timelineScrollRef.current) {
        const rect = timelineScrollRef.current.getBoundingClientRect();
        // 스크롤된 상태를 고려하여 Y 좌표 계산
        const relativeY = moveEvent.clientY - rect.top + timelineScrollRef.current.scrollTop;
        const newTime = clampTime(yToTime(relativeY));
        setCurrentTime(newTime);
        
        // YouTube seek (드래그 중에는 부하 줄이기 위해 throttle 고려 가능하나 여기선 직접 호출)
        // seekTo(newTime); // 너무 잦은 호출 방지 위해 mouseUp에서만 하거나, throttle 필요
      }
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      upEvent.preventDefault(); // 클릭 이벤트 전파 방지
      upEvent.stopPropagation();
      
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      
      // 최종 위치로 이동
      if (timelineScrollRef.current) {
        const rect = timelineScrollRef.current.getBoundingClientRect();
        const relativeY = upEvent.clientY - rect.top + timelineScrollRef.current.scrollTop;
        const newTime = clampTime(yToTime(relativeY));
        seekTo(newTime);
        // seekTo 후에도 재생이 시작되지 않도록 명시적으로 일시정지 상태 유지
        setIsPlaying(false);
      }

      // 클릭 이벤트가 발생하여 노트가 잘못 생성되는 것을 방지하기 위해
      // 플래그 해제를 다음 틱으로 지연
      setTimeout(() => {
        isDraggingPlayheadRef.current = false;
      }, 50);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [yToTime, seekTo]);

  // BPM Tap
  const handleTapBpm = useCallback(() => {
    const result = tapBpmCalculatorRef.current.tap();
    setTapCount(tapBpmCalculatorRef.current.getTapCount());
    if (result) {
      setTapBpmResult({ bpm: result.bpm, confidence: result.confidence ?? 0 });
      // 신뢰도가 높으면 자동 적용? 아니면 사용자 선택? 
      // 여기선 결과만 보여주고 사용자가 직접 입력하도록 유도 (또는 별도 적용 버튼)
      if (result.confidence && result.confidence > 0.8) {
        setBpm(Math.round(result.bpm));
      }
    }
  }, []);

  // BPM 변속 추가/수정/삭제
  const handleAddBpmChange = useCallback(() => {
    const bpmInput = prompt('새로운 BPM을 입력하세요:', Math.round(bpm).toString());
    if (bpmInput === null) return;
    const newBpm = parseFloat(bpmInput);
    if (isNaN(newBpm) || !isValidBPM(newBpm)) {
      alert('유효한 BPM을 입력해주세요. (30-300)');
      return;
    }
    
    const beatInput = prompt('시작 비트(Beat Index)를 입력하세요:', '0');
    if (beatInput === null) return;
    const beatIndex = parseFloat(beatInput);
    
    setBpmChanges(prev => [...prev, { id: Date.now(), beatIndex, bpm: newBpm }]);
  }, [bpm]);

  const handleAddBpmChangeAtCurrentPosition = useCallback(() => {
    // 현재 시간을 비트로 변환하는 로직 필요 (대략적으로)
    // 정확한 비트 매핑은 복잡하므로, 단순 계산 혹은 가장 가까운 그리드 스냅
    // 여기서는 단순 입력을 유도하거나, 현재 currentTime 기반으로 계산
    const currentBeat = (currentTime / 1000) * (bpm / 60);
    
    const bpmInput = prompt('새로운 BPM을 입력하세요:', Math.round(bpm).toString());
    if (bpmInput === null) return;
    const newBpm = parseFloat(bpmInput);
    if (isNaN(newBpm) || !isValidBPM(newBpm)) return;

    setBpmChanges(prev => [...prev, { id: Date.now(), beatIndex: Math.round(currentBeat), bpm: newBpm }]);
  }, [currentTime, bpm]);

  const handleEditBpmChange = useCallback((change: BPMChange) => {
    const newBpmStr = prompt('새 BPM:', change.bpm.toString());
    if (newBpmStr === null) return;
    const newBpm = parseFloat(newBpmStr);
    
    const newBeatStr = prompt('새 비트 인덱스:', change.beatIndex.toString());
    if (newBeatStr === null) return;
    const newBeat = parseFloat(newBeatStr);

    setBpmChanges(prev => prev.map(c => c.id === change.id ? { ...c, bpm: newBpm, beatIndex: newBeat } : c));
  }, []);

  const handleDeleteBpmChange = useCallback((id: number) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      setBpmChanges(prev => prev.filter(c => c.id !== id));
    }
  }, []);

  // 공유/업로드
  const handleShare = useCallback(async () => {
    if (!shareTitle || !shareAuthor) {
      alert('제목과 제작자를 입력해주세요.');
      return;
    }
    
    setIsUploading(true);
    setUploadStatus('업로드 중...');
    
    try {
      // 이미지 업로드
      let imageUrl = previewImageUrl;
      if (previewImageFile) {
        // chartAPI.uploadImage 구현 필요 (생략된 경우 대비)
        // 여기서는 기존 로직이 있다고 가정하고 호출
        // imageUrl = await chartAPI.uploadImage(previewImageFile);
      }

      await chartAPI.uploadChart({
        title: shareTitle,
        author: shareAuthor,
        bpm,
        difficulty: shareDifficulty,
        description: shareDescription,
        data_json: JSON.stringify(autoSaveData),
        youtube_url: youtubeUrl,
        preview_image: imageUrl || undefined,
      });
      
      setUploadStatus('업로드 완료! 관리자 승인 후 공개됩니다.');
      setTimeout(() => {
        setIsShareModalOpen(false);
        setUploadStatus('');
      }, 2000);
    } catch (e: any) {
      console.error(e);
      setUploadStatus(`실패: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  }, [shareTitle, shareAuthor, shareDifficulty, shareDescription, bpm, youtubeUrl, previewImageUrl, previewImageFile, autoSaveData]);

  // 자동 스크롤
  useEffect(() => {
    if (!isPlaying || !isAutoScrollEnabled || isDraggingPlayheadRef.current) return;
    if (!timelineScrollRef.current) return;

    const container = timelineScrollRef.current;
    const centerOffset = container.clientHeight / 2;
    const targetScrollTop = playheadY - centerOffset;
    
    // requestAnimationFrame으로 부드럽게 (간단히 직접 설정)
    container.scrollTop = targetScrollTop;
  }, [isPlaying, isAutoScrollEnabled, playheadY]);

  // 키보드 핸들러 (스페이스바 재생 등)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드나 버튼에 포커스가 있을 때는 스페이스바 동작 방지 (중복 실행 방지)
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLButtonElement
      ) {
        return;
      }
      
      const key = e.key.toLowerCase();
      if (KEY_TO_LANE[key as keyof typeof KEY_TO_LANE] !== undefined) {
        e.preventDefault();
        const lane = KEY_TO_LANE[key as keyof typeof KEY_TO_LANE];
        handleLaneInput(lane);
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleLaneInput]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: `radial-gradient(circle at top left, ${CHART_EDITOR_THEME.accentSoft}, ${CHART_EDITOR_THEME.rootBackground})`,
        color: CHART_EDITOR_THEME.textPrimary,
        padding: '12px 16px',
        boxSizing: 'border-box',
        gap: '10px',
      }}
    >
      {/* Header */}
      <ChartEditorHeader
        bpm={bpm}
        isMenuOpen={isMenuOpen}
        isPlaying={isPlaying}
        isAutoScrollEnabled={isAutoScrollEnabled}
        isBpmInputOpen={isBpmInputOpen}
        youtubeUrl={youtubeUrl}
        isLoadingYoutubeMeta={isLoadingDuration}
        tapCount={tapCount}
        tapConfidence={tapBpmResult?.confidence}
        bpmChanges={sortedBpmChanges}
        beatsPerMeasure={timeSignatures[0]?.beatsPerMeasure || 4}
        songInfo={songInfo}
        onToggleMenu={() => setIsMenuOpen(prev => !prev)}
        onRewind={() => seekTo(0)}
        onTogglePlayback={() => setIsPlaying(prev => !prev)}
        onStop={() => { setIsPlaying(false); seekTo(0); }}
        onToggleAutoScroll={() => setIsAutoScrollEnabled(prev => !prev)}
        onLoad={() => {
            // 로드 기능: 실제로는 파일 업로드나 목록에서 선택 등 구현 필요
            // 여기서는 간단히 localStorage 복원 트리거 (새로고침 등)
            if (confirm('저장된 데이터를 불러오시겠습니까? (현재 작업 내용은 덮어씌워집니다)')) {
                window.location.reload();
            }
        }}
        onSave={onSave ? () => onSave(notes) : () => {}} // 상위 props 호출
        onSubtitleClick={onOpenSubtitleEditor ? () => onOpenSubtitleEditor({
            chartId: `local-${Date.now()}`,
            notes,
            bpm,
            youtubeVideoId,
            youtubeUrl,
            title: shareTitle || 'Untitled'
        }) : undefined}
        onExit={onCancel}
        onYoutubeUrlChange={setYoutubeUrl}
        onYoutubeSubmit={handleYouTubeUrlSubmit}
        onYoutubePaste={handleYouTubeUrlPaste}
        onToggleBpmInput={() => setIsBpmInputOpen(prev => !prev)}
        onBpmInput={(val) => { setBpm(parseFloat(val)); setIsBpmInputOpen(false); }}
        onTapBpm={handleTapBpm}
        onAddBpmChange={handleAddBpmChange}
        onAddBpmChangeAtCurrent={handleAddBpmChangeAtCurrentPosition}
        onEditBpmChange={handleEditBpmChange}
        onDeleteBpmChange={handleDeleteBpmChange}
      />

      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
          borderRadius: CHART_EDITOR_THEME.radiusLg,
          background: CHART_EDITOR_THEME.surfaceElevated,
          border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
          boxShadow: CHART_EDITOR_THEME.shadowSoft,
        }}
      >
        {/* Sidebar */}
        <ChartEditorSidebar
          zoom={zoom}
          onZoomChange={setZoom}
          playbackSpeed={playbackSpeed}
          playbackSpeedOptions={PLAYBACK_SPEED_OPTIONS}
          onPlaybackSpeedChange={setPlaybackSpeed}
          volume={volume}
          onVolumeChange={setVolume}
          beatsPerMeasure={timeSignatures[0]?.beatsPerMeasure || 4}
          onTimeSignatureChange={(beats) => setTimeSignatures([{ id: 0, beatIndex: 0, beatsPerMeasure: beats }])}
          gridDivision={gridDivision}
          onGridDivisionChange={setGridDivision}
          timeSignatureOffset={timeSignatureOffset}
          onTimeSignatureOffsetChange={setTimeSignatureOffset}
          beatDuration={beatDuration}
          isLongNoteMode={isLongNoteMode}
          onToggleLongNoteMode={() => setIsLongNoteMode(prev => !prev)}
          testStartInput={testStartInput}
          onTestStartInputChange={setTestStartInput}
          onSetTestStartToCurrent={() => setTestStartInput(Math.floor(currentTime).toString())}
          onSetTestStartToZero={() => setTestStartInput('0')}
          onTestChart={() => {
            if (onTest) {
                onTest({
                    notes,
                    startTimeMs: parseInt(testStartInput) || 0,
                    youtubeVideoId,
                    youtubeUrl,
                    playbackSpeed,
                    audioOffsetMs: 0
                });
            }
          }}
          onShareClick={() => setIsShareModalOpen(true)}
        />

        {/* Main Timeline Canvas */}
        <div style={{ flex: 1, position: 'relative', backgroundColor: '#1f1f1f', overflow: 'hidden' }}>
            <ChartEditorTimeline
                notes={notes}
                sortedTimeSignatures={sortedTimeSignatures}
                beatDuration={beatDuration}
                timelineDurationMs={timelineDurationMs}
                gridDivision={gridDivision}
                timeSignatureOffset={timeSignatureOffset}
                playheadY={playheadY}
                isAutoScrollEnabled={isAutoScrollEnabled}
                timelineContentHeight={timelineContentHeight}
                timelineScrollRef={timelineScrollRef}
                timelineContentRef={timelineContentRef}
                zoom={zoom}
                onTimelineClick={handleTimelineClick}
                onPlayheadMouseDown={handlePlayheadMouseDown}
                onNoteClick={deleteNote}
                timeToY={timeToY}
                getNoteY={getNoteY}
            />
            
            {/* Hidden Youtube Player */}
            <div
                ref={youtubePlayerRef}
                style={{
                    position: 'absolute',
                    width: '1px', 
                    height: '1px', 
                    opacity: 0, 
                    pointerEvents: 'none', 
                    zIndex: -1 
                }}
            />
        </div>
      </div>

      {/* Share Modal */}
      <ChartShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title={shareTitle}
        onTitleChange={setShareTitle}
        author={shareAuthor}
        onAuthorChange={setShareAuthor}
        difficulty={shareDifficulty}
        onDifficultyChange={setShareDifficulty}
        description={shareDescription}
        onDescriptionChange={setShareDescription}
        previewImageFile={previewImageFile}
        previewImageUrl={previewImageUrl}
        onImageChange={(file) => {
            setPreviewImageFile(file);
            if (file) {
                const url = URL.createObjectURL(file);
                setPreviewImageUrl(url);
            }
        }}
        isUploading={isUploading}
        uploadStatus={uploadStatus}
        onUpload={handleShare}
        user={user}
        onLogin={async () => {
            // 간단한 로그인 처리 (실제로는 별도 Auth 흐름 필요)
            const email = prompt('Email:');
            const password = prompt('Password:');
            if (email && password) {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) alert(error.message);
                else setUser(data.user);
            }
        }}
      />
    </div>
  );
};
