import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, Note, Lane, JudgeType } from '../types/game';
import { Note as NoteComponent } from './Note';
import { KeyLane } from './KeyLane';
import { JudgeLine } from './JudgeLine';
import { Score as ScoreComponent } from './Score';
import { ChartEditor } from './ChartEditor';
import { useKeyboard } from '../hooks/useKeyboard';
import { useGameLoop } from '../hooks/useGameLoop';
import { judgeTiming } from '../utils/judge';
import { generateNotes } from '../utils/noteGenerator';
import { isServerAvailable } from '../utils/youtubeDownloader';

const LANE_KEYS = [
  ['D'],
  ['F'],
  ['J'],
  ['K'],
];

// 키 레인을 딱 붙이도록 배치: 각 레인 100px 너비, 4개 = 400px
// 양쪽 여백을 3분의 1로 줄임: (700 - 400) / 2 / 3 = 50px
// 첫 레인 중앙: 50 + 50 = 100px, 이후 100px씩 간격
// 판정선: 50px ~ 450px (키 레인 영역만)
const LANE_POSITIONS = [100, 200, 300, 400];
const JUDGE_LINE_LEFT = 50; // 판정선 시작 위치 (첫 레인 왼쪽)
const JUDGE_LINE_WIDTH = 400; // 판정선 너비 (키 레인 영역)

const GAME_DURATION = 30000; // 30초

