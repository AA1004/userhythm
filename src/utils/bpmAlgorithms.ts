// 다양한 BPM 분석 알고리즘 구현
// 여러 알고리즘을 조합하여 더 정확하고 안정적인 BPM 감지

import { isValidBPM } from './bpmAnalyzer';

export interface BPMResult {
  bpm: number;
  confidence: number;
  method: string;
}

// 오디오 버퍼에서 모노 채널 데이터 추출
function getMonoChannelData(audioBuffer: AudioBuffer): Float32Array {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  
  // 첫 번째 채널 또는 모든 채널의 평균
  if (numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }
  
  // 다중 채널의 경우 평균 계산
  const monoData = new Float32Array(length);
  const channelData = [];
  for (let i = 0; i < numberOfChannels; i++) {
    channelData.push(audioBuffer.getChannelData(i));
  }
  
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let j = 0; j < numberOfChannels; j++) {
      sum += channelData[j][i];
    }
    monoData[i] = sum / numberOfChannels;
  }
  
  return monoData;
}

// 오디오 데이터 다운샘플링 (처리 속도 향상)
function downsample(audioData: Float32Array, targetSampleRate: number, originalSampleRate: number): Float32Array {
  if (targetSampleRate >= originalSampleRate) {
    return audioData;
  }
  
  const ratio = originalSampleRate / targetSampleRate;
  const newLength = Math.floor(audioData.length / ratio);
  const downsampled = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    downsampled[i] = audioData[Math.floor(i * ratio)];
  }
  
  return downsampled;
}

// Energy-based Onset Detection (비트 시작점 감지)
function detectOnsets(audioData: Float32Array, sampleRate: number): number[] {
  const onsets: number[] = [];
  const frameSize = Math.floor(sampleRate * 0.023); // 23ms 프레임
  const hopSize = Math.floor(sampleRate * 0.011); // 11ms 홉
  const threshold = 0.05; // 임계값을 낮춤 (더 민감하게)
  
  // 전체 평균 에너지 계산 (동적 임계값 사용)
  let totalEnergy = 0;
  for (let i = 0; i < Math.min(audioData.length, sampleRate * 1); i++) {
    totalEnergy += Math.abs(audioData[i]);
  }
  const avgEnergy = totalEnergy / Math.min(audioData.length, sampleRate * 1);
  const dynamicThreshold = Math.max(avgEnergy * 0.5, 0.005); // 평균의 50% 또는 최소값
  
  let previousEnergy = 0;
  
  for (let i = 0; i < audioData.length - frameSize; i += hopSize) {
    // 프레임 에너지 계산
    let energy = 0;
    for (let j = 0; j < frameSize; j++) {
      energy += Math.abs(audioData[i + j]);
    }
    energy /= frameSize;
    
    // 에너지 증가 감지 (onset) - 동적 임계값 사용
    if (energy > previousEnergy * (1 + threshold) && energy > dynamicThreshold) {
      onsets.push(i / sampleRate * 1000); // 밀리초로 변환
    }
    
    previousEnergy = energy;
  }
  
  return onsets;
}

