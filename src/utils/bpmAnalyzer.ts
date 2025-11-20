// 간단한 BPM 분석 유틸리티
// 실제 BPM 분석은 복잡하므로, 사용자가 입력하거나 간단한 도구를 제공

export interface BPMAnalysisResult {
  bpm: number;
  confidence?: number;
  method: 'manual' | 'tap' | 'analyzed';
}

// 탭 BPM 계산 (사용자가 버튼을 여러 번 누르면 BPM 계산)
export class TapBPMCalculator {
  private taps: number[] = [];
  private maxTaps = 16;

  tap(): BPMAnalysisResult | null {
    const now = Date.now();
    this.taps.push(now);

    // 오래된 탭 제거 (10초 이상)
    this.taps = this.taps.filter((time) => now - time < 10000);

    // 최대 개수 제한
    if (this.taps.length > this.maxTaps) {
      this.taps.shift();
    }

    if (this.taps.length < 2) {
      return null;
    }

    // 평균 간격 계산
    const intervals: number[] = [];
    for (let i = 1; i < this.taps.length; i++) {
      intervals.push(this.taps[i] - this.taps[i - 1]);
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = Math.round((60 * 1000) / avgInterval);

    // BPM 범위 검증 (30-300 BPM)
    if (bpm < 30 || bpm > 300) {
      return null;
    }

    // 일관성 계산 (표준편차가 작을수록 신뢰도 높음)
    const variance =
      intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) /
      intervals.length;
    const stdDev = Math.sqrt(variance);
    const confidence = Math.max(0, Math.min(1, 1 - stdDev / avgInterval));

    return {
      bpm,
      confidence,
      method: 'tap',
    };
  }

  reset(): void {
    this.taps = [];
  }

  getTapCount(): number {
    return this.taps.length;
  }
}

// BPM 범위 검증
export function isValidBPM(bpm: number): boolean {
  return bpm >= 30 && bpm <= 300;
}

// BPM을 ms 단위 비트 간격으로 변환
export function bpmToBeatDuration(bpm: number): number {
  return (60 / bpm) * 1000;
}

// ms 단위 비트 간격을 BPM으로 변환
export function beatDurationToBPM(duration: number): number {
  return (60 * 1000) / duration;
}

