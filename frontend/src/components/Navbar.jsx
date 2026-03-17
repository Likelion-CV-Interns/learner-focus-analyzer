import likelionLogo from '../assets/likelion_logo.png';

const INSTRUCTOR_TABS = [
  { key: 'live',       icon: '🎥', label: '라이브 세션' },
  { key: 'realtime',   icon: '📡', label: '실시간 모니터링' },
  { key: 'evaluation', icon: '📊', label: '총 집중도 평가' },
];

const MANAGER_TABS = [
  { key: 'dashboard',  icon: '🏫', label: '강의자 현황' },
  { key: 'realtime',   icon: '📡', label: '실시간 모니터링' },
  { key: 'evaluation', icon: '📊', label: '총 집중도 평가' },
];

const s = {
  nav: {
    background: 'linear-gradient(135deg, #FF6B2B 0%, #FF8C55 100%)',
    boxShadow: '0 2px 16px rgba(255,107,43,0.3)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  inner: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '0 24px',
    height: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  logoImg: {
    height: 36,
    width: 36,
    objectFit: 'cover',
    borderRadius: 10,
  },
  logoDivider: { width: 1, height: 22, background: 'rgba(255,255,255,0.4)' },
  logoText: { fontSize: 14, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' },

  tabs: { display: 'flex', gap: 4 },
  tab: (active) => ({
    padding: '7px 16px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    border: 'none',
    background: active ? 'rgba(255,255,255,0.25)' : 'transparent',
    color: '#fff',
    transition: 'background 0.15s',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    whiteSpace: 'nowrap',
  }),

  right: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  notifBtn: {
    position: 'relative',
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'rgba(255,255,255,0.2)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    color: '#fff',
  },
  badge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 15,
    height: 15,
    background: '#EF4444',
    borderRadius: '50%',
    fontSize: 9,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
  },
  rolePill: (role) => ({
    padding: '4px 10px',
    borderRadius: 20,
    background: role === 'manager' ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    border: '1px solid rgba(255,255,255,0.3)',
  }),
  userBox: { display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontSize: 13 },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
  },
  logoutBtn: {
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 6,
    padding: '5px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
};

export default function Navbar({ user, activePage, onPageChange, notifCount, onNotifClick, onLogout }) {
  const tabs = user.role === 'instructor' ? INSTRUCTOR_TABS : MANAGER_TABS;

  return (
    <nav style={s.nav}>
      <div style={s.inner}>
        <div style={s.logo}>
          <img src={likelionLogo} alt="likelion" style={s.logoImg} />
          <div style={s.logoDivider} />
          <span style={s.logoText}>학습자 집중도 분석 시스템</span>
        </div>

        <div style={s.tabs}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              style={s.tab(activePage === tab.key)}
              onClick={() => onPageChange(tab.key)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div style={s.right}>
          <button style={s.notifBtn} onClick={onNotifClick} title="알림">
            🔔
            {notifCount > 0 && (
              <span style={s.badge}>{notifCount > 9 ? '9+' : notifCount}</span>
            )}
          </button>
          <span style={s.rolePill(user.role)}>
            {user.role === 'instructor' ? '강의자' : '매니저'}
          </span>
          <div style={s.userBox}>
            <div style={s.avatar}>{user.name[0]}</div>
            <span>{user.name}</span>
          </div>
          <button style={s.logoutBtn} onClick={onLogout}>로그아웃</button>
        </div>
      </div>
    </nav>
  );
}
