// YouTube 다운로드 및 BPM 분석 서버
import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// yt-dlp 경로 캐시 (서버 시작 시 한 번만 찾음)
let cachedYtdlpPath = null;

// yt-dlp 경로 찾기 함수
async function findYtDlpPath() {
  // 이미 찾았으면 캐시된 경로 반환
  if (cachedYtdlpPath) {
    return cachedYtdlpPath;
  }

  console.log('yt-dlp 경로 찾는 중...');
  
  // 1. PATH에서 찾기 (where/which 명령어 사용)
  try {
    const findCommand = process.platform === 'win32' ? 'where yt-dlp' : 'which yt-dlp';
    const { stdout } = await execAsync(findCommand, { timeout: 3000 });
    const foundPath = stdout.trim().split('\n')[0].trim();
    if (foundPath) {
      // 버전 확인으로 검증
      await execAsync(`"${foundPath}" --version`, { timeout: 5000 });
      cachedYtdlpPath = foundPath;
      console.log(`✅ yt-dlp 경로 발견 (PATH): ${foundPath}`);
      return foundPath;
    }
  } catch (error) {
    console.log(`PATH에서 찾기 실패: ${error.message}`);
  }
  
  // 2. 직접 실행 시도 (PATH에 있으면 작동)
  try {
    await execAsync('yt-dlp --version', { timeout: 5000 });
    cachedYtdlpPath = 'yt-dlp';
    console.log('✅ yt-dlp가 PATH에서 직접 실행 가능');
    return 'yt-dlp';
  } catch (error) {
    console.log(`직접 실행 실패: ${error.message}`);
  }
  
  // 3. Windows에서 일반적인 설치 경로 확인
  if (process.platform === 'win32') {
    const possiblePaths = [
      'yt-dlp.exe',
      path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe', 'yt-dlp.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages', 'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe', 'yt-dlp.exe'),
      path.join(process.env.ProgramFiles || '', 'yt-dlp', 'yt-dlp.exe'),
      path.join(process.env['ProgramFiles(x86)'] || '', 'yt-dlp', 'yt-dlp.exe'),
      path.join(process.env.USERPROFILE || '', '.local', 'bin', 'yt-dlp.exe'),
      path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'yt-dlp', 'yt-dlp.exe'),
    ];
    
    for (const ytdlpPath of possiblePaths) {
      try {
        await execAsync(`"${ytdlpPath}" --version`, { timeout: 5000 });
        cachedYtdlpPath = ytdlpPath;
        console.log(`✅ yt-dlp 경로 발견: ${ytdlpPath}`);
        return ytdlpPath;
      } catch (error) {
        // 다음 경로 시도
      }
    }
  }
  
  console.log('❌ yt-dlp를 찾을 수 없습니다.');
  return null;
}

