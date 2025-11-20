import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Note, Lane } from '../types/game';
import { extractYouTubeVideoId, waitForYouTubeAPI } from '../utils/youtube';
import { TapBPMCalculator, bpmToBeatDuration, isValidBPM } from '../utils/bpmAnalyzer';
import { getBPMFromMetadata } from '../utils/bpmMetadata';

interface ChartEditorProps {
  onSave: (notes: Note[]) => void;
  onCancel: () => void;
}

const LANE_POSITIONS = [100, 200, 300, 400];
const JUDGE_LINE_Y = 640;
const GAME_HEIGHT = 800;
const PIXELS_PER_SECOND = 200; // 타임라인 확대 비율

export const ChartEditor: React.FC<ChartEditorProps> = ({ onSave, onCancel }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackTime, setPlaybackTime] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const noteIdRef = useRef(0);
  const playbackIntervalRef = useRef<number | null>(null);
  
  // YouTube 관련 상태
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [youtubePlayer, setYoutubePlayer] = useState<any>(null);
  const youtubePlayerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerReadyRef = useRef(false);
  
  // BPM 관련 상태
  const [bpm, setBpm] = useState<number>(120);
  const [isBpmInputOpen, setIsBpmInputOpen] = useState<boolean>(false);
  const tapBpmCalculatorRef = useRef(new TapBPMCalculator());
  const [tapBpmResult, setTapBpmResult] = useState<{ bpm: number; confidence: number } | null>(null);
  
  // BPM 자동 분석 상태 (Spotify API만 사용)
  const [bpmAnalysisState, setBpmAnalysisState] = useState<{
    status: 'idle' | 'analyzing-metadata' | 'success' | 'failed';
    progress: number;
    message: string;
    result?: { bpm: number; confidence: number; method: string };
  }>({
    status: 'idle',
    progress: 0,
    message: '',
  });

  // 메뉴 열림/닫힘 상태
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

  // 노트 추가
  const addNote = useCallback((lane: Lane, time: number) => {
    setNotes((prev) => {
      // 같은 위치에 노트가 있는지 확인 (중복 방지)
      const hasNote = prev.some(
        (note) => note.lane === lane && Math.abs(note.time - time) < 50
      );
      if (hasNote) return prev;

      const newNote: Note = {
        id: noteIdRef.current++,
        lane,
        time,
        y: 0,
        hit: false,
      };
      return [...prev, newNote].sort((a, b) => a.time - b.time);
    });
  }, []);

  // 노트 삭제
  const deleteNote = useCallback((noteId: number) => {
    setNotes((prev) => prev.filter((note) => note.id !== noteId));
  }, []);

  // 레인 클릭 핸들러
  const handleLaneClick = useCallback(
    (lane: Lane) => {
      addNote(lane, currentTime);
    },
    [addNote, currentTime]
  );

  // 타임라인 클릭 핸들러
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const scrollTop = e.currentTarget.scrollTop;
      const clickY = e.clientY - rect.top + scrollTop;
      
      // 판정선까지의 픽셀 거리 계산
      const pixelsFromJudgeLine = clickY - JUDGE_LINE_Y;
      
      // 픽셀 거리를 시간으로 변환 (음수면 미래, 양수면 과거)
      const timeOffset = (pixelsFromJudgeLine / PIXELS_PER_SECOND / zoom) * 1000;
      const newTime = currentTime - timeOffset;
      
      const finalTime = Math.max(0, newTime);
      setCurrentTime(finalTime);
      setPlaybackTime(finalTime);
      
      // YouTube 플레이어가 있으면 시간 동기화
      if (youtubePlayer && youtubePlayerReadyRef.current) {
        try {
          youtubePlayer.seekTo(finalTime / 1000, true);
          if (isPlaying) {
            youtubePlayer.playVideo();
          }
        } catch (error) {
          console.error('YouTube 플레이어 시간 설정 실패:', error);
        }
      }
    },
    [zoom, currentTime, youtubePlayer, isPlaying]
  );

  // YouTube 플레이어 초기화
  useEffect(() => {
    if (!youtubeVideoId || !youtubePlayerRef.current) return;

    waitForYouTubeAPI().then(() => {
      if (!window.YT || !window.YT.Player) {
        console.error('YouTube IFrame API를 로드할 수 없습니다.');
        return;
      }

      const playerElement = youtubePlayerRef.current;
      if (!playerElement) return;
      
      // div 요소에 id 추가 (YouTube API가 필요로 함)
      if (!playerElement.id) {
        playerElement.id = `youtube-player-${youtubeVideoId}`;
      }
      
      new window.YT.Player(playerElement.id, {
        videoId: youtubeVideoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          enablejsapi: 1,
        } as any,
          events: {
            onReady: async (event: any) => {
              console.log('✅ YouTube 플레이어 준비 시작');
              youtubePlayerReadyRef.current = true;
              const player = event.target;
              setYoutubePlayer(player);
              
              // 플레이어가 완전히 준비되고 제목을 가져올 수 있을 때까지 대기
              const waitForTitleAndAnalyze = async () => {
                let attempts = 0;
                const maxAttempts = 50; // 5초 (100ms * 50)
                
                while (attempts < maxAttempts) {
                  try {
                    const videoData = player.getVideoData();
                    if (videoData && videoData.title && videoData.title.trim() !== '' && 
                        !videoData.title.includes('youtu.be') && 
                        !videoData.title.includes('youtube.com')) {
                      console.log('✅ YouTube 제목 확인 성공:', videoData.title);
                      // 제목을 확실히 가져올 수 있으면 BPM 분석 시작
                      if (youtubeUrl) {
                        console.log('📊 BPM 분석 시작 (플레이어 완전 준비)');
                        handleAutoBPMAnalysis(youtubeUrl);
                      }
                      return;
                    }
                  } catch (error) {
                    // 아직 준비되지 않았거나 에러
                  }
                  
                  attempts++;
                  if (attempts % 10 === 0) {
                    console.log(`⏳ 플레이어 준비 대기 중... (${attempts * 100}ms)`);
                  }
                  await new Promise(resolve => setTimeout(resolve, 100)); // 100ms 대기
                }
                
                // 타임아웃 시에도 시도
                console.warn('⚠️ 제목 가져오기 타임아웃, 그래도 BPM 분석 시도');
                if (youtubeUrl) {
                  handleAutoBPMAnalysis(youtubeUrl);
                }
              };
              
              // 약간의 추가 대기 후 제목 확인 시작
              setTimeout(waitForTitleAndAnalyze, 300);
            },
          onStateChange: (event: any) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false);
            } else if (event.data === window.YT.PlayerState.ENDED) {
              setIsPlaying(false);
              setPlaybackTime(0);
              setCurrentTime(0);
            }
          },
        },
      });
    });
  }, [youtubeVideoId]);

  // YouTube 재생 시간 동기화
  useEffect(() => {
    if (!youtubePlayer || !youtubePlayerReadyRef.current) return;

    const syncInterval = setInterval(() => {
      try {
        const currentTime = youtubePlayer.getCurrentTime() * 1000;
        setCurrentTime(currentTime);
        setPlaybackTime(currentTime);
      } catch (e) {
        console.error('YouTube 플레이어 시간 동기화 실패:', e);
      }
    }, 100);

    return () => clearInterval(syncInterval);
  }, [youtubePlayer]);

  // BPM 자동 분석 (하이브리드 접근법)
  const handleAutoBPMAnalysis = useCallback(async (url: string) => {
    setBpmAnalysisState({
      status: 'analyzing-metadata',
      progress: 0,
      message: '메타데이터에서 BPM 조회 중...',
    });

    try {
      // 1단계: 메타데이터에서 BPM 조회
      // YouTube URL인 경우 플레이어에서 제목 가져오기 시도
      let metadataTitle = '';
      
      if (url.includes('http://') || url.includes('https://') || 
          url.includes('youtu.be') || url.includes('youtube.com')) {
        // YouTube URL인 경우 플레이어가 준비될 때까지 대기
        console.log('📺 YouTube URL 감지, 플레이어 준비 대기 중...');
        
        let waitCount = 0;
        const maxWait = 50; // 5초 (100ms * 50)
        
        while (!youtubePlayerReadyRef.current || !youtubePlayer) {
          if (waitCount >= maxWait) {
            console.warn('⚠️ 플레이어 준비 시간 초과');
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms 대기
          waitCount++;
          if (waitCount % 10 === 0) {
            console.log(`⏳ 플레이어 준비 대기 중... (${waitCount * 100}ms)`);
          }
        }
        
        // 플레이어에서 제목 가져오기
        if (youtubePlayer && youtubePlayerReadyRef.current && youtubePlayer.getVideoData) {
          let titleAttempts = 0;
          const maxTitleAttempts = 20; // 2초 (100ms * 20)
          
          while (titleAttempts < maxTitleAttempts) {
            try {
              const videoData = youtubePlayer.getVideoData();
              if (videoData && videoData.title && 
                  videoData.title.trim() !== '' && 
                  !videoData.title.includes('youtu.be') && 
                  !videoData.title.includes('youtube.com')) {
                metadataTitle = videoData.title;
                console.log('✅ YouTube 제목 가져옴:', metadataTitle);
                break;
              }
            } catch (error) {
              // 계속 시도
            }
            
            titleAttempts++;
            if (titleAttempts < maxTitleAttempts) {
              await new Promise(resolve => setTimeout(resolve, 100)); // 100ms 대기
            }
          }
          
          if (!metadataTitle) {
            console.warn('⚠️ YouTube 제목을 가져올 수 없음');
          }
        } else {
          console.warn('⚠️ YouTube 플레이어가 준비되지 않음');
        }
      } else {
        // URL이 아닌 경우 제목으로 사용
        metadataTitle = url;
      }
      
      // 제목이 있으면 메타데이터 조회 시도
      if (metadataTitle && !metadataTitle.includes('http://') && !metadataTitle.includes('https://')) {
        const metadataResult = await getBPMFromMetadata(metadataTitle);
        
        if (metadataResult) {
          setBpmAnalysisState({
            status: 'success',
            progress: 100,
            message: `BPM 발견 (${metadataResult.source || '메타데이터'}): ${Math.round(metadataResult.bpm)} (신뢰도: ${(metadataResult.confidence * 100).toFixed(0)}%)`,
            result: {
              bpm: metadataResult.bpm,
              confidence: metadataResult.confidence,
              method: metadataResult.method,
            },
          });
          setBpm(Math.round(metadataResult.bpm));
          return;
        }
      } else {
        console.log('메타데이터 조회 건너뛰기 (URL 또는 플레이어 미준비)');
      }

      // 메타데이터 조회 실패 시 종료
      setBpmAnalysisState({
        status: 'failed',
        progress: 0,
        message: 'BPM을 찾을 수 없습니다. YouTube 제목이 정확한지 확인하거나, 수동으로 BPM을 입력하세요.',
      });
    } catch (error) {
      console.error('BPM 자동 분석 오류:', error);
      setBpmAnalysisState({
        status: 'failed',
        progress: 0,
        message: 'BPM 자동 분석에 실패했습니다. 수동으로 입력하거나 탭 BPM을 사용하세요.',
      });
    }
  }, []);
  

  // YouTube URL 처리
  const handleYouTubeUrlSubmit = useCallback(() => {
    if (!youtubeUrl.trim()) {
      alert('YouTube URL을 입력해주세요.');
      return;
    }

    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      alert('유효한 YouTube URL이 아닙니다.');
      return;
    }

    // 기존 플레이어 제거
    if (youtubePlayer) {
      try {
        youtubePlayer.destroy();
      } catch (e) {
        console.error('기존 플레이어 제거 실패:', e);
      }
    }

    setYoutubeVideoId(videoId);
    setYoutubePlayer(null);
    youtubePlayerReadyRef.current = false;
    
    // BPM 자동 분석 시작
    handleAutoBPMAnalysis(youtubeUrl);
  }, [youtubeUrl, youtubePlayer, handleAutoBPMAnalysis]);

  // 클립보드에서 YouTube URL 붙여넣기 및 자동 로드
  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        const trimmedText = text.trim();
        setYoutubeUrl(trimmedText);
        
        // 유효한 YouTube URL이면 자동으로 로드
        const videoId = extractYouTubeVideoId(trimmedText);
        if (videoId) {
          // 기존 플레이어 제거
          if (youtubePlayer) {
            try {
              youtubePlayer.destroy();
            } catch (e) {
              console.error('기존 플레이어 제거 실패:', e);
            }
          }

          setYoutubeVideoId(videoId);
          setYoutubePlayer(null);
          youtubePlayerReadyRef.current = false;
          
          // BPM 분석은 플레이어가 준비되면 onReady에서 자동으로 시작됨
        } else {
          // 유효하지 않은 URL인 경우 알림
          alert('유효한 YouTube URL이 아닙니다. URL을 확인해주세요.');
        }
      } else {
        alert('클립보드가 비어있습니다.');
      }
    } catch (error) {
      console.error('클립보드 읽기 실패:', error);
      alert('클립보드를 읽을 수 없습니다. 수동으로 붙여넣어주세요.');
    }
  }, [youtubePlayer, handleAutoBPMAnalysis]);

  // BPM 탭 계산
  const handleBpmTap = useCallback(() => {
    const result = tapBpmCalculatorRef.current.tap();
    if (result && result.confidence !== undefined) {
      setTapBpmResult({
        bpm: result.bpm,
        confidence: result.confidence,
      });
      if (result.confidence > 0.7) {
        setBpm(Math.round(result.bpm));
      }
    }
  }, []);

  // BPM 수동 입력
  const handleBpmInput = useCallback((value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && isValidBPM(numValue)) {
      setBpm(numValue);
      setIsBpmInputOpen(false);
    } else {
      alert('유효한 BPM을 입력해주세요. (30-300)');
    }
  }, []);

  // 재생/일시정지
  const togglePlayback = useCallback(() => {
    if (youtubePlayer && youtubePlayerReadyRef.current) {
      // YouTube 플레이어 사용
      try {
        if (isPlaying) {
          youtubePlayer.pauseVideo();
        } else {
          const currentTimeSeconds = currentTime / 1000;
          youtubePlayer.seekTo(currentTimeSeconds, true);
          youtubePlayer.playVideo();
        }
      } catch (e) {
        console.error('YouTube 플레이어 제어 실패:', e);
      }
    } else {
      // 기본 타이머 사용
      if (isPlaying) {
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
        setIsPlaying(false);
      } else {
        setIsPlaying(true);
        const startTime = playbackTime;
        const startTimestamp = Date.now();

        playbackIntervalRef.current = window.setInterval(() => {
          const elapsed = Date.now() - startTimestamp;
          const newTime = startTime + elapsed;
          setPlaybackTime(newTime);
          setCurrentTime(newTime);
        }, 16); // ~60fps
      }
    }
  }, [isPlaying, playbackTime, currentTime, youtubePlayer]);

  // 처음으로 돌아가기
  const handleRewind = useCallback(() => {
    if (youtubePlayer && youtubePlayerReadyRef.current) {
      try {
        youtubePlayer.seekTo(0, true);
        if (isPlaying) {
          youtubePlayer.pauseVideo();
        }
      } catch (e) {
        console.error('YouTube 플레이어 되돌리기 실패:', e);
      }
    }
    
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
    
    setPlaybackTime(0);
    setCurrentTime(0);
    setIsPlaying(false);
  }, [youtubePlayer, isPlaying]);

  // 재생 중지
  const stopPlayback = useCallback(() => {
    if (youtubePlayer && youtubePlayerReadyRef.current) {
      try {
        youtubePlayer.stopVideo();
        youtubePlayer.seekTo(0, true);
      } catch (e) {
        console.error('YouTube 플레이어 중지 실패:', e);
      }
    }
    
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
    setIsPlaying(false);
    setPlaybackTime(0);
    setCurrentTime(0);
  }, [youtubePlayer]);

  // 저장
  const handleSave = useCallback(() => {
    if (notes.length === 0) {
      alert('노트가 없습니다. 노트를 추가한 후 저장해주세요.');
      return;
    }
    
    // 채보 데이터 준비
    const chartData = {
      notes: notes.map(({ id, lane, time }) => ({ id, lane, time })),
      bpm: bpm,
      youtubeVideoId: youtubeVideoId,
      youtubeUrl: youtubeUrl,
      createdAt: new Date().toISOString(),
    };
    
    // localStorage에 저장
    const chartName = prompt('채보 이름을 입력하세요:', `Chart_${Date.now()}`);
    if (chartName) {
      const savedCharts = JSON.parse(localStorage.getItem('savedCharts') || '{}');
      savedCharts[chartName] = chartData;
      localStorage.setItem('savedCharts', JSON.stringify(savedCharts));
      
      alert(`채보 "${chartName}"이(가) 저장되었습니다!`);
      onSave(notes);
    }
  }, [notes, bpm, youtubeVideoId, youtubeUrl, onSave]);

  // 채보 로드
  const handleLoad = useCallback(() => {
    const savedCharts = JSON.parse(localStorage.getItem('savedCharts') || '{}');
    const chartNames = Object.keys(savedCharts);
    
    if (chartNames.length === 0) {
      alert('저장된 채보가 없습니다.');
      return;
    }
    
    const chartName = prompt(
      `로드할 채보를 선택하세요:\n${chartNames.join(', ')}`,
      chartNames[0]
    );
    
    if (chartName && savedCharts[chartName]) {
      const chartData = savedCharts[chartName];
      const loadedNotes: Note[] = chartData.notes.map((noteData: any) => ({
        ...noteData,
        y: 0,
        hit: false,
        id: noteIdRef.current++,
      }));
      
      setNotes(loadedNotes);
      
      // BPM 및 YouTube 정보 복원
      if (chartData.bpm) {
        setBpm(chartData.bpm);
      }
      if (chartData.youtubeVideoId) {
        setYoutubeVideoId(chartData.youtubeVideoId);
        if (chartData.youtubeUrl) {
          setYoutubeUrl(chartData.youtubeUrl);
        }
      }
      
      alert(`채보 "${chartName}"이(가) 로드되었습니다!`);
    }
  }, []);

  // 노트의 y 좌표 계산
  const getNoteY = useCallback(
    (note: Note) => {
      const timeOffset = note.time - currentTime;
      const pixelsOffset = (timeOffset / 1000) * PIXELS_PER_SECOND * zoom;
      return JUDGE_LINE_Y - pixelsOffset;
    },
    [currentTime, zoom]
  );

  // 현재 시간에 보이는 노트들만 필터링
  const visibleNotes = notes.filter((note) => {
    const y = getNoteY(note);
    return y > -100 && y < GAME_HEIGHT + 100;
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 2000,
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          backgroundColor: '#2a2a2a',
          borderBottom: '2px solid #444',
        }}
      >
        {/* 메뉴 토글 버튼 */}
        <div
          style={{
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: isMenuOpen ? '1px solid #444' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 
              style={{ 
                color: '#fff', 
                margin: 0, 
                fontSize: '20px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              채보 에디터
            </h2>
            <span 
              style={{ 
                color: '#aaa', 
                fontSize: '18px', 
                transition: 'transform 0.3s', 
                transform: isMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              ▼
            </span>
            {/* 플레이어 컨트롤 버튼들 */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: '20px' }} onClick={(e) => e.stopPropagation()}>
              <button
                onClick={handleRewind}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: '#607D8B',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#546E7A';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#607D8B';
                }}
                title="처음으로 돌아가기 (0초)"
              >
                ⏮ 처음으로
              </button>
              <button
                onClick={togglePlayback}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: isPlaying ? '#f44336' : '#4CAF50',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                {isPlaying ? '⏸ 일시정지' : '▶ 재생'}
              </button>
              <button
                onClick={stopPlayback}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: '#757575',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                ⏹ 중지
              </button>
              <button
                onClick={handleLoad}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: '#9C27B0',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                📂 로드
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: '#2196F3',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                💾 저장
              </button>
              <button
                onClick={onCancel}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: '#f44336',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                ✖ 나가기
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ color: '#FFD700', fontSize: '16px', fontWeight: 'bold' }}>
              BPM: {Math.round(bpm)}
            </span>
          </div>
        </div>

        {/* 접을 수 있는 메뉴 내용 */}
        {isMenuOpen && (
          <div
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '15px',
            }}
          >
            {/* YouTube URL 입력 */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="YouTube URL 입력..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleYouTubeUrlSubmit();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  padding: '8px 12px',
                  fontSize: '14px',
                  backgroundColor: '#1f1f1f',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  width: '300px',
                }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePasteFromClipboard();
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: '#757575',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#616161';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#757575';
                }}
                title="클립보드에서 붙여넣기"
              >
                📋 붙여넣기
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleYouTubeUrlSubmit();
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: '#FF0000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                ▶ 로드
              </button>
            </div>
            
            {/* BPM 설정 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: '#fff', fontSize: '14px' }}>BPM:</span>
                <span style={{ color: '#FFD700', fontSize: '16px', fontWeight: 'bold' }}>{Math.round(bpm)}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsBpmInputOpen(!isBpmInputOpen);
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: '#2196F3',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  입력
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBpmTap();
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: '#4CAF50',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  탭 ({tapBpmCalculatorRef.current.getTapCount()})
                </button>
                {tapBpmResult && (
                  <span style={{ color: '#aaa', fontSize: '12px' }}>
                    (신뢰도: {(tapBpmResult.confidence * 100).toFixed(0)}%)
                  </span>
                )}
              </div>
            
            {/* BPM 분석 상태 표시 */}
            {bpmAnalysisState.status !== 'idle' && (
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: bpmAnalysisState.status === 'success' 
                    ? 'rgba(76, 175, 80, 0.2)' 
                    : bpmAnalysisState.status === 'failed'
                    ? 'rgba(244, 67, 54, 0.2)'
                    : 'rgba(33, 150, 243, 0.2)',
                  borderRadius: '6px',
                  border: `1px solid ${
                    bpmAnalysisState.status === 'success'
                      ? 'rgba(76, 175, 80, 0.5)'
                      : bpmAnalysisState.status === 'failed'
                      ? 'rgba(244, 67, 54, 0.5)'
                      : 'rgba(33, 150, 243, 0.5)'
                  }`,
                }}
              >
                <div style={{ color: '#fff', fontSize: '12px', marginBottom: '4px' }}>
                  {bpmAnalysisState.message}
                </div>
                {bpmAnalysisState.status === 'analyzing-metadata' && (
                  <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${bpmAnalysisState.progress}%`,
                        height: '100%',
                        backgroundColor: '#2196F3',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                )}
              </div>
            )}
            
            {isBpmInputOpen && (
              <input
                type="number"
                min="30"
                max="300"
                placeholder="BPM 입력"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleBpmInput(e.currentTarget.value);
                  }
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '14px',
                  backgroundColor: '#1f1f1f',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  width: '200px',
                }}
              />
            )}
            
            </div>
          </div>
        )}
      </div>

      {/* 메인 에디터 영역 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 사이드바 - 레인 선택 및 컨트롤 */}
        <div
          style={{
            width: '150px',
            backgroundColor: '#1f1f1f',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>
              현재 시간
            </div>
            <div style={{ color: '#aaa', fontSize: '14px' }}>
              {currentTime.toFixed(0)}ms
            </div>
            <div style={{ color: '#aaa', fontSize: '14px' }}>
              {(currentTime / 1000).toFixed(2)}s
            </div>
          </div>

          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>
              노트 개수
            </div>
            <div style={{ color: '#aaa', fontSize: '14px' }}>{notes.length}개</div>
          </div>

          <div>
            <div style={{ color: '#fff', marginBottom: '10px', fontWeight: 'bold' }}>
              줌
            </div>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const slider = e.currentTarget;
                const rect = slider.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const ratio = Math.max(0, Math.min(1, clickX / rect.width));
                
                // 클릭한 위치의 줌 값 계산 및 즉시 적용
                const clickZoom = 0.5 + ratio * (3 - 0.5);
                setZoom(clickZoom);
                
                // 드래그 시작 설정
                slider.style.cursor = 'grabbing';
                document.body.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';
                
                const startX = e.clientX;
                const startZoom = clickZoom; // 클릭한 위치의 줌 값에서 시작
                
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  moveEvent.preventDefault();
                  moveEvent.stopPropagation();
                  const deltaX = moveEvent.clientX - startX;
                  const zoomChange = (deltaX / rect.width) * 2.5;
                  const newZoom = Math.max(0.5, Math.min(3, startZoom + zoomChange));
                  setZoom(newZoom);
                };
                
                const handleMouseUp = (upEvent: MouseEvent) => {
                  upEvent.preventDefault();
                  upEvent.stopPropagation();
                  slider.style.cursor = 'pointer';
                  document.body.style.cursor = '';
                  document.body.style.userSelect = '';
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };
                
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp, { once: true });
              }}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <div style={{ color: '#aaa', fontSize: '12px', marginTop: '5px' }}>
              {zoom.toFixed(1)}x
            </div>
          </div>

        </div>

        {/* 에디터 캔버스 */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div
            style={{
              width: '500px',
              height: '100%',
              margin: '0 auto',
              position: 'relative',
              backgroundColor: '#1f1f1f',
            }}
          >
            {/* 키 레인 영역 배경 */}
            <div
              style={{
                position: 'absolute',
                left: '50px',
                top: 0,
                width: '400px',
                height: '100%',
                backgroundColor: '#2a2a2a',
              }}
            />

            {/* 레인 구분선 */}
            {[50, 150, 250, 350, 450].map((x) => (
              <div
                key={x}
                style={{
                  position: 'absolute',
                  left: `${x}px`,
                  top: 0,
                  width: '2px',
                  height: '100%',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  transform: 'translateX(-50%)',
                }}
              />
            ))}

            {/* 타임라인 스크롤 영역 */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                overflowY: 'auto',
                cursor: 'pointer',
              }}
              onClick={handleTimelineClick}
            >
              {/* 시간 격자 */}
              <div style={{ position: 'relative', minHeight: '10000px' }}>
                {/* BPM 기반 비트 격자 */}
                {(() => {
                  const beatDuration = bpmToBeatDuration(bpm);
                  const beatDurationPixels = (beatDuration / 1000) * PIXELS_PER_SECOND * zoom;
                  const maxBeats = Math.ceil((10000 / beatDurationPixels));
                  return Array.from({ length: maxBeats }).map((_, i) => {
                    const y = i * beatDurationPixels;
                    const isStrongBeat = i % 4 === 0;
                    return (
                      <div
                        key={`beat-${i}`}
                        style={{
                          position: 'absolute',
                          left: '50px',
                          right: '50px',
                          top: `${y}px`,
                          height: isStrongBeat ? '2px' : '1px',
                          backgroundColor: isStrongBeat ? 'rgba(255, 215, 0, 0.6)' : 'rgba(255, 255, 255, 0.2)',
                          pointerEvents: 'none',
                        }}
                      />
                    );
                  });
                })()}
                
                {/* 기본 시간 격자 (보조선) */}
                {Array.from({ length: 100 }).map((_, i) => {
                  const y = i * PIXELS_PER_SECOND * zoom;
                  const beatDuration = bpmToBeatDuration(bpm);
                  const beatY = Math.floor(y / ((beatDuration / 1000) * PIXELS_PER_SECOND * zoom)) * ((beatDuration / 1000) * PIXELS_PER_SECOND * zoom);
                  
                  // BPM 격자와 겹치지 않는 경우만 표시
                  if (Math.abs(y - beatY) < 2) {
                    return null;
                  }
                  
                  return (
                    <div
                      key={`time-${i}`}
                      style={{
                        position: 'absolute',
                        left: '50px',
                        right: '50px',
                        top: `${y}px`,
                        height: '1px',
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        pointerEvents: 'none',
                      }}
                    />
                  );
                })}

                {/* 판정선 */}
                <div
                  style={{
                    position: 'absolute',
                    left: '50px',
                    width: '400px',
                    top: `${JUDGE_LINE_Y}px`,
                    height: '4px',
                    backgroundColor: '#FF5722',
                    boxShadow: '0 0 10px rgba(255, 87, 34, 0.8)',
                  }}
                />

                {/* 현재 시간 인디케이터 */}
                <div
                  style={{
                    position: 'absolute',
                    left: '50px',
                    width: '400px',
                    top: `${JUDGE_LINE_Y}px`,
                    height: '2px',
                    backgroundColor: '#4CAF50',
                    pointerEvents: 'none',
                  }}
                />

                {/* 노트 렌더링 */}
                {visibleNotes.map((note) => {
                  const y = getNoteY(note);
                  const isOddLane = note.lane === 0 || note.lane === 2;
                  return (
                    <div
                      key={note.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNote(note.id);
                      }}
                      style={{
                        position: 'absolute',
                        left: `${LANE_POSITIONS[note.lane]}px`,
                        top: `${y}px`,
                        width: '100px',
                        height: '60px',
                        backgroundColor: isOddLane ? '#FF6B6B' : '#4ECDC4',
                        border: `3px solid ${isOddLane ? '#EE5A52' : '#45B7B8'}`,
                        borderRadius: '8px',
                        transform: 'translate(-50%, -50%)',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                      }}
                      title={`클릭하여 삭제 (${note.time}ms)`}
                    />
                  );
                })}
              </div>
            </div>

            {/* YouTube 플레이어 (숨김 - 오디오만 재생) */}
            {youtubeVideoId && (
              <div
                ref={youtubePlayerRef}
                style={{
                  position: 'absolute',
                  bottom: '-1000px',
                  left: '-1000px',
                  width: '1px',
                  height: '1px',
                  opacity: 0,
                  pointerEvents: 'none',
                  overflow: 'hidden',
                  zIndex: -1,
                }}
              />
            )}
            
            {/* 하단 레인 표시 */}
            <div
              style={{
                position: 'absolute',
                bottom: '0',
                left: '50px',
                width: '400px',
                height: '100px',
                display: 'flex',
                gap: '0',
              }}
            >
              {[0, 1, 2, 3].map((lane) => (
                <div
                  key={lane}
                  onClick={() => handleLaneClick(lane as Lane)}
                  style={{
                    flex: 1,
                    backgroundColor: lane === 0 || lane === 2 ? '#FF6B6B' : '#4ECDC4',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    fontSize: '32px',
                    fontWeight: 'bold',
                    color: '#fff',
                    cursor: 'pointer',
                    border: '2px solid rgba(255,255,255,0.2)',
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                >
                  {['D', 'F', 'J', 'K'][lane]}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

