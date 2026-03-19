import { useState, useCallback } from 'react';
import LoginPage from './components/LoginPage';
import Navbar from './components/Navbar';
import RealTimeMonitor from './components/RealTimeMonitor';
import TotalEvaluation from './components/TotalEvaluation';
import ManagerDashboard from './components/ManagerDashboard';
import { NotificationToast, NotificationPanel } from './components/NotificationPanel';

let notifIdCounter = 0;

function formatTime(date) {
  return `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}:${date.getSeconds().toString().padStart(2,'0')}`;
}

// Default start tab per role
const DEFAULT_TAB = {
  instructor: 'realtime',
  manager: 'dashboard',
};

export default function App() {
  const [user, setUser] = useState(null);          // { role, name, id }
  const [activePage, setActivePage] = useState('');

  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [showPanel, setShowPanel] = useState(false);

  const handleLogin = useCallback((userData) => {
    setUser(userData);
    setActivePage(DEFAULT_TAB[userData.role]);
  }, []);

  const handleLogout = useCallback(() => {
    setUser(null);
    setActivePage('');
    setNotifications([]);
    setToasts([]);
  }, []);

  const addNotification = useCallback((notif) => {
    const full = {
      ...notif,
      id: ++notifIdCounter,
      time: formatTime(new Date()),
    };
    setNotifications(prev => [full, ...prev].slice(0, 50));
    if (['individual', 'class', 'boredom'].includes(notif.type)) {
      setToasts(prev => [full, ...prev].slice(0, 3));
    }
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handlePageChange = useCallback((page) => {
    setActivePage(page);
    setShowPanel(false);
  }, []);

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        user={user}
        activePage={activePage}
        onPageChange={handlePageChange}
        notifCount={notifications.length}
        onNotifClick={() => setShowPanel(v => !v)}
        onLogout={handleLogout}
      />

      {/* Notification panel dropdown */}
      {showPanel && (
        <div style={{ position: 'fixed', top: 60, right: 24, zIndex: 150 }}>
          <NotificationPanel
            notifications={notifications}
            onClose={() => setShowPanel(false)}
            onClear={() => setNotifications([])}
          />
        </div>
      )}

      {/* Toast stack */}
      <div style={{
        position: 'fixed', bottom: 24, right: 24,
        display: 'flex', flexDirection: 'column', gap: 10, zIndex: 200,
      }}>
        {toasts.map(toast => (
          <NotificationToast key={toast.id} notif={toast} onClose={() => dismissToast(toast.id)} />
        ))}
      </div>

      {/* Page content */}
      <div style={{ flex: 1 }}>

        {/* ── 강의자 전용: 실시간 모니터링 ── */}
        {user.role === 'instructor' && activePage === 'realtime' && (
          <RealTimeMonitor
            onNewNotification={addNotification}
            monitoringTarget={{ sessionId: user.sessionId ?? 'sess_abc123', name: user.name, course: '' }}
          />
        )}

        {/* ── 매니저 전용 ── */}
        {user.role === 'manager' && activePage === 'dashboard' && (
          <ManagerDashboard onNewNotification={addNotification} />
        )}

        {/* ── 공통: 총 집중도 평가 ── */}
        {activePage === 'evaluation' && (
          <TotalEvaluation user={user} />
        )}
      </div>
    </div>
  );
}
