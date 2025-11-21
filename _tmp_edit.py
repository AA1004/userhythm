from pathlib import Path

path = Path('src/components/ChartEditor.tsx')
text = path.read_text(encoding='utf-8')

old_snap = """  const snapToGrid = useCallback(

    (time: number): number => {

      if (!beatDuration || beatDuration <= 0) {

        return Math.max(0, time);

      }

      const safeDivision = Math.max(1, gridDivision);

      const gridInterval = beatDuration / safeDivision;

      if (!gridInterval || !isFinite(gridInterval)) {

        return Math.max(0, time);

      }

      const snappedTime = Math.round(time / gridInterval) * gridInterval;

      return Math.max(0, snappedTime);

    },

    [beatDuration, gridDivision]

  );


""".replace('\n', '\r\n')
new_snap = """  const snapToGrid = useCallback(
    (time: number): number => {
      if (!beatDuration || beatDuration <= 0) {
        return Math.max(0, time);
      }
      const safeDivision = Math.max(1, gridDivision);
      const gridInterval = beatDuration / safeDivision;
      if (!gridInterval || !isFinite(gridInterval)) {
        return Math.max(0, time);
      }
      const snappedTime = Math.round(time / gridInterval) * gridInterval;
      return Math.max(0, snappedTime);
    },
    [beatDuration, gridDivision]
  );

""".replace('\n', '\r\n')
if old_snap not in text:
    raise SystemExit('old snap block not found')
text = text.replace(old_snap, new_snap, 1)

old_add = """  const addNote = useCallback(

    (lane: Lane, time: number) => {

      const snappedTime = snapToGrid(time);



      setNotes((prev) => {

        const hasNote = prev.some(

          (note) => note.lane === lane && Math.abs(note.time - snappedTime) < 1

        );

        if (hasNote) return prev;



        const isHold = noteInputMode === 'hold';

        let endTime: number | undefined;

        if (isHold) {

          const duration = holdDurationMs || 500;

          endTime = snapToGrid(snappedTime + duration);

          if (endTime <= snappedTime) {

            endTime = snappedTime + duration;

          }

        }



        const newNote: Note = {

          id: noteIdRef.current++,

          lane,

          type: isHold ? 'hold' : 'tap',

          time: snappedTime,

          endTime,

          y: 0,

          hit: false,

        };

        return [...prev, newNote].sort((a, b) => a.time - b.time);

      });

    },

    [snapToGrid, noteInputMode, holdDurationMs]

  );

""".replace('\n', '\r\n')
new_add = """  const addNote = useCallback(
    (lane: Lane, time: number) => {
      const snappedTime = snapToGrid(time);

      setNotes((prev) => {
        const hasNote = prev.some(
          (note) => note.lane === lane && Math.abs(note.time - snappedTime) < 1
        );
        if (hasNote) return prev;

        const isHold = noteInputMode === 'hold';
        let endTime: number | undefined;
        if (isHold) {
          const duration = holdDurationMs || 500;
          endTime = snapToGrid(snappedTime + duration);
          if (endTime <= snappedTime) {
            endTime = snappedTime + duration;
          }
        }

        const newNote: Note = {
          id: noteIdRef.current++,
          lane,
          type: isHold ? 'hold' : 'tap',
          time: snappedTime,
          endTime,
          y: 0,
          hit: false,
        };
        return [...prev, newNote].sort((a, b) => a.time - b.time);
      });
    },
    [snapToGrid, noteInputMode, holdDurationMs]
  );

""".replace('\n', '\r\n')
if old_add not in text:
    raise SystemExit('old add block not found')
text = text.replace(old_add, new_add, 1)

path.write_text(text, encoding='utf-8')
