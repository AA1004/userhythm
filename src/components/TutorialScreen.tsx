import React, { useState } from 'react';
import { CHART_EDITOR_THEME } from './ChartEditor/constants';

interface TutorialScreenProps {
  onClose: () => void;
}

type TabType = 'controls' | 'rules' | 'judgment' | 'editor';

const TABS: { id: TabType; label: string }[] = [
  { id: 'controls', label: '기본 조작' },
  { id: 'rules', label: '게임 규칙' },
  { id: 'judgment', label: '판정 시스템' },
  { id: 'editor', label: '에디터 사용법' },
];

export const TutorialScreen: React.FC<TutorialScreenProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('controls');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: CHART_EDITOR_THEME.backgroundGradient,
        backgroundColor: CHART_EDITOR_THEME.rootBackground,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10000,
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: '24px',
            fontWeight: 'bold',
            background: CHART_EDITOR_THEME.titleGradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          도움말
        </h1>
        <button
          onClick={onClose}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            backgroundColor: CHART_EDITOR_THEME.danger,
            color: CHART_EDITOR_THEME.textPrimary,
            border: 'none',
            borderRadius: CHART_EDITOR_THEME.radiusMd,
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          닫기
        </button>
      </div>

      {/* 탭 네비게이션 */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          padding: '16px 24px',
          borderBottom: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              backgroundColor:
                activeTab === tab.id
                  ? CHART_EDITOR_THEME.accentSoft
                  : 'transparent',
              color:
                activeTab === tab.id
                  ? CHART_EDITOR_THEME.accent
                  : CHART_EDITOR_THEME.textSecondary,
              border: `1px solid ${
                activeTab === tab.id
                  ? CHART_EDITOR_THEME.accent
                  : CHART_EDITOR_THEME.borderSubtle
              }`,
              borderRadius: CHART_EDITOR_THEME.radiusMd,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 컨텐츠 영역 */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px',
        }}
      >
        {activeTab === 'controls' && <ControlsContent />}
        {activeTab === 'rules' && <RulesContent />}
        {activeTab === 'judgment' && <JudgmentContent />}
        {activeTab === 'editor' && <EditorContent />}
      </div>
    </div>
  );
};

// 기본 조작 탭
const ControlsContent: React.FC = () => (
  <div style={{ maxWidth: '800px', margin: '0 auto' }}>
    <Section title="키 바인딩">
      <p>게임은 4개의 레인으로 구성되어 있으며, 각 레인에 해당하는 키를 눌러 노트를 처리합니다.</p>
      <KeyBindingDisplay />
      <p style={{ marginTop: '16px', color: CHART_EDITOR_THEME.textSecondary }}>
        키 바인딩은 메인 메뉴의 <strong>설정</strong>에서 변경할 수 있습니다.
      </p>
    </Section>

    <Section title="게임 시작/종료">
      <ul style={{ lineHeight: 1.8 }}>
        <li><strong>플레이</strong> 버튼을 눌러 채보 목록에서 곡을 선택합니다.</li>
        <li>게임 중 <strong>ESC</strong> 키를 눌러 나갈 수 있습니다.</li>
        <li>게임이 끝나면 결과 화면이 표시됩니다.</li>
      </ul>
    </Section>
  </div>
);

// 게임 규칙 탭
const RulesContent: React.FC = () => (
  <div style={{ maxWidth: '800px', margin: '0 auto' }}>
    <Section title="노트 종류">
      <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
        <NoteTypeCard
          title="탭 노트"
          color="#FF6B6B"
          description="노트가 판정선에 도달했을 때 해당 키를 한 번 누릅니다."
        />
        <NoteTypeCard
          title="롱노트"
          color="#4ECDC4"
          description="노트가 판정선에 도달했을 때 키를 누르고, 노트가 끝날 때까지 누르고 있다가 뗍니다."
        />
      </div>
    </Section>

    <Section title="판정선">
      <p>
        화면 하단에 있는 <strong style={{ color: CHART_EDITOR_THEME.accent }}>판정선</strong>에
        노트가 도달하는 타이밍에 맞춰 키를 누르세요.
      </p>
      <p style={{ color: CHART_EDITOR_THEME.textSecondary }}>
        판정선의 위치는 설정에서 조절할 수 있습니다.
      </p>
    </Section>

    <Section title="노트 속도">
      <p>
        노트가 떨어지는 속도는 설정에서 조절할 수 있습니다.
        속도를 높이면 노트가 더 빠르게 떨어지지만, 반응할 시간이 짧아집니다.
      </p>
    </Section>
  </div>
);

// 판정 시스템 탭
const JudgmentContent: React.FC = () => (
  <div style={{ maxWidth: '800px', margin: '0 auto' }}>
    <Section title="판정 등급">
      <p>키를 누른 타이밍에 따라 다음 판정이 적용됩니다:</p>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '16px' }}>
        <JudgeCard judge="PERFECT" color="#FFD700" timing="±40ms" score="100%" />
        <JudgeCard judge="GREAT" color="#00FF00" timing="±80ms" score="80%" />
        <JudgeCard judge="GOOD" color="#00BFFF" timing="±120ms" score="50%" />
        <JudgeCard judge="MISS" color="#FF4500" timing="놓침" score="0%" />
      </div>
    </Section>

    <Section title="콤보 시스템">
      <p>
        연속으로 노트를 성공적으로 처리하면 <strong>콤보</strong>가 쌓입니다.
      </p>
      <ul style={{ lineHeight: 1.8 }}>
        <li>PERFECT, GREAT, GOOD 판정 시 콤보가 1 증가합니다.</li>
        <li>MISS 시 콤보가 0으로 초기화됩니다.</li>
        <li>높은 콤보를 유지하면 더 높은 점수를 얻을 수 있습니다.</li>
      </ul>
    </Section>

    <Section title="정확도">
      <p>
        게임 종료 후 표시되는 정확도는 각 판정의 가중치를 기반으로 계산됩니다.
      </p>
      <p style={{ color: CHART_EDITOR_THEME.textSecondary }}>
        정확도 = (PERFECT×100 + GREAT×80 + GOOD×50) / (전체 노트 × 100)
      </p>
    </Section>
  </div>
);