// 알고리즘 1: Onset Detection + Interval Analysis
export function analyzeBPMByOnsets(audioBuffer: AudioBuffer): BPMResult | null {
  try {
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;
    console.log('Onset Detection 시작 - 샘플레이트:', sampleRate, 'duration:', duration);
    
    let audioData = getMonoChannelData(audioBuffer);
    console.log('오디오 데이터 길이:', audioData.length);
    
    // 다운샘플링 (처리 속도 향상, 8kHz로 다운샘플)
    if (sampleRate > 8000) {
      audioData = downsample(audioData, 8000, sampleRate);
      console.log('다운샘플링 후 길이:', audioData.length);
    }
    
    // Onset 감지
    const onsets = detectOnsets(audioData, sampleRate > 8000 ? 8000 : sampleRate);
    console.log('감지된 onset 개수:', onsets.length);
    
    if (onsets.length < 5) { // 최소 요구사항 낮춤
      console.warn('Onset이 너무 적음:', onsets.length);
      return null; // 충분한 onset이 없음
    }
    
    // Onset 간격 계산
    const intervals: number[] = [];
    for (let i = 1; i < onsets.length; i++) {
      intervals.push(onsets[i] - onsets[i - 1]);
    }
    
    // 가장 빈번한 간격 찾기 (히스토그램)
    const histogram: { [key: number]: number } = {};
    const tolerance = 100; // 100ms 허용 오차 (더 관대하게)
    
    for (const interval of intervals) {
      // BPM 범위: 30-300 (200ms ~ 2000ms 간격)
      if (interval >= 200 && interval <= 2000) {
        const rounded = Math.round(interval / tolerance) * tolerance;
        histogram[rounded] = (histogram[rounded] || 0) + 1;
      }
    }
    
    console.log('히스토그램:', histogram);
    
    // 가장 빈번한 간격 찾기
    let maxCount = 0;
    let bestInterval = 0;
    for (const [interval, count] of Object.entries(histogram)) {
      if (count > maxCount) {
        maxCount = count;
        bestInterval = parseFloat(interval);
      }
    }
    
    console.log('가장 빈번한 간격:', bestInterval, '횟수:', maxCount);
    
    if (bestInterval === 0 || maxCount < 2) {
      console.warn('유효한 간격을 찾을 수 없음');
      return null;
    }
    
    // BPM 계산
    const bpm = Math.round((60 * 1000) / bestInterval);
    console.log('계산된 BPM:', bpm);
    
    if (!isValidBPM(bpm)) {
      console.warn('유효하지 않은 BPM:', bpm);
      return null;
    }
    
    // 신뢰도 계산 (일치하는 간격의 비율)
    const matchingIntervals = intervals.filter(
      (interval) => Math.abs(interval - bestInterval) < tolerance
    ).length;
    const confidence = Math.min(0.95, (matchingIntervals / intervals.length) * 1.5);
    
    const result = {
      bpm,
      confidence: Math.max(0.3, confidence),
      method: 'onset-detection',
    };
    
    console.log('Onset Detection 결과:', result);
    return result;
  } catch (error) {
    console.error('Onset Detection BPM 분석 오류:', error);
    return null;
  }
}

