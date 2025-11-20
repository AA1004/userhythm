import { Note, Lane } from '../types/game';

const BPM = 120; // 비트/분
const BEAT_DURATION = (60 / BPM) * 1000; // ms

export function generateNotes(duration: number): Note[] {
  const notes: Note[] = [];
  const numBeats = Math.floor(duration / BEAT_DURATION);
  
  let noteId = 0;
  
  // 4분음표 패턴 생성
  for (let i = 0; i < numBeats; i++) {
    const lane = (i % 4) as Lane; // 순차적으로 레인 배치
    notes.push({
      id: noteId++,
      lane,
      time: i * BEAT_DURATION,
      y: 0,
      hit: false,
    });
  }
  
  // 랜덤 패턴도 추가 (더 재미있게)
  for (let i = 0; i < numBeats / 2; i++) {
    const lane = Math.floor(Math.random() * 4) as Lane;
    const time = Math.random() * duration;
    
    // 이미 가까운 시간에 노트가 있는지 확인
    const hasNearbyNote = notes.some(
      note => Math.abs(note.time - time) < 100
    );
    
    if (!hasNearbyNote) {
      notes.push({
        id: noteId++,
        lane,
        time,
        y: 0,
        hit: false,
      });
    }
  }
  
  // 시간 순으로 정렬
  return notes.sort((a, b) => a.time - b.time);
}

