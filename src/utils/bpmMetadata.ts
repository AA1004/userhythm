// 메타데이터 기반 BPM 조회 유틸리티
// 여러 메타데이터 소스를 사용하여 BPM 정보 조회

import { isValidBPM } from './bpmAnalyzer';

export interface MetadataBPMResult {
  bpm: number;
  confidence: number;
  method: 'lastfm' | 'musicbrainz' | 'audiodb' | 'songbpm' | 'spotify';
  source?: string;
}

// BPM 유효성 검증
function validateBPM(bpm: number): boolean {
  return isValidBPM(bpm);
}

// YouTube 제목에서 아티스트와 곡명 추출 (개선된 휴리스틱)
export function extractArtistAndTitle(youtubeTitle: string): { artist: string; title: string } | null {
  // URL인 경우 처리하지 않음 (제목이 아님)
  if (youtubeTitle.includes('http://') || youtubeTitle.includes('https://') || 
      youtubeTitle.includes('youtu.be/') || youtubeTitle.includes('youtube.com/') ||
      youtubeTitle.includes('youtu.be') || youtubeTitle.includes('youtube.com')) {
    console.warn('⚠️ YouTube URL이 입력되었습니다. 제목이 필요합니다.');
    return null;
  }
  
  // 괄호, 대괄호 내용 제거 (예: "[Official MV]", "(Remastered)")
  let cleaned = youtubeTitle
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\【[^\】]*\】/g, '') // 일본어 대괄호
    .replace(/\（[^\）]*\）/g, '') // 일본어 소괄호
    .trim();
  
  // 빈 문자열이면 null 반환
  if (!cleaned || cleaned.length < 3) {
    return null;
  }
  
  // 일반적인 패턴: "Artist - Title" 또는 "Title by Artist"
  const patterns = [
    /^(.+?)\s*-\s*(.+)$/, // "Artist - Title" (가장 일반적)
    /^(.+?)\s+by\s+(.+)$/i, // "Title by Artist"
    /^(.+?)\s*:\s*(.+)$/, // "Artist: Title"
    /^(.+?)\s*【(.+?)】/, // "Artist【Title】" (일본어 패턴)
    /^(.+?)\s*「(.+?)」/, // "Artist「Title」" (일본어 패턴)
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[1] && match[2]) {
      const artist = match[1].trim();
      const title = match[2].trim();
      // 빈 문자열이 아니고 최소 길이 확인
      if (artist && title && artist.length >= 1 && title.length >= 2) {
        return { artist, title };
      }
    }
  }

  // 패턴이 맞지 않으면 전체를 제목으로, 아티스트는 빈 문자열
  const finalTitle = cleaned || youtubeTitle.trim();
  return {
    artist: '',
    title: finalTitle,
  };
}

// Last.fm API로 BPM 조회
async function getBPMFromLastFM(artist: string, title: string): Promise<MetadataBPMResult | null> {
  try {
    // Last.fm API (공개 API, 키 불필요)
    // track.getInfo API 사용
    const response = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=track.getinfo&api_key=YOUR_API_KEY&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&format=json`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
    // Last.fm API는 직접 BPM을 제공하지 않으므로, 다른 방법 사용
    // 대신 MusicBrainz를 통해 조회하거나, 다른 API 사용
    
    return null;
  } catch (error) {
    console.error('Last.fm API 오류:', error);
    return null;
  }
}

// MusicBrainz API로 BPM 조회 (간접적)
async function getBPMFromMusicBrainz(artist: string, title: string): Promise<MetadataBPMResult | null> {
  try {
    // MusicBrainz API로 곡 검색
    const searchResponse = await fetch(
      `https://musicbrainz.org/ws/2/recording?query=artist:"${encodeURIComponent(artist)}" AND recording:"${encodeURIComponent(title)}"&fmt=json&limit=1`
    );

    if (!searchResponse.ok) {
      return null;
    }

    const searchData = await searchResponse.json();
    
    if (!searchData.recordings || searchData.recordings.length === 0) {
      return null;
    }

    // MusicBrainz에서 직접 BPM을 제공하지 않으므로,
    // AcoustID나 다른 서비스를 통해 추가 정보 조회 필요
    
    return null;
  } catch (error) {
    console.error('MusicBrainz API 오류:', error);
    return null;
  }
}