// YouTube 영상 다운로드 및 오디오 추출
app.post('/api/youtube/download', async (req, res) => {
  try {
    const { videoId } = req.body;
    
    if (!videoId) {
      return res.status(400).json({ error: 'Video ID가 필요합니다.' });
    }

    // yt-dlp는 %(ext)s를 사용하면 확장자를 자동으로 결정하므로 정확한 확장자 사용
    // 하지만 출력 파일 이름에 .mp4를 명시적으로 지정
    const outputPath = path.join(__dirname, 'downloads', `${videoId}.%(ext)s`);
    const finalOutputPath = path.join(__dirname, 'downloads', `${videoId}.mp4`);
    const outputDir = path.dirname(finalOutputPath);

    // downloads 디렉토리가 없으면 생성
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // yt-dlp 경로 가져오기 (캐시된 경로 사용 또는 다시 찾기)
    let ytdlpCommand = await findYtDlpPath();
    
    if (!ytdlpCommand) {
      return res.status(500).json({ 
        error: 'yt-dlp를 찾을 수 없습니다.\n\n설치 방법:\n1. Windows: winget install yt-dlp\n2. Python이 설치되어 있다면: pip install yt-dlp\n3. 또는 https://github.com/yt-dlp/yt-dlp/releases 에서 다운로드 후 PATH에 추가\n\n설치 후 터미널에서 "yt-dlp --version" 명령어로 확인하세요.' 
      });
    }
    
    // yt-dlp 명령어: 출력 파일명에 %(ext)s를 사용하여 확장자를 자동 결정
    // 하지만 최종 파일명은 mp4로 고정
    const command = `"${ytdlpCommand}" -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" -o "${outputPath}" --no-playlist "https://www.youtube.com/watch?v=${videoId}"`;
    
    console.log(`다운로드 시작: ${videoId}`);
    console.log(`사용할 명령어: ${command}`);
    let stdout, stderr;
    try {
      const result = await execAsync(command, { timeout: 300000 }); // 5분 타임아웃
      stdout = result.stdout;
      stderr = result.stderr;
      console.log(`yt-dlp 출력:\n${stdout}`);
      if (stderr) {
        console.log(`yt-dlp 오류 출력:\n${stderr}`);
      }
    } catch (error) {
      console.error('yt-dlp 실행 오류:', error);
      const errorMessage = error.message || error.toString();
      const errorStdout = error.stdout || '';
      const errorStderr = error.stderr || '';
      
      console.error('오류 상세:', {
        command: command,
        errorMessage,
        errorStdout,
        errorStderr,
        ytdlpPath: ytdlpCommand,
      });
      
      // yt-dlp를 찾지 못한 경우
      if (errorMessage.includes('명령을 찾을 수 없습니다') || 
          errorMessage.includes('not found') || 
          errorMessage.includes('not recognized') ||
          errorMessage.includes('is not recognized')) {
        // 캐시 초기화하고 다시 찾기 시도
        cachedYtdlpPath = null;
        return res.status(500).json({ 
          error: `yt-dlp를 찾을 수 없습니다. (경로: ${ytdlpCommand})\n\n설치 방법:\n1. Windows: winget install yt-dlp\n2. Python이 설치되어 있다면: pip install yt-dlp\n3. 또는 https://github.com/yt-dlp/yt-dlp/releases 에서 다운로드 후 PATH에 추가\n\n서버를 재시작하면 자동으로 다시 찾습니다.` 
        });
      }
      
      // 기타 오류
      return res.status(500).json({ error: `다운로드 실패: ${errorMessage}` });
    }
    
    // 다운로드된 파일 찾기 (yt-dlp가 실제로 생성한 파일명 찾기)
    let downloadedFile = null;
    
    // 1. 예상 경로 확인 (mp4)
    if (fs.existsSync(finalOutputPath)) {
      downloadedFile = finalOutputPath;
    } else {
      // 2. downloads 디렉토리에서 videoId로 시작하는 파일 찾기
      try {
        const files = fs.readdirSync(outputDir);
        const matchingFiles = files.filter(file => 
          file.startsWith(videoId) && 
          (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv'))
        );
        
        if (matchingFiles.length > 0) {
          downloadedFile = path.join(outputDir, matchingFiles[0]);
          console.log(`다운로드된 파일 발견: ${downloadedFile}`);
        } else {
          console.log(`다운로드된 파일을 찾을 수 없습니다. 디렉토리 내용:`, files);
        }
      } catch (error) {
        console.error('디렉토리 읽기 오류:', error);
      }
    }
    
    if (downloadedFile && fs.existsSync(downloadedFile)) {
      // 파일 통계 확인
      const stats = fs.statSync(downloadedFile);
      console.log(`파일 다운로드 성공: ${downloadedFile} (크기: ${stats.size} bytes)`);
      
      // 파일을 읽어서 전송
      const fileStream = fs.createReadStream(downloadedFile);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${videoId}.mp4"`);
      res.setHeader('Content-Length', stats.size.toString());
      
      fileStream.pipe(res);
      
      // 전송 완료 후 파일 삭제
      fileStream.on('end', () => {
        setTimeout(() => {
          try {
            if (fs.existsSync(downloadedFile)) {
              fs.unlinkSync(downloadedFile);
              console.log(`임시 파일 삭제: ${downloadedFile}`);
            }
          } catch (error) {
            console.error('파일 삭제 오류:', error);
          }
        }, 1000);
      });
    } else {
      console.error('파일 다운로드 실패: 파일을 찾을 수 없습니다.');
      console.error(`예상 경로: ${finalOutputPath}`);
      console.error(`디렉토리: ${outputDir}`);
      res.status(500).json({ 
        error: `파일 다운로드 실패: 다운로드된 파일을 찾을 수 없습니다.\n\n출력: ${stdout}\n오류: ${stderr}` 
      });
    }
  } catch (error) {
    console.error('다운로드 오류:', error);
    res.status(500).json({ error: error.message });
  }
});

// Spotify API로 BPM 조회
app.post('/api/spotify/bpm', async (req, res) => {
  try {
    const { artist, title } = req.body;
    
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: '곡명이 필요합니다.' });
    }
    
    // artist가 없으면 빈 문자열로 처리
    const cleanArtist = (artist || '').trim();
    const cleanTitle = title.trim();
    
    console.log(`📝 Spotify BPM 요청: artist="${cleanArtist}", title="${cleanTitle}"`);

    // Spotify Client Credentials Flow로 토큰 가져오기
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.log('Spotify API 키가 설정되지 않았습니다. 환경 변수 SPOTIFY_CLIENT_ID와 SPOTIFY_CLIENT_SECRET을 설정하세요.');
      return res.status(503).json({ error: 'Spotify API가 설정되지 않았습니다.' });
    }

    // 1. 액세스 토큰 가져오기
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenResponse.ok) {
      console.error('Spotify 토큰 요청 실패:', tokenResponse.status, tokenResponse.statusText);
      return res.status(500).json({ error: 'Spotify 인증 실패' });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 2. 트랙 검색 (여러 방법 시도)
    let searchData = null;
    let trackId = null;
    let searchResponse = null;
    
    // 방법 1: 정확한 검색 (artist:name track:title) - artist가 있을 때만
    if (cleanArtist) {
      // 대소문자 구분 없이 검색하기 위해 따옴표로 감싸기
      const searchQuery1 = `artist:"${cleanArtist}" track:"${cleanTitle}"`;
      console.log(`🔍 검색 방법 1 (정확 검색): ${searchQuery1}`);
      searchResponse = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery1)}&type=track&limit=5`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (searchResponse.ok) {
        searchData = await searchResponse.json();
        if (searchData.tracks && searchData.tracks.items && searchData.tracks.items.length > 0) {
          trackId = searchData.tracks.items[0].id;
          console.log(`✅ 방법 1 성공: ${searchData.tracks.items[0].name} - ${searchData.tracks.items[0].artists[0].name}`);
        }
      } else {
        console.warn(`방법 1 실패: ${searchResponse.status} ${searchResponse.statusText}`);
      }
    }

    // 방법 2: 제목과 아티스트를 일반 검색어로 (정확한 검색 실패 시)
    if (!trackId && cleanArtist) {
      const searchQuery2 = `${cleanArtist} ${cleanTitle}`;
      console.log(`🔍 검색 방법 2 (일반 검색): ${searchQuery2}`);
      searchResponse = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery2)}&type=track&limit=5`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (searchResponse.ok) {
        searchData = await searchResponse.json();
        if (searchData.tracks && searchData.tracks.items && searchData.tracks.items.length > 0) {
          trackId = searchData.tracks.items[0].id;
          console.log(`✅ 방법 2 성공: ${searchData.tracks.items[0].name} - ${searchData.tracks.items[0].artists[0].name}`);
        }
      } else {
        console.warn(`방법 2 실패: ${searchResponse.status} ${searchResponse.statusText}`);
      }
    }

    // 방법 3: 제목만으로 검색 (아티스트 이름이 정확하지 않을 수 있음)
    if (!trackId) {
      // 제목만 검색
      const searchQuery3 = cleanArtist ? `track:${cleanTitle}` : cleanTitle;
      console.log(`🔍 검색 방법 3 (제목만): ${searchQuery3}`);
      searchResponse = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery3)}&type=track&limit=10`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (searchResponse.ok) {
        searchData = await searchResponse.json();
        if (searchData.tracks && searchData.tracks.items && searchData.tracks.items.length > 0) {
          // 아티스트가 있으면 아티스트 이름이 부분적으로 일치하는 곡 찾기
          if (cleanArtist) {
            const lowerArtist = cleanArtist.toLowerCase();
            const matchingTrack = searchData.tracks.items.find(track => 
              track.artists.some(a => a.name.toLowerCase().includes(lowerArtist) || 
                                    lowerArtist.includes(a.name.toLowerCase()))
            );
            
            if (matchingTrack) {
              trackId = matchingTrack.id;
              console.log(`✅ 방법 3 성공 (아티스트 매칭): ${matchingTrack.name} - ${matchingTrack.artists[0].name}`);
            }
          }
          
          // 매칭되는 게 없으면 첫 번째 곡 사용
          if (!trackId) {
            trackId = searchData.tracks.items[0].id;
            console.log(`✅ 방법 3 성공 (첫 번째 결과): ${searchData.tracks.items[0].name} - ${searchData.tracks.items[0].artists[0].name}`);
          }
        }
      } else {
        console.warn(`방법 3 실패: ${searchResponse.status} ${searchResponse.statusText}`);
      }
    }
    
    if (!trackId || !searchData) {
      console.error('❌ Spotify에서 트랙을 찾을 수 없습니다.');
      console.error('   검색어:', { artist: cleanArtist, title: cleanTitle });
      return res.status(404).json({ error: '트랙을 찾을 수 없습니다.' });
    }

    console.log(`✅ 트랙 ID 찾음: ${trackId}`);
    
    // 3. Audio Features 가져오기 (BPM 포함) - trackId는 이미 설정됨
    console.log(`🔍 Audio Features 요청: trackId=${trackId}`);
    const featuresResponse = await fetch(
      `https://api.spotify.com/v1/audio-features/${trackId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!featuresResponse.ok) {
      const errorText = await featuresResponse.text();
      console.error('❌ Spotify Audio Features 요청 실패:');
      console.error('   상태 코드:', featuresResponse.status);
      console.error('   상태 텍스트:', featuresResponse.statusText);
      console.error('   응답 본문:', errorText);
      console.error('   trackId:', trackId);
      
      // 에러 상세 정보 반환
      try {
        const errorData = JSON.parse(errorText);
        return res.status(500).json({ 
          error: 'Audio Features 조회 실패',
          details: errorData.error?.message || errorText,
          status: featuresResponse.status
        });
      } catch (e) {
        return res.status(500).json({ 
          error: 'Audio Features 조회 실패',
          details: errorText,
          status: featuresResponse.status
        });
      }
    }

    const featuresData = await featuresResponse.json();
    
    console.log('📊 Audio Features 응답:', {
      tempo: featuresData?.tempo,
      hasTempo: !!featuresData?.tempo,
      tempoValue: featuresData?.tempo
    });
    
    if (featuresData && featuresData.tempo && featuresData.tempo > 0) {
      const foundTrack = searchData.tracks.items.find(t => t.id === trackId) || searchData.tracks.items[0];
      console.log(`✅ Spotify BPM 발견: ${featuresData.tempo} BPM`);
      console.log(`   트랙: ${foundTrack.name} - ${foundTrack.artists[0].name}`);
      return res.json({
        bpm: Math.round(featuresData.tempo),
        confidence: 0.95,
        track: {
          name: foundTrack.name,
          artist: foundTrack.artists[0].name,
        },
      });
    }

    console.warn('⚠️ Audio Features에 tempo 정보가 없음:', featuresData);
    return res.status(404).json({ 
      error: 'BPM 정보를 찾을 수 없습니다.',
      details: 'Audio Features에 tempo 값이 없습니다.'
    });
  } catch (error) {
    console.error('Spotify API 오류:', error);
    return res.status(500).json({ error: error.message || 'Spotify API 오류' });
  }
});

// 서버 상태 확인
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, async () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  
  // 서버 시작 시 yt-dlp 경로 찾기
  const foundPath = await findYtDlpPath();
  if (foundPath) {
    console.log(`✅ yt-dlp 사용 준비 완료: ${foundPath}`);
  } else {
    console.log('⚠️  yt-dlp를 찾을 수 없습니다. YouTube 다운로드 기능을 사용하려면 설치가 필요합니다.');
  }
  
  // Spotify API 키 확인
  const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
  const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (spotifyClientId && spotifyClientSecret) {
    console.log(`✅ Spotify API 사용 준비 완료 (Client ID: ${spotifyClientId.substring(0, 10)}...)`);
  } else {
    console.log('⚠️  Spotify API 키가 설정되지 않았습니다. .env 파일에 SPOTIFY_CLIENT_ID와 SPOTIFY_CLIENT_SECRET을 설정하세요.');
    console.log('    Spotify API 없이도 다른 BPM 소스(The AudioDB 등)를 사용할 수 있습니다.');
  }
});