// 알고리즘 2: Autocorrelation 기반 BPM 감지
export function analyzeBPMByAutocorrelation(audioBuffer: AudioBuffer): BPMResult | null {
  try {
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;
    console.log('Autocorrelation 시작 - 샘플레이트:', sampleRate, 'duration:', duration);
    
    let audioData = getMonoChannelData(audioBuffer);
    const originalLength = audioData.length;
    
    // 다운샘플링 (처리 속도 향상을 위해 더 작게)
    const targetSampleRate = 4000;
    if (sampleRate > targetSampleRate) {
      audioData = downsample(audioData, targetSampleRate, sampleRate);
      console.log('다운샘플링:', originalLength, '->', audioData.length);
    }
    
    const dataLength = audioData.length;
    const effectiveSampleRate = sampleRate > targetSampleRate ? targetSampleRate : sampleRate;
    const maxLag = Math.floor((60 / 30) * effectiveSampleRate); // 30 BPM = 2초
    const minLag = Math.floor((60 / 300) * effectiveSampleRate); // 300 BPM = 0.2초
    
    console.log('Lag 범위:', minLag, '-', maxLag, '데이터 길이:', dataLength);
    
    if (dataLength < maxLag * 2) {
      console.warn('데이터가 너무 짧음:', dataLength, '<', maxLag * 2);
      return null; // 데이터가 너무 짧음
    }
    
    // 오디오 데이터 정규화
    const normalized = new Float32Array(dataLength);
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < dataLength; i++) {
      sum += audioData[i];
      sumSq += audioData[i] * audioData[i];
    }
    const mean = sum / dataLength;
    const variance = (sumSq / dataLength) - (mean * mean);
    const stdDev = Math.sqrt(variance);
    
    if (stdDev < 0.001) {
      return null; // 신호가 너무 평탄함
    }
    
    for (let i = 0; i < dataLength; i++) {
      normalized[i] = (audioData[i] - mean) / stdDev;
    }
    
    // Autocorrelation 계산 (성능을 위해 샘플링)
    const step = Math.max(1, Math.floor((maxLag - minLag) / 150)); // 최대 150개 점만 계산
    const correlations: number[] = [];
    const lags: number[] = [];
    
    console.log('Autocorrelation 계산 시작, step:', step);
    
    for (let lag = minLag; lag < maxLag; lag += step) {
      let correlation = 0;
      const computeLength = Math.min(dataLength - lag, Math.floor(dataLength * 0.5));
      
      if (computeLength < 100) break; // 충분한 데이터가 없으면 중단
      
      for (let i = 0; i < computeLength; i++) {
        correlation += normalized[i] * normalized[i + lag];
      }
      
      correlation /= computeLength;
      correlations.push(correlation);
      lags.push(lag);
    }
    
    console.log('Correlation 계산 완료, 피크 개수:', correlations.length);
    
    // 최대 correlation 찾기 (더 관대한 피크 탐지)
    let maxCorrelation = -Infinity;
    let bestLag = 0;
    let peakIndex = -1;
    
    for (let i = 1; i < correlations.length - 1; i++) {
      // 피크 찾기 (이웃보다 높음, 또는 높은 correlation)
      if (correlations[i] > correlations[i - 1] && 
          correlations[i] > correlations[i + 1] && 
          correlations[i] > maxCorrelation) {
        maxCorrelation = correlations[i];
        bestLag = lags[i];
        peakIndex = i;
      }
    }
    
    // 피크가 없으면 최대값 선택
    if (peakIndex === -1) {
      for (let i = 0; i < correlations.length; i++) {
        if (correlations[i] > maxCorrelation) {
          maxCorrelation = correlations[i];
          bestLag = lags[i];
        }
      }
    }
    
    console.log('최대 correlation:', maxCorrelation, 'best lag:', bestLag);
    
    if (bestLag === 0 || maxCorrelation < 0.05) {
      console.warn('유효한 correlation을 찾을 수 없음');
      return null;
    }
    
    // BPM 계산
    const periodSeconds = bestLag / effectiveSampleRate;
    const bpm = Math.round(60 / periodSeconds);
    console.log('계산된 BPM:', bpm);
    
    if (!isValidBPM(bpm)) {
      console.warn('유효하지 않은 BPM:', bpm);
      return null;
    }
    
    // 신뢰도 계산 (correlation 기반, 더 관대하게)
    const confidence = Math.min(0.9, Math.max(0.3, maxCorrelation * 3));
    
    const result = {
      bpm,
      confidence: confidence,
      method: 'autocorrelation',
    };
    
    console.log('Autocorrelation 결과:', result);
    return result;
  } catch (error) {
    console.error('Autocorrelation BPM 분석 오류:', error);
    return null;
  }
}

// 알고리즘 3: Spectral Flux 기반 (주파수 도메인 분석)
export function analyzeBPMBySpectralFlux(audioBuffer: AudioBuffer): BPMResult | null {
  try {
    const sampleRate = audioBuffer.sampleRate;
    let audioData = getMonoChannelData(audioBuffer);
    
    // 다운샘플링
    if (sampleRate > 8000) {
      audioData = downsample(audioData, 8000, sampleRate);
    }
    
    // FFT 계산이 복잡하므로 간단한 에너지 기반 접근 사용
    // 실제로는 Web Audio API의 AnalyserNode를 사용해야 하지만
    // OfflineAudioContext에서는 제한적이므로 에너지 기반으로 대체
    return null; // 이 알고리즘은 구현 복잡도로 인해 일단 건너뛰기
  } catch (error) {
    console.error('Spectral Flux BPM 분석 오류:', error);
    return null;
  }
}