export const Game: React.FC = () => {
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [gameState, setGameState] = useState<GameState>(() => ({
    notes: generateNotes(GAME_DURATION),
    score: {
      perfect: 0,
      great: 0,
      good: 0,
      miss: 0,
      combo: 0,
      maxCombo: 0,
    },
    currentTime: 0,
    gameStarted: false,
    gameEnded: false,
  }));

  const [pressedKeys, setPressedKeys] = useState<Set<Lane>>(new Set());
  const [judgeFeedbacks, setJudgeFeedbacks] = useState<Array<{
    id: number;
    judge: JudgeType;
  }>>([]);
  const feedbackIdRef = useRef(0);
  const [keyEffects, setKeyEffects] = useState<Array<{
    id: number;
    lane: Lane;
    x: number;
    y: number;
  }>>([]);
  const keyEffectIdRef = useRef(0);
  const processedMissNotes = useRef<Set<number>>(new Set()); // 이미 Miss 처리된 노트 ID 추적
  
  // localStorage에서 속도 불러오기
  const [speed, setSpeed] = useState<number>(() => {
    const savedSpeed = localStorage.getItem('rhythmGameSpeed');
    return savedSpeed ? parseFloat(savedSpeed) : 1.0;
  });

  // 서버 상태 확인
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  
  useEffect(() => {
    // 서버 상태 주기적으로 확인
    const checkServer = async () => {
      const available = await isServerAvailable();
      setServerStatus(available ? 'online' : 'offline');
    };
    
    checkServer();
    const interval = setInterval(checkServer, 5000); // 5초마다 확인
    
    return () => clearInterval(interval);
  }, []);

  // 속도가 변경될 때마다 localStorage에 저장
  useEffect(() => {
    localStorage.setItem('rhythmGameSpeed', speed.toString());
  }, [speed]);

  // gameState를 ref로 저장하여 최신 값을 항상 참조
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const handleKeyPress = useCallback(
    (lane: Lane) => {
      const currentState = gameStateRef.current;
      
      if (!currentState.gameStarted || currentState.gameEnded) return;

      // 키 눌림 상태 업데이트 - 눌렀을 때만 잠깐 노란색으로 변함
      setPressedKeys((prev) => {
        if (prev.has(lane)) return prev; // 이미 눌린 키는 업데이트 생략
        const next = new Set(prev);
        next.add(lane);
        
        // 키를 눌렀을 때만 짧은 시간 후 파란색으로 돌아감
        setTimeout(() => {
          setPressedKeys((prev) => {
            const next = new Set(prev);
            next.delete(lane);
            return next;
          });
        }, 100); // 100ms 후 파란색으로 돌아감
        
        return next;
      });

      // 해당 레인의 가장 가까운 노트 찾기
      const laneNotes = currentState.notes.filter(
        (note) => note.lane === lane && !note.hit
      );

      // 노트가 없으면 아무것도 하지 않음 (허공에 누르는 건 처리 안 함)
      if (laneNotes.length === 0) {
        return;
      }

      const currentTime = currentState.currentTime;
      let bestNote: Note | null = null;
      let bestTimeDiff = Infinity;

      for (const note of laneNotes) {
        const timeDiff = Math.abs(note.time - currentTime);
        if (timeDiff < bestTimeDiff && timeDiff <= 150) {
          bestTimeDiff = timeDiff;
          bestNote = note;
        }
      }

      if (bestNote) {
        const judge = judgeTiming(bestNote.time - currentTime);
        
        // 상태 업데이트를 하나로 합침
        setGameState((prev) => {
          const newScore = { ...prev.score };
          
          switch (judge) {
            case 'perfect':
              newScore.perfect++;
              newScore.combo++;
              break;
            case 'great':
              newScore.great++;
              newScore.combo++;
              break;
            case 'good':
              newScore.good++;
              newScore.combo++;
              break;
            case 'miss':
              newScore.miss++;
              newScore.combo = 0;
              break;
          }

          if (newScore.combo > newScore.maxCombo) {
            newScore.maxCombo = newScore.combo;
          }

          const updatedNotes = prev.notes.map((note) =>
            note.id === bestNote!.id ? { ...note, hit: true } : note
          );

          return {
            ...prev,
            notes: updatedNotes,
            score: newScore,
          };
        });

        // 새로운 판정 피드백 추가 - 이전 판정들은 제거
        const feedbackId = feedbackIdRef.current++;
        setJudgeFeedbacks([{ id: feedbackId, judge }]);
        
        // 판정선에서 이펙트 추가 (miss가 아닐 때만) - 노트가 닿는 판정선 위치에서
        if (judge !== 'miss') {
          const effectId = keyEffectIdRef.current++;
          // 노트가 판정선에 닿는 위치 (판정선 y 좌표: 640px)
          const effectX = LANE_POSITIONS[lane];
          const effectY = 640; // 판정선 위치
          setKeyEffects((prev) => [...prev, { id: effectId, lane, x: effectX, y: effectY }]);
          
          // 피드백 제거와 이펙트 제거를 requestAnimationFrame으로 처리하여 렌더링 최적화
          requestAnimationFrame(() => {
            setTimeout(() => {
              setJudgeFeedbacks((prev) => prev.filter(f => f.id !== feedbackId));
              setKeyEffects((prev) => prev.filter(e => e.id !== effectId));
            }, 800);
          });
        } else {
          // miss일 때는 이펙트 없이 피드백만 제거
          requestAnimationFrame(() => {
            setTimeout(() => {
              setJudgeFeedbacks((prev) => prev.filter(f => f.id !== feedbackId));
            }, 800);
          });
        }
      }
      // bestNote가 null이고 laneNotes가 있으면 타이밍이 안 맞는 경우
      // 이 경우에도 Miss 처리하지 않음 (허공에 누르는 건이 아니지만 처리 안 함)
    },
    [] // 의존성 제거하여 함수 재생성 방지
  );

  useKeyboard(handleKeyPress, gameState.gameStarted && !gameState.gameEnded);

  const handleNoteMiss = useCallback((note: Note) => {
    // 이미 처리된 노트는 다시 처리하지 않음
    if (processedMissNotes.current.has(note.id)) {
      console.log('이미 처리된 노트:', note.id);
      return;
    }
    
    console.log('Miss 처리:', note.id);
    
    // 처리된 노트 ID 기록
    processedMissNotes.current.add(note.id);
    
    setGameState((prev) => ({
      ...prev,
      score: {
        ...prev.score,
        miss: prev.score.miss + 1,
        combo: 0,
      },
    }));
  }, []);

  useGameLoop(gameState, setGameState, handleNoteMiss, speed);

  useEffect(() => {
    if (
      gameState.gameStarted &&
      gameState.currentTime >= GAME_DURATION &&
      !gameState.gameEnded
    ) {
      setGameState((prev) => ({ ...prev, gameEnded: true }));
    }
  }, [gameState.currentTime, gameState.gameStarted, gameState.gameEnded]);

  const startGame = () => {
    processedMissNotes.current.clear(); // Miss 처리된 노트 추적 초기화
    setGameState((prev) => ({
      ...prev,
      gameStarted: true,
      notes: generateNotes(GAME_DURATION),
      score: {
        perfect: 0,
        great: 0,
        good: 0,
        miss: 0,
        combo: 0,
        maxCombo: 0,
      },
      currentTime: 0,
      gameEnded: false,
    }));
  };

  const resetGame = () => {
    processedMissNotes.current.clear(); // Miss 처리된 노트 추적 초기화
    setGameState((prev) => ({
      ...prev,
      gameStarted: false,
      gameEnded: false,
      currentTime: 0,
      notes: generateNotes(GAME_DURATION),
      score: {
        perfect: 0,
        great: 0,
        good: 0,
        miss: 0,
        combo: 0,
        maxCombo: 0,
      },
    }));
  };

  const total = gameState.score.perfect + gameState.score.great + 
                gameState.score.good + gameState.score.miss;
  const accuracy =
    total > 0
      ? ((gameState.score.perfect * 100 +
          gameState.score.great * 80 +
          gameState.score.good * 50) /
          (total * 100)) *
        100
      : 0;

  // 채보 저장 핸들러
  const handleChartSave = useCallback((notes: Note[]) => {
    setGameState((prev) => ({
      ...prev,
      notes: notes.map((note) => ({ ...note, y: 0, hit: false })),
    }));
    setIsEditorOpen(false);
  }, []);

  // 에디터 닫기 핸들러
  const handleEditorCancel = useCallback(() => {
    setIsEditorOpen(false);
  }, []);

  // 에디터가 열려있으면 에디터만 표시
  if (isEditorOpen) {
    return <ChartEditor onSave={handleChartSave} onCancel={handleEditorCancel} />;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#1a1a1a',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          width: '500px', // 양쪽 여백을 3분의 1로 줄임: 700px - 400px = 300px -> 100px
          height: '800px',
          backgroundColor: '#1f1f1f', // 여백 색상 (더 어두운 색)
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* 키 레인 영역 배경 */}
        <div
          style={{
            position: 'absolute',
            left: '50px',
            top: '0',
            width: '400px',
            height: '100%',
            backgroundColor: '#2a2a2a', // 키 레인 영역 색상 (더 밝은 색)
          }}
        />
        
        {/* 배경 레인 구분선 - 레인 사이 경계와 양쪽 끝 */}
        {[50, 150, 250, 350, 450].map((x) => (
          <div
            key={x}
            style={{
              position: 'absolute',
              left: `${x}px`,
              top: '0',
              width: '2px',
              height: '100%',
              backgroundColor: 'rgba(255,255,255,0.1)',
              transform: 'translateX(-50%)',
            }}
          />
        ))}

        {/* 노트 렌더링 */}
        {gameState.notes.map((note) => (
          <NoteComponent
            key={note.id}
            x={LANE_POSITIONS[note.lane]}
            y={note.y}
            hit={note.hit}
            lane={note.lane}
          />
        ))}

        {/* 판정선 - 게임 중에만 표시 (키 레인 영역에만) */}
        {gameState.gameStarted && (
          <JudgeLine left={JUDGE_LINE_LEFT} width={JUDGE_LINE_WIDTH} />
        )}

        {/* 키 레인 - 게임 중에만 표시 */}
        {gameState.gameStarted &&
          LANE_POSITIONS.map((x, index) => (
            <KeyLane
              key={index}
              x={x}
              keys={LANE_KEYS[index]}
              isPressed={pressedKeys.has(index as Lane)}
            />
          ))}

        {/* 판정선에서 나오는 이펙트 - 노트가 닿는 위치에서 (게임 중에만 표시) */}
        {gameState.gameStarted &&
          keyEffects.map((effect) => (
            <div
              key={effect.id}
              style={{
                position: 'absolute',
                left: `${effect.x}px`,
                top: `${effect.y}px`,
                transform: 'translate(-50%, -50%)',
                width: '120px',
                height: '120px',
                pointerEvents: 'none',
                zIndex: 500,
              }}
            >
              {/* 파티클 이펙트 */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '100%',
                  height: '100%',
                  animation: 'keyEffectRipple 0.6s ease-out forwards',
                  borderRadius: '50%',
                  border: '3px solid rgba(255, 255, 255, 0.8)',
                  boxShadow: '0 0 20px rgba(255, 255, 255, 0.6), 0 0 40px rgba(255, 255, 255, 0.4)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '80%',
                  height: '80%',
                  animation: 'keyEffectRipple 0.6s 0.1s ease-out forwards',
                  borderRadius: '50%',
                  border: '2px solid rgba(255, 255, 255, 0.6)',
                  boxShadow: '0 0 15px rgba(255, 255, 255, 0.5)',
                }}
              />
              {/* 상단으로 올라가는 파티클 */}
              {[...Array(8)].map((_, i) => {
                const angle = (i * 360) / 8;
                const radians = (angle * Math.PI) / 180;
                const distance = 40;
                const x = Math.cos(radians) * distance;
                const y = Math.sin(radians) * distance - 40; // 위로 더 올라가도록
                
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      boxShadow: '0 0 10px rgba(255, 255, 255, 0.8)',
                      animation: `keyEffectParticle 0.6s ease-out forwards`,
                      animationDelay: `${i * 0.05}s`,
                      '--end-x': `${x}px`,
                      '--end-y': `${y}px`,
                    } as React.CSSProperties & { '--end-x': string; '--end-y': string }}
                  />
                );
              })}
            </div>
          ))}

        {/* 판정 피드백 - 키 레인 영역 중앙에 통합 표시 (개별 애니메이션) */}
        {judgeFeedbacks.map((feedback) => 
          feedback.judge ? (
            <div
              key={feedback.id}
              style={{
                position: 'absolute',
                left: '50%',
                top: '500px',
                transform: 'translateX(-50%)',
                fontSize: '48px',
                fontWeight: 'bold',
                color:
                  feedback.judge === 'perfect'
                    ? '#FFD700'
                    : feedback.judge === 'great'
                    ? '#00FF00'
                    : feedback.judge === 'good'
                    ? '#00BFFF'
                    : '#FF4500',
                textShadow: '0 0 20px rgba(255,255,255,0.9), 0 0 40px currentColor',
                animation: 'judgePopUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                zIndex: 1000 + feedback.id,
                pointerEvents: 'none',
              }}
            >
              {feedback.judge.toUpperCase()}
            </div>
          ) : null
        )}

        {/* 점수 - 게임 중에만 표시 */}
        {gameState.gameStarted && <ScoreComponent score={gameState.score} />}

        {/* 게임 시작/종료 UI */}
        {!gameState.gameStarted && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              color: '#fff',
              width: '90%',
              maxWidth: '600px',
            }}
          >
            {/* 플랫폼 타이틀 */}
            <h1 
              style={{ 
                fontSize: '50px', 
                marginBottom: '24px', 
                marginTop: '-40px',
                fontWeight: '900',
                fontStyle: 'italic',
                letterSpacing: '4px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                textShadow: '0 0 40px rgba(102, 126, 234, 0.5)',
                fontFamily: 'Arial Black, sans-serif',
                textTransform: 'uppercase',
                lineHeight: '1.1',
              }}
            >
              UserRhythm
            </h1>
            <p style={{ fontSize: '18px', marginBottom: '48px', color: '#aaa' }}>
              나만의 리듬게임 채보를 만들고 공유하세요
            </p>

            {/* 메인 메뉴 */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                marginBottom: '48px',
              }}
            >
              <button
                onClick={startGame}
                style={{
                  padding: '20px 40px',
                  fontSize: '22px',
                  backgroundColor: '#4CAF50',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#45a049';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(76, 175, 80, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#4CAF50';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.3)';
                }}
              >
                🎵 데모 플레이
              </button>

              <button
                style={{
                  padding: '20px 40px',
                  fontSize: '22px',
                  backgroundColor: '#2196F3',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#1976D2';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(33, 150, 243, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#2196F3';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.3)';
                }}
                onClick={() => {
                  // TODO: 채보 선택 화면으로 이동
                  alert('채보 선택 기능은 준비 중입니다.');
                }}
              >
                📚 채보 선택하기
              </button>

              <button
                style={{
                  padding: '20px 40px',
                  fontSize: '22px',
                  backgroundColor: '#FF9800',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(255, 152, 0, 0.3)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F57C00';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 152, 0, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#FF9800';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 152, 0, 0.3)';
                }}
                onClick={() => {
                  setIsEditorOpen(true);
                }}
              >
                ✏️ 채보 만들기
              </button>
            </div>

            {/* 서버 상태 */}
            <div
              style={{
                backgroundColor: serverStatus === 'online' 
                  ? 'rgba(76, 175, 80, 0.1)' 
                  : serverStatus === 'offline'
                  ? 'rgba(244, 67, 54, 0.1)'
                  : 'rgba(255, 255, 255, 0.05)',
                padding: '16px 24px',
                borderRadius: '12px',
                marginTop: '32px',
                border: `2px solid ${serverStatus === 'online' ? '#4CAF50' : serverStatus === 'offline' ? '#f44336' : '#666'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>
                  {serverStatus === 'online' ? '🟢' : serverStatus === 'offline' ? '🔴' : '🟡'}
                </span>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>
                    YouTube 다운로드 서버
                  </div>
                  <div style={{ fontSize: '14px', color: '#aaa', marginTop: '4px' }}>
                    {serverStatus === 'online' 
                      ? '서버가 실행 중입니다' 
                      : serverStatus === 'offline'
                      ? '서버가 꺼져있습니다'
                      : '서버 상태 확인 중...'}
                  </div>
                </div>
              </div>
              {serverStatus === 'offline' && (
                <button
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    backgroundColor: '#4CAF50',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.2s',
                  }}
                  onClick={async () => {
                    setServerStatus('checking');
                    const available = await isServerAvailable();
                    if (!available) {
                      alert(
                        '서버를 수동으로 시작해주세요.\n\n터미널에서 다음 명령어를 실행하세요:\n\n' +
                        'npm run dev\n\n' +
                        '또는 서버만 실행하려면:\n\n' +
                        'cd server && npm start'
                      );
                      setServerStatus('offline');
                    } else {
                      setServerStatus('online');
                    }
                  }}
                >
                  다시 확인
                </button>
              )}
            </div>

            {/* 설정 */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '24px',
                borderRadius: '12px',
                marginTop: '16px',
              }}
            >
              <h3 style={{ fontSize: '20px', marginBottom: '20px', fontWeight: 'bold' }}>
                ⚙️ 게임 설정
              </h3>
              
              {/* 속도 조절 슬라이더 */}
              <div
                style={{
                  marginBottom: '16px',
                  color: '#fff',
                }}
              >
                <label
                  style={{
                    display: 'block',
                    fontSize: '16px',
                    marginBottom: '12px',
                    fontWeight: '500',
                  }}
                >
                  노트 속도: {speed.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="10.0"
                  step="0.1"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    height: '8px',
                    borderRadius: '4px',
                    outline: 'none',
                    backgroundColor: '#555',
                    cursor: 'pointer',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    marginTop: '8px',
                    color: '#aaa',
                  }}
                >
                  <span>0.5x</span>
                  <span>1.0x</span>
                  <span>5.0x</span>
                  <span>10.0x</span>
                </div>
              </div>

              <div style={{ fontSize: '14px', color: '#aaa', marginTop: '16px' }}>
                💡 조작법: D, F, J, K 키를 사용하세요
              </div>
            </div>
          </div>
        )}

        {gameState.gameEnded && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              color: '#fff',
              backgroundColor: 'rgba(0,0,0,0.8)',
              padding: '32px',
              borderRadius: '12px',
            }}
          >
            <h1 style={{ fontSize: '48px', marginBottom: '32px' }}>
              게임 종료
            </h1>
            <div style={{ fontSize: '24px', marginBottom: '32px' }}>
              <div>최대 콤보: {gameState.score.maxCombo}</div>
              <div>정확도: {accuracy.toFixed(2)}%</div>
            </div>
            <button
              onClick={resetGame}
              style={{
                padding: '16px 32px',
                fontSize: '24px',
                backgroundColor: '#2196F3',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              다시 시작
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

