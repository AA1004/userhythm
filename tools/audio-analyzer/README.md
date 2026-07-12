# Userhythm Local Audio Analyzer

로컬 오디오 파일을 분석해서 Userhythm 채보 에디터에 올릴 수 있는
`.userhythm-analysis.json` 파일을 생성하는 제작 보조 도구입니다.

이 도구는 키음 후보를 감지해 4레인 단노트 후보를 생성합니다. 결과는 자동 확정
채보가 아니라 검토용 초안이며, 원본 onset/대역 분석도 함께 보존합니다.

## 설치

```powershell
cd tools/audio-analyzer
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

`mp3` 로드가 실패하면 FFmpeg가 필요할 수 있습니다. Windows에서는 winget 또는
공식 빌드로 FFmpeg를 설치한 뒤 PATH에 등록하세요.

## 실행

```powershell
python analyze.py "C:\path\song.mp3"
```

출력:

```text
song.userhythm-analysis.json
```

옵션 예:

```powershell
python analyze.py "song.mp3" --bpm 126 --offset-ms -235 --sensitivity 0.65 --min-gap-ms 70
python analyze.py "song.wav" --mode detailed --note-threshold 0.5 --note-min-gap-ms 120
python analyze.py "song.wav" --bpm 128 --note-snap-subdivision 4 --chart-output "song.userhythm-chart.json"
```

## 주요 옵션

- `--bpm`: 자동 BPM 대신 수동 BPM을 사용합니다.
- `--offset-ms`: 분석 결과 전체를 보정합니다. YouTube 음원과 로컬 파일이 다를 때 사용합니다.
- `--sensitivity`: onset 검출 민감도입니다. 높을수록 작은 소리도 더 많이 잡습니다.
- `--min-gap-ms`: 너무 가까운 onset 후보를 줄입니다.
- `--mode`: `fast`, `balanced`, `detailed`.
- `--note-threshold`: 자동 노트 후보에 쓸 최소 onset 강도입니다. 높이면 노트 수가 줄어듭니다.
- `--note-min-gap-ms`: 자동 노트 후보 사이의 최소 시간 간격입니다.
- `--note-snap-subdivision`: 후보를 박자 단위로 스냅합니다. `4`는 16분음표 단위이며, `0`은 원래 키음 타이밍을 유지합니다.
- `--chart-output`: 자동 생성 노트를 포함한 별도 Userhythm 채보 JSON을 출력합니다.

## 에디터 사용

1. 분석기를 실행해 `.userhythm-analysis.json`을 생성합니다.
2. Userhythm 채보 에디터에서 `분석 불러오기`를 누릅니다.
3. 생성된 분석 JSON을 선택합니다.
4. 타임라인에 beat/onset 마커가 표시됩니다.

`--chart-output`을 사용하면 별도 JSON에 `chart.notes`가 생성됩니다. 분석 JSON의
`noteCandidates`에는 원래 키음 시각, 스냅된 시각, 레인, 강도, 대역, 신뢰도가 포함됩니다.

## 레인 배정 방식

저음은 바깥 레인(0·3), 중음은 안쪽 레인(1·2), 고음은 오른쪽 안쪽에서 교차하도록
배정합니다. 가까운 키음은 강한 하나로 줄이고, 같은 레인 반복도 가능한 한 교차합니다.
완성 믹스만으로 의도된 패턴·동시치기·롱노트를 정확히 복원할 수는 없으므로 결과를
제작 초안으로 검토해야 합니다.

## 출력 형식

```json
{
  "metadata": {},
  "timing": {},
  "beats": [],
  "onsets": [],
  "noteCandidates": [],
  "bands": [],
  "sections": []
}
```

현재 에디터 MVP는 `beats`와 `onsets`를 표시합니다.