// The AudioDB API로 BPM 조회 시도
async function getBPMFromAudioDB(artist: string, title: string): Promise<MetadataBPMResult | null> {
  try {
    // The AudioDB API 사용
    const response = await fetch(
      `https://www.theaudiodb.com/api/v1/json/2/searchtrack.php?s=${encodeURIComponent(artist)}&t=${encodeURIComponent(title)}`,
      { 
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
    if (data.track && data.track.length > 0 && data.track[0].intBPM) {
      const bpm = parseFloat(data.track[0].intBPM);
      if (validateBPM(bpm)) {
        console.log('✅ The AudioDB에서 BPM 발견:', bpm, `(${artist} - ${title})`);
        return {
          bpm: Math.round(bpm),
          confidence: 0.85,
          method: 'audiodb',
          source: 'The AudioDB',
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('The AudioDB API 오류:', error);
    return null;
  }
}


// Spotify API로 BPM 조회 (서버를 통해)
async function getBPMFromSpotify(artist: string, title: string): Promise<MetadataBPMResult | null> {
  try {
    // 먼저 서버 상태 확인
    try {
      const healthCheck = await fetch('http://localhost:3001/api/health');
      if (!healthCheck.ok) {
        console.warn('⚠️ 서버가 응답하지 않습니다. 서버를 실행 중인지 확인하세요.');
        return null;
      }
    } catch (healthError) {
      console.warn('⚠️ 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.');
      return null;
    }

    const response = await fetch('http://localhost:3001/api/spotify/bpm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ artist, title }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.warn('⚠️ Spotify API 엔드포인트를 찾을 수 없습니다. 서버를 재시작하세요.');
      } else if (response.status === 503) {
        console.warn('⚠️ Spotify API가 설정되지 않았습니다. .env 파일을 확인하세요.');
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.warn(`⚠️ Spotify API 오류 (${response.status}):`, errorData.error || response.statusText);
      }
      return null;
    }

    const data = await response.json();
    
    if (data.bpm && validateBPM(data.bpm)) {
      console.log('✅ Spotify에서 BPM 발견:', data.bpm, `(${artist} - ${title})`);
      return {
        bpm: Math.round(data.bpm),
        confidence: 0.95, // Spotify는 매우 정확한 데이터 제공
        method: 'spotify',
        source: 'Spotify',
      };
    }
    
    return null;
  } catch (error) {
    console.error('Spotify API 오류:', error);
    // 네트워크 오류 등은 조용히 실패하고 다른 소스 시도
    return null;
  }
}

// 하이브리드 메타데이터 기반 BPM 조회
export async function getBPMFromMetadata(youtubeTitle: string): Promise<MetadataBPMResult | null> {
  console.log('메타데이터 BPM 조회 시작:', youtubeTitle);
  
  const extracted = extractArtistAndTitle(youtubeTitle);
  
  if (!extracted) {
    console.warn('아티스트/곡명 추출 실패');
    return null;
  }

  const { artist, title } = extracted;
  console.log('추출된 정보:', { artist, title });

  // 여러 API를 순차적으로 시도
  // 1. Spotify (가장 정확, 우선 시도)
  if (artist && title) {
    console.log('--- Spotify 조회 시도 ---');
    const spotifyResult = await getBPMFromSpotify(artist, title);
    if (spotifyResult) {
      return spotifyResult;
    }
  }
  
  // 2. The AudioDB (BPM 직접 제공)
  console.log('--- The AudioDB 조회 시도 ---');
  const audioDBResult = await getBPMFromAudioDB(artist, title);
  if (audioDBResult) {
    return audioDBResult;
  }
  
  // 아티스트 없이 제목만으로도 시도
  if (artist && title) {
    console.log('--- The AudioDB 조회 시도 (제목만) ---');
    const audioDBTitleOnly = await getBPMFromAudioDB('', title);
    if (audioDBTitleOnly) {
      return audioDBTitleOnly;
    }
  }

  // 3. Last.fm 시도
  const lastFMResult = await getBPMFromLastFM(artist, title);
  if (lastFMResult) {
    return lastFMResult;
  }

  // 4. MusicBrainz 시도
  const musicBrainzResult = await getBPMFromMusicBrainz(artist, title);
  if (musicBrainzResult) {
    return musicBrainzResult;
  }

  console.warn('모든 메타데이터 소스에서 BPM을 찾을 수 없음');
  return null;
}

// YouTube Data API로 제목 가져오기 (선택사항)
export async function getYouTubeTitle(videoId: string): Promise<string | null> {
  try {
    // YouTube Data API v3 사용 (API 키 필요)
    // 공개 API가 아니므로, 클라이언트에서 직접 사용하기 어려움
    // 대신 YouTube IFrame API의 이벤트에서 제목을 가져올 수 있음
    
    return null;
  } catch (error) {
    console.error('YouTube 제목 가져오기 오류:', error);
    return null;
  }
}

