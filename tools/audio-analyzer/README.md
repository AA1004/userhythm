# Userhythm Local Audio Analyzer

로컬 오디오 파일을 분석해서 Userhythm 채보 에디터에 올릴 수 있는
`.userhythm-analysis.json` 파일을 생성하는 제작 보조 도구입니다.

이 도구는 채보를 자동 확정하지 않습니다. 에디터 타임라인에 beat/onset 마커를
표시해서 제작자가 키음 후보를 빠르게 찾도록 돕는 목적입니다.

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
python analyze.py "song.wav" --mode detailed --output "song.userhythm-analysis.json"
```

## 주요 옵션

- `--bpm`: 자동 BPM 대신 수동 BPM을 사용합니다.
- `--offset-ms`: 분석 결과 전체를 보정합니다. YouTube 음원과 로컬 파일이 다를 때 사용합니다.
- `--sensitivity`: onset 검출 민감도입니다. 높을수록 작은 소리도 더 많이 잡습니다.
- `--min-gap-ms`: 너무 가까운 onset 후보를 줄입니다.
- `--mode`: `fast`, `balanced`, `detailed`.

## 에디터 사용

1. 분석기를 실행해 `.userhythm-analysis.json`을 생성합니다.
2. Userhythm 채보 에디터에서 `분석 불러오기`를 누릅니다.
3. 생성된 분석 JSON을 선택합니다.
4. 타임라인에 beat/onset 마커가 표시됩니다.

## 출력 형식

```json
{
  "metadata": {},
  "timing": {},
  "beats": [],
  "onsets": [],
  "bands": [],
  "sections": []
}
```

현재 에디터 MVP는 `beats`와 `onsets`를 표시합니다.

