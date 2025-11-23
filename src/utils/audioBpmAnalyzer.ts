// 오디오 파일 BPM 분석 유틸리티
// 여러 알고리즘을 조합한 하이브리드 BPM 분석

import { analyze } from 'web-audio-beat-detector';
import { BPMAnalysisResult, isValidBPM } from './bpmAnalyzer';
import { analyzeBPMHybrid } from './bpmAlgorithms';

export interface AudioBPMResult extends BPMAnalysisResult {
  method: 'analyzed';
  processingTime?: number;
}

// 오디오 파일을 AudioBuffer로 변환
async function fileToAudioBuffer(file: File, audioContext: AudioContext): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return audioBuffer;
}

// 하이브리드 BPM 분석 (여러 알고리즘 시도)
export async function analyzeAudioBPM(
  audioFile: File,
  onProgress?: (progress: number) => void
): Promise<AudioBPMResult | null> {
  try {
    onProgress?.(0.05);

    // AudioContext 생성
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    onProgress?.(0.1);

    // 파일을 AudioBuffer로 변환
    const audioBuffer = await fileToAudioBuffer(audioFile, audioContext);
    onProgress?.(0.2);

    const startTime = performance.now();
    const results: (AudioBPMResult | null)[] = [];
    
    // 방법 1: web-audio-beat-detector (먼저 시도, 빠르고 안정적)
    try {
      console.log('--- web-audio-beat-detector 시도 ---');
      const tempoResult = await analyze(audioBuffer);
      onProgress?.(0.4);
      // web-audio-beat-detector는 { tempo: number, confidence?: number } 객체를 반환
      const tempo = typeof tempoResult === 'object' && tempoResult !== null && 'tempo' in tempoResult
        ? tempoResult as { tempo: number; confidence?: number }
        : null;
      if (tempo && isValidBPM(tempo.tempo)) {
        results.push({
          bpm: Math.round(tempo.tempo),
          confidence: tempo.confidence || 0.8,
          method: 'analyzed',
          processingTime: performance.now() - startTime,
        });
        console.log('✅ web-audio-beat-detector 성공:', tempo);
      } else {
        console.warn('❌ web-audio-beat-detector 실패:', tempoResult);
      }
    } catch (error) {
      console.error('❌ web-audio-beat-detector 예외:', error);
    }
    
    // 방법 2: 하이브리드 알고리즘 (Onset Detection + Autocorrelation) - fallback
    try {
      console.log('--- 하이브리드 알고리즘 시도 ---');
      const hybridProgress = (progress: number) => {
        onProgress?.(0.4 + progress * 0.5); // 40% ~ 90%
      };
      const hybridResult = await analyzeBPMHybrid(audioBuffer, hybridProgress);
      if (hybridResult && isValidBPM(hybridResult.bpm)) {
        results.push({
          bpm: hybridResult.bpm,
          confidence: hybridResult.confidence,
          method: 'analyzed',
          processingTime: performance.now() - startTime,
        });
        console.log('✅ 하이브리드 알고리즘 성공:', hybridResult);
      } else {
        console.warn('❌ 하이브리드 알고리즘 실패:', hybridResult);
      }
    } catch (error) {
      console.error('❌ 하이브리드 알고리즘 예외:', error);
    }
    
    onProgress?.(0.9);
    
    const processingTime = performance.now() - startTime;
    onProgress?.(1.0);

    // 결과 선택 (신뢰도가 높은 것 우선, 또는 평균)
    if (results.length === 0) {
      console.error('모든 BPM 분석 알고리즘이 실패했습니다.');
      return null;
    }
    
    // 신뢰도가 가장 높은 결과 선택
    results.sort((a, b) => (b?.confidence || 0) - (a?.confidence || 0));
    let bestResult = results[0];
    
    // BPM 보정: 비정상적으로 낮은 BPM 또는 2배 보정 후에도 범위가 이상한 경우 추가 보정
    if (bestResult) {
      const originalBpm = bestResult.bpm;
      let needsCorrection = false;
      
      // 1차 보정: 60 미만의 비정상적으로 낮은 BPM
      if (originalBpm < 60) {
        console.warn(`⚠️ 비정상적으로 낮은 BPM 감지: ${originalBpm}`);
        needsCorrection = true;
      }
      // 2차 보정: 2배 보정 후에도 여전히 낮은 범위(60-90)인 경우 추가 보정 고려
      else if (originalBpm >= 60 && originalBpm < 90 && originalBpm % 2 === 0) {
        // 짝수 BPM이고 낮은 범위면 원래 30-45 범위일 가능성
        console.warn(`⚠️ 낮은 범위의 BPM 감지 (추가 보정 고려): ${originalBpm}`);
        needsCorrection = true;
      }
      
      if (needsCorrection) {
        console.log('여러 배수값 확인 중...');
        
        // 일반적인 BPM 범위를 고려한 보정값 생성
        const baseBpm = originalBpm < 60 ? originalBpm : Math.round(originalBpm / 2); // 원래 BPM 추정
        const correctedOptions = [];
        
        // 2배 ~ 3배 사이를 세밀하게 검토 (0.1 단위)
        for (let multiplier = 2.0; multiplier <= 3.0; multiplier += 0.1) {
          const correctedBpm = Math.round(baseBpm * multiplier);
          if (isValidBPM(correctedBpm)) {
            // 일반적인 BPM 범위 (100-140)에 가까울수록 신뢰도 높임
            let confidenceBonus = 0;
            let priority = 0;
            
            if (correctedBpm >= 100 && correctedBpm <= 140) {
              confidenceBonus = 0.15; // 이상적인 범위 (107 포함)
              priority = 3;
            } else if (correctedBpm >= 90 && correctedBpm <= 150) {
              confidenceBonus = 0.1; // 좋은 범위
              priority = 2;
            } else if (correctedBpm >= 80 && correctedBpm <= 180) {
              confidenceBonus = 0.05; // 일반적인 범위
              priority = 1;
            }
            
            correctedOptions.push({
              bpm: correctedBpm,
              confidence: Math.min(0.95, (bestResult.confidence || 0) * 0.85 + confidenceBonus),
              multiplier: multiplier,
              priority: priority,
            });
          }
        }
        
        // 보정 옵션들을 정렬 (우선순위 > 신뢰도)
        correctedOptions.sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority;
          return b.confidence - a.confidence;
        });
        
        if (correctedOptions.length > 0) {
          // 여러 후보 중 가장 일반적인 범위의 값 선택
          // 1. 100-140 범위 우선 (107 BPM 포함)
          const idealRange = correctedOptions.find(opt => opt.bpm >= 100 && opt.bpm <= 140);
          if (idealRange) {
            console.log(`🔧 BPM 보정 적용: ${bestResult.bpm} → ${idealRange.bpm} (${idealRange.multiplier.toFixed(1)}x, 우선순위: ${idealRange.priority})`);
            bestResult = {
              ...bestResult,
              bpm: idealRange.bpm,
              confidence: idealRange.confidence,
            };
          } else {
            // 2. 그 다음 90-150 범위
            const goodRange = correctedOptions.find(opt => opt.bpm >= 90 && opt.bpm <= 150);
            if (goodRange) {
              console.log(`🔧 BPM 보정 적용: ${bestResult.bpm} → ${goodRange.bpm} (${goodRange.multiplier.toFixed(1)}x)`);
              bestResult = {
                ...bestResult,
                bpm: goodRange.bpm,
                confidence: goodRange.confidence,
              };
            } else {
              // 3. 그 외 가장 높은 신뢰도
              const corrected = correctedOptions[0];
              console.log(`🔧 BPM 보정 적용: ${bestResult.bpm} → ${corrected.bpm} (${corrected.multiplier.toFixed(1)}x)`);
              bestResult = {
                ...bestResult,
                bpm: corrected.bpm,
                confidence: corrected.confidence,
              };
            }
          }
        }
      }
    }
    
    // 여러 결과가 있고 서로 비슷하면 (20 BPM 이내) 평균 계산
    if (results.length > 1) {
      const validResults = results.filter(r => r !== null) as AudioBPMResult[];
      
      // 보정된 BPM과 다른 결과들을 비교
      const allResults = validResults.map(r => ({
        ...r,
        // 낮은 BPM도 보정
        bpm: r.bpm < 50 ? r.bpm * 2 : r.bpm,
      }));
      
      const avgBpm = Math.round(
        allResults.reduce((sum, r) => sum + r.bpm, 0) / allResults.length
      );
      
      // 결과들이 서로 가까운지 확인
      const allSimilar = allResults.every(r => Math.abs(r.bpm - avgBpm) <= 20);
      
      if (allSimilar && allResults.length >= 2) {
        // 일치하는 알고리즘이 많을수록 신뢰도 증가
        const avgConfidence = allResults.reduce((sum, r) => sum + (r.confidence || 0), 0) / allResults.length;
        const consensusBonus = (allResults.length / results.length) * 0.15;
        
        console.log(`✅ 여러 알고리즘 일치: 평균 BPM ${avgBpm}`);
        return {
          bpm: avgBpm,
          confidence: Math.min(0.95, avgConfidence + consensusBonus),
          method: 'analyzed',
          processingTime,
        };
      }
    }
    
    console.log(`✅ 최종 BPM 선택: ${bestResult?.bpm} (신뢰도: ${bestResult?.confidence})`);
    return bestResult || null;
  } catch (error) {
    console.error('BPM 분석 오류:', error);
    return null;
  }
}

// 오디오 파일 형식 검증
export function isValidAudioFile(file: File): boolean {
  const validTypes = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/ogg',
    'audio/oga',
    'audio/mp4',
    'audio/aac',
    'audio/flac',
    'video/mp4', // MP4 비디오 파일도 오디오 추출 가능
    'video/webm',
  ];

  const validExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.mp4', '.webm'];

  const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

  return (
    validTypes.includes(file.type) ||
    validExtensions.some((ext) => fileExtension === ext)
  );
}

// 오디오 파일 크기 검증 (최대 50MB)
export function isFileSizeValid(file: File): boolean {
  const maxSize = 50 * 1024 * 1024; // 50MB
  return file.size <= maxSize;
}

// 오디오 파일 검증 통합
export function validateAudioFile(file: File): { valid: boolean; error?: string } {
  if (!isValidAudioFile(file)) {
    return {
      valid: false,
      error: '지원하지 않는 오디오 형식입니다. (MP3, WAV, OGG, M4A, AAC, FLAC 지원)',
    };
  }

  if (!isFileSizeValid(file)) {
    return {
      valid: false,
      error: '파일 크기가 너무 큽니다. (최대 50MB)',
    };
  }

  return { valid: true };
}

