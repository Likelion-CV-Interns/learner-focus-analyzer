import { useState } from 'react';
import LoginPage from './pages/LoginPage.jsx';
import SessionPage from './pages/SessionPage.jsx';
import MonitorPage from './pages/MonitorPage.jsx';

export default function App() {
  const [user, setUser]       = useState(null);   // { user_id, name }
  const [session, setSession] = useState(null);   // { session_id, name }

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }
  if (!session) {
    return <SessionPage user={user} onJoin={setSession} onLogout={() => setUser(null)} />;
  }
  return (
    <MonitorPage
      user={user}
      session={session}
      onLeave={() => setSession(null)}
    />
  );
}
