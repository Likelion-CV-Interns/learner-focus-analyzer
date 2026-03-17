import { useState } from 'react';
import likelionLogo from '../assets/likelion_logo.png';

const ACCOUNTS = {
  instructor: [
    { id: 'teacher1', pw: '1234', name: '김강사' },
    { id: 'teacher2', pw: '1234', name: '이강사' },
  ],
  manager: [
    { id: 'manager1', pw: '1234', name: '박매니저' },
  ],
};

const s = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #FF6B2B 0%, #FF9A5C 50%, #FFB87A 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    background: '#fff',
    borderRadius: 20,
    padding: '44px 40px',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 24px 80px rgba(0,0,0,0.15)',
  },
  logoBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
    justifyContent: 'center',
  },
  logoImg: {
    height: 44,
    width: 'auto',
    objectFit: 'contain',
    borderRadius: 10,
  },
  logoDivider: { width: 1, height: 32, background: '#DDD' },
  logoText: { fontSize: 17, fontWeight: 700, color: '#1A1A1A', lineHeight: 1.25 },
  logoSub: { fontSize: 11, color: '#888', fontWeight: 400, marginTop: 2 },

  roleBox: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    marginBottom: 24,
  },
  roleBtn: (active) => ({
    padding: '14px 10px',
    borderRadius: 12,
    border: `2px solid ${active ? '#FF6B2B' : '#E8E8E8'}`,
    background: active ? '#FFF5F0' : '#FAFAFA',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s',
  }),
  roleIcon: { fontSize: 26, marginBottom: 4 },
  roleLabel: (active) => ({
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    color: active ? '#FF6B2B' : '#555',
  }),
  roleDesc: { fontSize: 11, color: '#AAA', marginTop: 2 },

  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  dividerLine: { flex: 1, height: 1, background: '#EEE' },
  dividerText: { fontSize: 12, color: '#CCC' },

  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 6 },
  input: {
    width: '100%',
    padding: '12px 14px',
    border: '1.5px solid #E8E8E8',
    borderRadius: 10,
    fontSize: 14,
    color: '#1A1A1A',
    background: '#FAFAFA',
    marginBottom: 14,
    transition: 'border-color 0.2s',
  },
  btn: {
    width: '100%',
    padding: '14px',
    background: 'linear-gradient(135deg, #FF6B2B, #FF8C55)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    marginTop: 6,
    boxShadow: '0 4px 16px rgba(255,107,43,0.35)',
  },
  error: {
    background: '#FEF2F2',
    border: '1px solid #FECACA',
    color: '#EF4444',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13,
    marginBottom: 14,
  },
  hint: { marginTop: 18, textAlign: 'center', fontSize: 11, color: '#CCC', lineHeight: 1.7 },
};

export default function LoginPage({ onLogin }) {
  const [role, setRole] = useState('instructor');
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    const match = ACCOUNTS[role].find(a => a.id === id && a.pw === pw);
    if (match) {
      onLogin({ role, name: match.name, id: match.id });
    } else {
      setError('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
  };

  const roles = [
    { key: 'instructor', icon: '👨‍🏫', label: '강의자', desc: '강의 세션 관리' },
    { key: 'manager', icon: '🧑‍💼', label: '매니저', desc: '전체 현황 모니터링' },
  ];

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logoBox}>
          <img src={likelionLogo} alt="likelion" style={s.logoImg} />
          <div style={s.logoDivider} />
          <div>
            <div style={s.logoText}>학습자 집중도 분석 시스템</div>
            <div style={s.logoSub}>Focus Analyzer · 관리자 전용</div>
          </div>
        </div>

        {/* Role selector */}
        <div style={s.roleBox}>
          {roles.map(r => (
            <button key={r.key} style={s.roleBtn(role === r.key)} onClick={() => { setRole(r.key); setError(''); setId(''); setPw(''); }}>
              <div style={s.roleIcon}>{r.icon}</div>
              <div style={s.roleLabel(role === r.key)}>{r.label}</div>
              <div style={s.roleDesc}>{r.desc}</div>
            </button>
          ))}
        </div>

        <div style={s.divider}>
          <div style={s.dividerLine} />
          <span style={s.dividerText}>{role === 'instructor' ? '강의자 로그인' : '매니저 로그인'}</span>
          <div style={s.dividerLine} />
        </div>

        {error && <div style={s.error}>{error}</div>}

        <form onSubmit={handleLogin}>
          <label style={s.label}>아이디</label>
          <input
            style={s.input}
            type="text"
            placeholder="아이디를 입력하세요"
            value={id}
            onChange={e => { setId(e.target.value); setError(''); }}
            onFocus={e => { e.target.style.borderColor = '#FF6B2B'; }}
            onBlur={e => { e.target.style.borderColor = '#E8E8E8'; }}
          />
          <label style={s.label}>비밀번호</label>
          <input
            style={s.input}
            type="password"
            placeholder="비밀번호를 입력하세요"
            value={pw}
            onChange={e => { setPw(e.target.value); setError(''); }}
            onFocus={e => { e.target.style.borderColor = '#FF6B2B'; }}
            onBlur={e => { e.target.style.borderColor = '#E8E8E8'; }}
          />
          <button style={s.btn} type="submit">로그인</button>
        </form>

        <div style={s.hint}>
          강의자: teacher1 / 1234 &nbsp;|&nbsp; teacher2 / 1234<br />
          매니저: manager1 / 1234
        </div>
      </div>
    </div>
  );
}
