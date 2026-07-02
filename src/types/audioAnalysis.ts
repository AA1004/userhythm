export type AudioAnalysisBand = 'sub' | 'low' | 'mid' | 'high' | 'wide' | 'unknown';

export interface AudioAnalysisBeat {
  timeMs: number;
  measure?: number;
  beatInMeasure?: number;
  strength?: number;
  confidence?: number;
}

export interface AudioAnalysisOnset {
  timeMs: number;
  strength?: number;
  band?: AudioAnalysisBand;
  type?: string;
  confidence?: number;
}

export interface AudioAnalysisBandFrame {
  startMs: number;
  endMs: number;
  sub?: number;
  low?: number;
  mid?: number;
  high?: number;
}

export interface AudioAnalysisSection {
  startMs: number;
  endMs: number;
  label?: string;
  energy?: number;
  density?: number;
}

export interface AudioAnalysisData {
  metadata?: {
    version?: number;
    sourceFile?: string;
    durationMs?: number;
    sampleRate?: number;
    analyzer?: string;
    analyzerVersion?: string;
  };
  timing?: {
    estimatedBpm?: number;
    bpmConfidence?: number;
    firstBeatMs?: number;
    offsetMs?: number;
    beatsPerMeasure?: number;
  };
  beats?: AudioAnalysisBeat[];
  onsets?: AudioAnalysisOnset[];
  bands?: AudioAnalysisBandFrame[];
  sections?: AudioAnalysisSection[];
}

