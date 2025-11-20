// yt-dlp 설치 확인 스크립트
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function checkYtDlp() {
  console.log('yt-dlp 설치 확인 중...\n');
  
  // 1. PATH에서 찾기
  try {
    const findCommand = process.platform === 'win32' ? 'where yt-dlp' : 'which yt-dlp';
    const { stdout } = await execAsync(findCommand);
    const foundPath = stdout.trim().split('\n')[0];
    if (foundPath) {
      console.log(`✅ PATH에서 발견: ${foundPath}`);
      
      // 버전 확인
      try {
        const { stdout: version } = await execAsync(`"${foundPath}" --version`);
        console.log(`✅ 버전: ${version.trim()}`);
        console.log('\n✅ yt-dlp가 정상적으로 설치되어 있습니다!');
        return true;
      } catch (error) {
        console.log(`❌ 실행 실패: ${error.message}`);
      }
    }
  } catch {
    console.log('❌ PATH에서 yt-dlp를 찾을 수 없습니다.');
  }
  
  // 2. 직접 실행 시도
  try {
    const { stdout: version } = await execAsync('yt-dlp --version');
    console.log(`✅ 직접 실행 가능 - 버전: ${version.trim()}`);
    console.log('\n✅ yt-dlp가 정상적으로 설치되어 있습니다!');
    return true;
  } catch {
    console.log('❌ yt-dlp를 직접 실행할 수 없습니다.');
  }
  
  console.log('\n❌ yt-dlp를 찾을 수 없습니다.');
  console.log('\n설치 방법:');
  console.log('1. Windows: winget install yt-dlp');
  console.log('2. Python이 있다면: pip install yt-dlp');
  console.log('3. 또는 https://github.com/yt-dlp/yt-dlp/releases 에서 다운로드');
  
  return false;
}

checkYtDlp();

