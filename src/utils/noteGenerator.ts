import { Note, Lane } from '../types/game';

export function generateNotes(duration: number): Note[] {
  const notes: Note[] = [];
  const lanes: Lane[] = [0, 1, 2, 3];
  const minInterval = 400;
  const longNoteChance = 0.3;
  const minLongDuration = 500;
  const maxLongDuration = 2000;

  let currentTime = 1000;
  let id = 0;

  while (currentTime < duration - 2000) {
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    const isHold = Math.random() < longNoteChance;

    if (isHold) {
      const holdDuration =
        minLongDuration + Math.random() * (maxLongDuration - minLongDuration);
      notes.push({
        id: id++,
        lane,
        time: currentTime,
        duration: holdDuration,
        endTime: currentTime + holdDuration,
        type: 'hold',
        y: 0,
        hit: false,
      });
      currentTime += holdDuration + minInterval;
    } else {
      notes.push({
        id: id++,
        lane,
        time: currentTime,
        duration: 0,
        endTime: currentTime,
        type: 'tap',
        y: 0,
        hit: false,
      });
      currentTime += minInterval + Math.random() * 400;
    }
  }

  return notes.sort((a, b) => a.time - b.time);
}