// 여러 알고리즘 결과 통합
function combineResults(results: BPMResult[]): BPMResult | null {
  if (results.length === 0) {
    return null;
  }
  
  if (results.length === 1) {
    return results[0];
  }
  
  // BPM 값들이 서로 가까운지 확인 (20 BPM 이내)
  const bpmGroups: { [key: number]: BPMResult[] } = {};
  
  for (const result of results) {
    let grouped = false;
    for (const bpm of Object.keys(bpmGroups).map(Number)) {
      if (Math.abs(result.bpm - bpm) <= 20) {
        // 같은 그룹으로 간주
        const key = Math.round((bpm + result.bpm) / 2 / 10) * 10; // 10단위로 반올림
        if (!bpmGroups[key]) {
          bpmGroups[key] = [];
        }
        bpmGroups[key].push(result);
        grouped = true;
        break;
      }
    }
    
    if (!grouped) {
      const key = Math.round(result.bpm / 10) * 10;
      bpmGroups[key] = [result];
    }
  }
  
  // 가장 많은 결과를 가진 그룹 찾기
  let maxCount = 0;
  let bestGroup: BPMResult[] = [];
  
  for (const group of Object.values(bpmGroups)) {
    if (group.length > maxCount) {
      maxCount = group.length;
      bestGroup = group;
    }
  }
  
  if (bestGroup.length === 0) {
    // 그룹이 없으면 가장 높은 신뢰도 선택
    bestGroup = results.sort((a, b) => b.confidence - a.confidence);
    return bestGroup[0];
  }
  
  // 그룹 내 평균 BPM 계산
  const avgBpm = Math.round(
    bestGroup.reduce((sum, r) => sum + r.bpm, 0) / bestGroup.length
  );
  
  // 그룹 내 평균 신뢰도 계산 (일치하는 알고리즘이 많을수록 신뢰도 증가)
  const avgConfidence = bestGroup.reduce((sum, r) => sum + r.confidence, 0) / bestGroup.length;
  const consensusBonus = (bestGroup.length / results.length) * 0.2; // 일치 보너스
  
  return {
    bpm: avgBpm,
    confidence: Math.min(0.95, avgConfidence + consensusBonus),
    method: `hybrid-${bestGroup.map(r => r.method).join('+')}`,
  };
}

// 하이브리드 BPM 분석 (여러 알고리즘 조합)
export async function analyzeBPMHybrid(
  audioBuffer: AudioBuffer,
  onProgress?: (progress: number) => void
): Promise<BPMResult | null> {
  const results: BPMResult[] = [];
  
  try {
    onProgress?.(0.1);
    
    // 알고리즘 1: Onset Detection
    try {
      const result1 = analyzeBPMByOnsets(audioBuffer);
      onProgress?.(0.3);
      if (result1) {
        console.log('Onset Detection 결과:', result1);
        results.push(result1);
      }
    } catch (error) {
      console.error('Onset Detection 실패:', error);
    }
    
    // 알고리즘 2: Autocorrelation
    try {
      const result2 = analyzeBPMByAutocorrelation(audioBuffer);
      onProgress?.(0.6);
      if (result2) {
        console.log('Autocorrelation 결과:', result2);
        results.push(result2);
      }
    } catch (error) {
      console.error('Autocorrelation 실패:', error);
    }
    
    onProgress?.(0.9);
    
    // 결과 통합
    if (results.length === 0) {
      return null;
    }
    
    const combined = combineResults(results);
    onProgress?.(1.0);
    
    return combined;
  } catch (error) {
    console.error('하이브리드 BPM 분석 오류:', error);
    return null;
  }
}

