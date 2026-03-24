import { useState } from 'react';

const API = 'http://34.10.223.135:8000';

const s = {
  wrap: {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'linear-gradient(135deg, #FFF5F0, #FFE8D8)',
  },
  card: {
    background: '#fff', borderRadius: 20, padding: '40px 36px',
    width: 380, boxShadow: '0 8px 40px rgba(255,107,43,0.15)',
    border: '1.5px solid #FFD5B0',
  },
  logo: {
    textAlign: 'center', marginBottom: 28,
  },
  title: { fontSize: 22, fontWeight: 800, color: '#1A1A1A', marginBottom: 4 },
  sub:   { fontSize: 13, color: '#888' },
  label: { fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6, display: 'block' },
  input: {
    width: '100%', padding: '11px 14px', fontSize: 14,
    border: '1.5px solid #E0E0E0', borderRadius: 10, outline: 'none',
    transition: 'border 0.2s',
  },
  group: { marginBottom: 18 },
  btn: (disabled) => ({
    width: '100%', padding: '13px', borderRadius: 12, border: 'none',
    background: disabled ? '#FFD0B8' : 'linear-gradient(135deg, #FF6B2B, #FF8C55)',
    color: '#fff', fontSize: 15, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: disabled ? 'none' : '0 4px 16px rgba(255,107,43,0.35)',
    marginTop: 8,
  }),
  err: {
    background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
    padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 14,
  },
};

export default function LoginPage({ onLogin }) {
  const [name,      setName]      = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const valid = name.trim() && birthDate;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/users`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), birth_date: birthDate }),
      });
      if (!res.ok) throw new Error('서버 오류: ' + res.status);
      const data = await res.json();
      onLogin({ user_id: data.user_id, name: data.name });
    } catch (err) {
      setError(err.message || '서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.logo}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎓</div>
          <div style={s.title}>학습자 로그인</div>
          <div style={s.sub}>이름과 생년월일로 간편하게 시작하세요</div>
        </div>

        {error && <div style={s.err}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={s.group}>
            <label style={s.label}>이름</label>
            <input
              style={s.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="예: 홍길동"
              autoFocus
            />
          </div>
          <div style={s.group}>
            <label style={s.label}>생년월일</label>
            <input
              style={s.input}
              type="date"
              value={birthDate}
              onChange={e => setBirthDate(e.target.value)}
            />
          </div>
          <button style={s.btn(!valid || loading)} disabled={!valid || loading}>
            {loading ? '확인 중...' : '입장하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
