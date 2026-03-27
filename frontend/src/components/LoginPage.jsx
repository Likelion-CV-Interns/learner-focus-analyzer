import { useState, useCallback } from 'react';
import likelionLogo from '../assets/likelion_logo.png';

const API = 'https://likelionfocus.duckdns.org';

const s = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #FF6B2B 0%, #FF9A5C 50%, #FFB87A 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  card: {
    background: '#fff', borderRadius: 20, padding: '40px',
    width: '100%', maxWidth: 420, boxShadow: '0 24px 80px rgba(0,0,0,0.15)',
  },
  logoBox: {
    display: 'flex', alignItems: 'center', gap: 12,
    marginBottom: 28, justifyContent: 'center',
  },
  logoImg:     { height: 44, width: 'auto', objectFit: 'contain', borderRadius: 10 },
  logoDivider: { width: 1, height: 32, background: '#DDD' },
  logoText:    { fontSize: 17, fontWeight: 700, color: '#1A1A1A', lineHeight: 1.25 },
  logoSub:     { fontSize: 11, color: '#888', fontWeight: 400, marginTop: 2 },
  roleBox:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 },
  roleBtn: (active) => ({
    padding: '14px 10px', borderRadius: 12,
    border: `2px solid ${active ? '#FF6B2B' : '#E8E8E8'}`,
    background: active ? '#FFF5F0' : '#FAFAFA',
    cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
  }),
  roleIcon:  { fontSize: 26, marginBottom: 4 },
  roleLabel: (active) => ({ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#FF6B2B' : '#555' }),
  roleDesc:  { fontSize: 11, color: '#AAA', marginTop: 2 },
  tabRow: { display: 'flex', marginBottom: 20, borderBottom: '2px solid #EEE' },
  tab: (active) => ({
    flex: 1, padding: '10px 0', textAlign: 'center', fontSize: 13,
    fontWeight: active ? 700 : 500,
    color: active ? '#FF6B2B' : '#AAA',
    background: 'none', border: 'none',
    borderBottom: `2px solid ${active ? '#FF6B2B' : 'transparent'}`,
    cursor: 'pointer', marginBottom: -2,
  }),
  fieldWrap: { marginBottom: 14 },
  label:     { display: 'block', fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 6 },
  input: {
    width: '100%', padding: '12px 14px', border: '1.5px solid #E8E8E8', borderRadius: 10,
    fontSize: 14, color: '#1A1A1A', background: '#FAFAFA', boxSizing: 'border-box',
    outline: 'none', transition: 'border-color 0.2s',
  },
  inputRow:  { display: 'flex', gap: 8 },
  checkBtn: (state) => ({
    padding: '0 14px', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 700,
    cursor: state === 'idle' ? 'pointer' : 'default', whiteSpace: 'nowrap', flexShrink: 0,
    background: state === 'ok' ? '#F0FDF4' : state === 'fail' ? '#FEF2F2' : '#F5F5F5',
    color:      state === 'ok' ? '#15803D' : state === 'fail' ? '#DC2626' : '#555',
    border:     `1.5px solid ${state === 'ok' ? '#BBF7D0' : state === 'fail' ? '#FECACA' : '#E8E8E8'}`,
  }),
  hint: { fontSize: 11, marginTop: 4 },
  btn: {
    width: '100%', padding: '14px',
    background: 'linear-gradient(135deg, #FF6B2B, #FF8C55)',
    color: '#fff', fontSize: 15, fontWeight: 700, borderRadius: 10,
    border: 'none', cursor: 'pointer', marginTop: 8,
    boxShadow: '0 4px 16px rgba(255,107,43,0.35)',
  },
  btnOff: {
    width: '100%', padding: '14px', background: '#FFD0B8',
    color: '#fff', fontSize: 15, fontWeight: 700, borderRadius: 10,
    border: 'none', cursor: 'not-allowed', marginTop: 8,
  },
  error: {
    background: '#FEF2F2', border: '1px solid #FECACA', color: '#EF4444',
    borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14,
  },
  success: {
    background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D',
    borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14,
  },
};

function FormField({ label, type = 'text', value, onChange, placeholder, onFocus, onBlur }) {
  return (
    <div style={s.fieldWrap}>
      <label style={s.label}>{label}</label>
      <input
        style={s.input} type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={e => { e.target.style.borderColor = '#FF6B2B'; onFocus?.(); }}
        onBlur={e  => { e.target.style.borderColor = '#E8E8E8'; onBlur?.(); }}
      />
    </div>
  );
}

export default function LoginPage({ onLogin }) {
  const [role, setRole] = useState('instructor');
  const [tab,  setTab]  = useState('login');

  // 공통 폼 필드
  const [username,  setUsername]  = useState('');
  const [email,     setEmail]     = useState('');
  const [pw,        setPw]        = useState('');
  const [name,      setName]      = useState('');

  // 아이디 중복 확인 상태: 'idle' | 'checking' | 'ok' | 'fail'
  const [usernameCheck, setUsernameCheck] = useState('idle');
  const [usernameHint,  setUsernameHint]  = useState('');

  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setUsername(''); setEmail(''); setPw(''); setName('');
    setUsernameCheck('idle'); setUsernameHint('');
    setError(''); setSuccess('');
  };

  // 아이디 중복 확인
  const checkUsername = useCallback(async () => {
    if (!username.trim()) return;
    setUsernameCheck('checking');
    try {
      const res = await fetch(`${API}/api/auth/check-username?username=${encodeURIComponent(username)}&role=${role}`);
      const data = await res.json();
      if (data.available) {
        setUsernameCheck('ok');
        setUsernameHint('사용 가능한 아이디입니다.');
      } else {
        setUsernameCheck('fail');
        setUsernameHint('이미 사용 중인 아이디입니다.');
      }
    } catch {
      setUsernameCheck('idle');
    }
  }, [username, role]);

  // 회원가입
  const handleRegister = async (e) => {
    e.preventDefault();
    if (usernameCheck !== 'ok') { setError('아이디 중복 확인을 해주세요.'); return; }
    if (pw.length < 6) { setError('비밀번호는 6자 이상이어야 합니다.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/auth/register?role=${role}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password: pw, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? '회원가입 실패');
      setSuccess('회원가입이 완료되었습니다. 로그인해주세요.');
      setTab('login');
      reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 로그인
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/auth/login?role=${role}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? '로그인 실패');
      onLogin({
        role:          data.role,
        name:          data.name,
        id:            data.id,
        instructor_id: data.role === 'instructor' ? data.id : null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const canSubmitRegister = username && usernameCheck === 'ok' && email && pw.length >= 6 && name && !loading;
  const canSubmitLogin    = username && pw && !loading;

  const roles = [
    { key: 'instructor', icon: '👨‍🏫', label: '강의자', desc: '강의 세션 관리' },
    { key: 'manager',    icon: '🧑‍💼', label: '매니저',  desc: '전체 현황 모니터링' },
  ];

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* 로고 */}
        <div style={s.logoBox}>
          <img src={likelionLogo} alt="likelion" style={s.logoImg} />
          <div style={s.logoDivider} />
          <div>
            <div style={s.logoText}>학습자 집중도 분석 시스템</div>
            <div style={s.logoSub}>Focus Analyzer · 관리자 전용</div>
          </div>
        </div>

        {/* 역할 선택 */}
        <div style={s.roleBox}>
          {roles.map(r => (
            <button key={r.key} style={s.roleBtn(role === r.key)}
              onClick={() => { setRole(r.key); setTab('login'); reset(); }}>
              <div style={s.roleIcon}>{r.icon}</div>
              <div style={s.roleLabel(role === r.key)}>{r.label}</div>
              <div style={s.roleDesc}>{r.desc}</div>
            </button>
          ))}
        </div>

        {/* 로그인 / 회원가입 탭 */}
        <div style={s.tabRow}>
          <button style={s.tab(tab === 'login')}  onClick={() => { setTab('login');  reset(); }}>로그인</button>
          <button style={s.tab(tab === 'signup')} onClick={() => { setTab('signup'); reset(); }}>회원가입</button>
        </div>

        {error   && <div style={s.error}>{error}</div>}
        {success && <div style={s.success}>{success}</div>}

        {/* ── 로그인 폼 ── */}
        {tab === 'login' && (
          <form onSubmit={handleLogin}>
            <FormField label="아이디" value={username} onChange={v => { setUsername(v); setError(''); }}
              placeholder="아이디를 입력하세요" />
            <FormField label="비밀번호" type="password" value={pw} onChange={v => { setPw(v); setError(''); }}
              placeholder="비밀번호를 입력하세요" />
            <button type="submit" style={canSubmitLogin ? s.btn : s.btnOff} disabled={!canSubmitLogin}>
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        )}

        {/* ── 회원가입 폼 ── */}
        {tab === 'signup' && (
          <form onSubmit={handleRegister}>
            <FormField label="이름" value={name} onChange={v => { setName(v); setError(''); }}
              placeholder="이름을 입력하세요" />

            {/* 아이디 + 중복확인 */}
            <div style={s.fieldWrap}>
              <label style={s.label}>아이디</label>
              <div style={s.inputRow}>
                <input
                  style={{ ...s.input, flex: 1 }}
                  value={username}
                  placeholder="아이디를 입력하세요"
                  onChange={e => { setUsername(e.target.value); setUsernameCheck('idle'); setUsernameHint(''); setError(''); }}
                  onFocus={e => e.target.style.borderColor = '#FF6B2B'}
                  onBlur={e  => e.target.style.borderColor = '#E8E8E8'}
                />
                <button
                  type="button"
                  onClick={checkUsername}
                  disabled={!username.trim() || usernameCheck === 'checking'}
                  style={s.checkBtn(usernameCheck)}
                >
                  {usernameCheck === 'checking' ? '확인 중' : usernameCheck === 'ok' ? '✓ 사용가능' : usernameCheck === 'fail' ? '✗ 중복' : '중복확인'}
                </button>
              </div>
              {usernameHint && (
                <div style={{ ...s.hint, color: usernameCheck === 'ok' ? '#15803D' : '#DC2626' }}>
                  {usernameHint}
                </div>
              )}
            </div>

            <FormField label="이메일" type="email" value={email} onChange={v => { setEmail(v); setError(''); }}
              placeholder="이메일을 입력하세요" />
            <FormField label={<>비밀번호 <span style={{ color: '#AAA', fontWeight: 400 }}>(6자 이상)</span></>}
              type="password" value={pw} onChange={v => { setPw(v); setError(''); }}
              placeholder="비밀번호를 입력하세요" />

            <button type="submit" style={canSubmitRegister ? s.btn : s.btnOff} disabled={!canSubmitRegister}>
              {loading ? '가입 중...' : '회원가입'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
