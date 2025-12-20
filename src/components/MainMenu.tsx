import React from 'react';
import { BrandLogo } from './BrandLogo';

interface MainMenuProps {
  onPlay: () => void;
  onEdit: () => void;
  onAdmin: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onPlay,
  onEdit,
  onAdmin,
  speed,
  onSpeedChange,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        color: '#fff',
        width: '90%',
        maxWidth: '600px',
      }}
    >
      {/* 첫 화면 표시 */}
      <div style={{ marginBottom: '24px', marginTop: '-28px' }}>
        <BrandLogo
          title="UseRhythm"
          tagline="누구나 리듬게임 채보를 만들고 공유하세요"
          size="md"
          markStyle="overlap"
          gradient="linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)"
          strokeColor="rgba(2, 6, 23, 0.95)"
          glow="0 0 40px rgba(102, 126, 234, 0.5)"
        />
      </div>

      {/* 메인 메뉴 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          marginBottom: '48px',
        }}
      >
        <button
          style={{
            padding: '20px 40px',
            fontSize: '22px',
            backgroundColor: '#2196F3',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#1976D2';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(33, 150, 243, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#2196F3';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.3)';
          }}
          onClick={onPlay}
        >
          ▶️ 플레이
        </button>

        <button
          style={{
            padding: '20px 40px',
            fontSize: '22px',
            backgroundColor: '#FF9800',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(255, 152, 0, 0.3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#F57C00';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 152, 0, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#FF9800';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 152, 0, 0.3)';
          }}
          onClick={onEdit}
        >
          ✏️ 채보 만들기
        </button>

        <button
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#9C27B0',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(156, 39, 176, 0.3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#7B1FA2';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(156, 39, 176, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#9C27B0';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(156, 39, 176, 0.3)';
          }}
          onClick={onAdmin}
        >
          🔐 관리자
        </button>
      </div>

      {/* 설정 */}
      <div
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          padding: '24px',
          borderRadius: '12px',
          marginTop: '16px',
        }}
      >
        <h3 style={{ fontSize: '20px', marginBottom: '20px', fontWeight: 'bold' }}>
          ⚙️ 게임 설정
        </h3>

        {/* 속도 조절 슬라이더 */}
        <div
          style={{
            marginBottom: '16px',
            color: '#fff',
          }}
        >
          <label
            style={{
              display: 'block',
              fontSize: '16px',
              marginBottom: '12px',
              fontWeight: '500',
            }}
          >
            노트 속도: {speed.toFixed(1)}x
          </label>
          <input
            type="range"
            min="0.5"
            max="10.0"
            step="0.1"
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            style={{
              width: '100%',
              height: '8px',
              borderRadius: '4px',
              outline: 'none',
              backgroundColor: '#555',
              cursor: 'pointer',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '12px',
              marginTop: '8px',
              color: '#aaa',
            }}
          >
            <span>0.5x</span>
            <span>1.0x</span>
            <span>5.0x</span>
            <span>10.0x</span>
          </div>
        </div>

        <div style={{ fontSize: '14px', color: '#aaa', marginTop: '16px' }}>
          키 조작키: D, F, J, K 키를 사용하세요
        </div>
      </div>
    </div>
  );
};