// 에디터 사용법 탭
const EditorContent: React.FC = () => (
  <div style={{ maxWidth: '800px', margin: '0 auto' }}>
    <Section title="채보 에디터 접근">
      <p>
        메인 메뉴에서 <strong>채보 만들기</strong> 버튼을 눌러 에디터에 접근할 수 있습니다.
      </p>
      <p style={{ color: CHART_EDITOR_THEME.textSecondary }}>
        로그인이 필요하며, 권한이 있는 사용자만 채보를 만들 수 있습니다.
      </p>
    </Section>

    <Section title="기본 조작">
      <ul style={{ lineHeight: 1.8 }}>
        <li><strong>클릭</strong>: 타임라인에서 노트 배치/선택</li>
        <li><strong>드래그</strong>: 롱노트 생성 또는 노트 이동</li>
        <li><strong>Delete/Backspace</strong>: 선택한 노트 삭제</li>
        <li><strong>Ctrl+C/V</strong>: 노트 복사/붙여넣기</li>
        <li><strong>Ctrl+Z/Y</strong>: 실행 취소/다시 실행</li>
        <li><strong>Space</strong>: 재생/일시정지</li>
      </ul>
    </Section>

    <Section title="테스트 플레이">
      <p>
        에디터 상단의 <strong>테스트</strong> 버튼을 눌러 현재 채보를 테스트할 수 있습니다.
      </p>
      <ul style={{ lineHeight: 1.8 }}>
        <li>시작 위치와 재생 속도를 설정할 수 있습니다.</li>
        <li>테스트 중 ESC를 눌러 에디터로 돌아갈 수 있습니다.</li>
      </ul>
    </Section>

    <Section title="채보 저장">
      <p>
        <strong>저장</strong> 버튼을 눌러 채보를 서버에 저장합니다.
      </p>
      <p style={{ color: CHART_EDITOR_THEME.textSecondary }}>
        작업 중인 내용은 자동으로 로컬에 임시 저장됩니다.
      </p>
    </Section>
  </div>
);

// 공통 컴포넌트들
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div style={{ marginBottom: '32px' }}>
    <h2
      style={{
        fontSize: '18px',
        fontWeight: 'bold',
        color: CHART_EDITOR_THEME.textPrimary,
        marginBottom: '16px',
        paddingBottom: '8px',
        borderBottom: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
      }}
    >
      {title}
    </h2>
    <div style={{ color: CHART_EDITOR_THEME.textPrimary, lineHeight: 1.6 }}>
      {children}
    </div>
  </div>
);

const KeyBindingDisplay: React.FC = () => {
  const keys = ['D', 'F', 'J', 'K'];
  return (
    <div
      style={{
        display: 'flex',
        gap: '16px',
        justifyContent: 'center',
        marginTop: '16px',
      }}
    >
      {keys.map((key, index) => (
        <div
          key={key}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div
            style={{
              width: '60px',
              height: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
              border: `2px solid ${CHART_EDITOR_THEME.borderSubtle}`,
              borderRadius: '8px',
              fontSize: '24px',
              fontWeight: 'bold',
              color: CHART_EDITOR_THEME.textPrimary,
            }}
          >
            {key}
          </div>
          <span style={{ color: CHART_EDITOR_THEME.textSecondary, fontSize: '12px' }}>
            레인 {index + 1}
          </span>
        </div>
      ))}
    </div>
  );
};

const NoteTypeCard: React.FC<{
  title: string;
  color: string;
  description: string;
}> = ({ title, color, description }) => (
  <div
    style={{
      flex: '1 1 200px',
      padding: '16px',
      backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
      borderRadius: CHART_EDITOR_THEME.radiusMd,
      border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '12px',
      }}
    >
      <div
        style={{
          width: '24px',
          height: '24px',
          backgroundColor: color,
          borderRadius: '6px',
        }}
      />
      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>{title}</h3>
    </div>
    <p style={{ margin: 0, color: CHART_EDITOR_THEME.textSecondary, fontSize: '14px' }}>
      {description}
    </p>
  </div>
);

const JudgeCard: React.FC<{
  judge: string;
  color: string;
  timing: string;
  score: string;
}> = ({ judge, color, timing, score }) => (
  <div
    style={{
      padding: '12px 16px',
      backgroundColor: CHART_EDITOR_THEME.surfaceElevated,
      borderRadius: CHART_EDITOR_THEME.radiusMd,
      border: `1px solid ${CHART_EDITOR_THEME.borderSubtle}`,
      textAlign: 'center',
      minWidth: '100px',
    }}
  >
    <div
      style={{
        fontSize: '16px',
        fontWeight: 'bold',
        color: color,
        marginBottom: '8px',
      }}
    >
      {judge}
    </div>
    <div style={{ fontSize: '12px', color: CHART_EDITOR_THEME.textSecondary }}>
      {timing}
    </div>
    <div style={{ fontSize: '14px', color: CHART_EDITOR_THEME.textPrimary, marginTop: '4px' }}>
      {score}
    </div>
  </div>
);
