import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = '/api';
const icons = { dashboard: '◫', students: '♙', courses: '▤', faculty: '♧', attendance: '◷', exams: '✎', results: '▥', fees: '＄', notifications: '◉' };
const sections = [
  { id: 'dashboard', label: 'Overview', path: '/dashboard' },
  { id: 'students', label: 'Students', path: '/students' },
  { id: 'courses', label: 'Courses', path: '/courses' },
  { id: 'faculty', label: 'Faculty', path: '/faculty' },
  { id: 'attendance', label: 'Attendance', path: '/attendance' },
  { id: 'exams', label: 'Exams', path: '/exams' },
  { id: 'results', label: 'Results', path: '/results' },
  { id: 'fees', label: 'Fees', path: '/fees' },
  { id: 'notifications', label: 'Notifications', path: '/notifications' }
];

const resources = {
  students: { title: 'Students', subtitle: 'Manage student records and enrollment details.', endpoint: '/students', key: 'students', admin: true, fields: [
    ['roll_number', 'Roll number', 'text', true], ['first_name', 'First name', 'text', true], ['last_name', 'Last name', 'text', true], ['email', 'Email', 'email'], ['phone', 'Phone', 'text'], ['date_of_birth', 'Date of birth', 'date'], ['department', 'Department', 'text'], ['program', 'Program', 'text'], ['year_of_study', 'Year of study', 'number'], ['status', 'Status', 'select', false, ['active', 'inactive', 'graduated']]
  ], columns: ['roll_number', 'first_name', 'last_name', 'department', 'year_of_study', 'status'] },
  courses: { title: 'Courses', subtitle: 'Browse the course catalog and manage course offerings.', endpoint: '/courses', key: 'courses', admin: true, fields: [
    ['course_code', 'Course code', 'text', true], ['title', 'Title', 'text', true], ['description', 'Description', 'textarea'], ['credits', 'Credits', 'number', true], ['department', 'Department', 'text'], ['semester', 'Semester', 'number'], ['instructor_name', 'Instructor name', 'text'], ['capacity', 'Capacity', 'number'], ['status', 'Status', 'select', false, ['active', 'archived']]
  ], columns: ['course_code', 'title', 'department', 'credits', 'semester', 'status'] },
  faculty: { title: 'Faculty', subtitle: 'Keep faculty directory details current.', endpoint: '/faculty', key: 'faculties', admin: true, filter: 'department', fields: [
    ['name', 'Full name', 'text', true], ['employee_code', 'Employee code', 'text', true], ['department', 'Department', 'text', true], ['designation', 'Designation', 'text', true], ['email', 'Email', 'email', true], ['phone', 'Phone', 'text'], ['record_status', 'Record status', 'select', false, ['active', 'archived']]
  ], columns: ['employee_code', 'name', 'department', 'designation', 'email'] },
  attendance: { title: 'Attendance', subtitle: 'Review and record daily student attendance.', endpoint: '/attendance', key: 'attendances', writer: ['admin', 'faculty'], fields: [
    ['student_id', 'Student ID', 'number', true], ['date', 'Date', 'date', true], ['status', 'Status', 'select', true, ['present', 'absent', 'leave']], ['remarks', 'Remarks', 'textarea']
  ], columns: ['student_id', 'date', 'status', 'remarks', 'record_status'] },
  exams: { title: 'Exams', subtitle: 'Plan examination dates and mark allocations.', context: 'Keep exam dates and maximum marks aligned with each course offering.', endpoint: '/exams', key: 'exams', writer: ['admin', 'faculty'], filters: [
    { name: 'course_code', label: 'Course code', type: 'text' }
  ], fields: [
    ['exam_name', 'Exam name', 'text', true], ['course_code', 'Course code', 'text', true], ['exam_date', 'Exam date', 'date', true], ['max_marks', 'Maximum marks', 'number', true], ['record_status', 'Record status', 'select', false, ['active', 'archived']]
  ], columns: ['exam_name', 'course_code', 'exam_date', 'max_marks', 'record_status'] },
  results: { title: 'Results', subtitle: 'Record marks and review published results.', context: 'Narrow the list by exam or student ID, then compare marks and grade. Open View to inspect every field returned by the service before editing a result.', endpoint: '/exams/results', key: 'results', writer: ['admin', 'faculty'], filters: [
    { name: 'exam_id', label: 'Exam ID', type: 'number' }, { name: 'student_id', label: 'Student ID', type: 'number' }
  ], fields: [
    ['exam_id', 'Exam ID', 'number', true], ['student_id', 'Student ID', 'number', true], ['marks_obtained', 'Marks obtained', 'number', true], ['grade', 'Grade', 'text'], ['record_status', 'Record status', 'select', false, ['active', 'archived']]
  ], columns: ['exam_id', 'student_id', 'marks_obtained', 'grade', 'record_status'] },
  fees: { title: 'Fees', subtitle: 'Track student charges, due dates, and payments.', context: 'Use payment status and due dates to guide fee follow-up.', endpoint: '/fees', key: 'fees', admin: true, filters: [
    { name: 'student_id', label: 'Student ID', type: 'number' }, { name: 'status', label: 'Status', type: 'select', options: ['pending', 'paid', 'overdue'] }
  ], fields: [
    ['student_id', 'Student ID', 'number', true], ['fee_type', 'Fee type', 'text', true], ['amount', 'Amount', 'number', true], ['due_date', 'Due date', 'date', true], ['status', 'Status', 'select', true, ['pending', 'paid', 'overdue']], ['paid_date', 'Paid date', 'date']
  ], columns: ['student_id', 'fee_type', 'amount', 'due_date', 'status', 'paid_date'] },
  notifications: { title: 'Notifications', subtitle: 'Share announcements with students and faculty.', context: 'Confirm the audience before sharing a campus announcement.', endpoint: '/notifications', key: 'notifications', writer: ['admin', 'faculty'], paginated: false, searchable: false, fields: [
    ['title', 'Title', 'text', true], ['message', 'Message', 'textarea', true], ['target_role', 'Audience', 'select', false, ['all', 'student', 'faculty']]
  ], columns: ['title', 'message', 'target_role', 'created_by', 'created_at'] }
};

function getSession() {
  try { return { token: localStorage.getItem('erp_token'), user: JSON.parse(localStorage.getItem('erp_user') || 'null') }; }
  catch { return { token: null, user: null }; }
}

async function request(path, { token, method = 'GET', body, query } = {}) {
  const url = new URL(`${API}${path}`, window.location.origin);
  Object.entries(query || {}).forEach(([key, value]) => { if (value !== '' && value !== undefined && value !== null) url.searchParams.set(key, value); });
  const response = await fetch(url, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

function App() {
  const [session, setSession] = useState(getSession);
  const [path, setPath] = useState(window.location.pathname);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!session.token && path !== '/login') {
      window.history.replaceState({}, '', '/login');
      setPath('/login');
    } else if (session.token && !sections.some(section => section.path === path)) {
      window.history.replaceState({}, '', '/dashboard');
      setPath('/dashboard');
    }
  }, [session.token, path]);

  function navigate(next) {
    if (window.location.pathname !== next) window.history.pushState({}, '', next);
    setPath(next);
    setMobileOpen(false);
  }

  function signOut() {
    localStorage.removeItem('erp_token');
    localStorage.removeItem('erp_user');
    setSession({ token: null, user: null });
    navigate('/login');
  }

  if (!session.token) return <Login onSuccess={next => { setSession(next); navigate('/dashboard'); }} />;
  const current = sections.find(item => item.path === path)?.id || 'dashboard';
  return <div className="app-shell">
    <Sidebar active={current} onNavigate={navigate} mobileOpen={mobileOpen} />
    {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation">☰</button>
        <div className="crumb">CampusFlow <span>/</span> <b>{sections.find(item => item.id === current)?.label}</b></div>
        <div className="profile"><div className="avatar">{(session.user?.name || 'U').slice(0, 1).toUpperCase()}</div><div className="profile-copy"><strong>{session.user?.name || 'User'}</strong><span>{session.user?.role || 'member'}</span></div><button className="text-button" onClick={signOut}>Sign out</button></div>
      </header>
      <div className="page-wrap" key={current}>
        {current === 'dashboard' ? <Dashboard token={session.token} user={session.user} onNavigate={navigate} /> : <ResourcePage key={current} type={current} token={session.token} user={session.user} />}
      </div>
    </main>
  </div>;
}

function Sidebar({ active, onNavigate, mobileOpen }) {
  return <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
    <div className="brand"><div className="brand-mark">C</div><div><strong>CampusFlow</strong><small>COLLEGE ERP</small></div></div>
    <div className="nav-label">WORKSPACE</div>
    <nav>{sections.map(item => <button key={item.id} className={`nav-item ${active === item.id ? 'active' : ''}`} onClick={() => onNavigate(item.path)}><span className="nav-icon">{icons[item.id]}</span>{item.label}{active === item.id && <span className="nav-current" />}</button>)}</nav>
    <div className="sidebar-bottom"><div className="help-card"><div className="help-icon">✦</div><strong>Presentation mode</strong><p>Your live ERP workspace, connected to the API gateway.</p><span className="live-pill"><i /> Gateway connection</span></div><div className="side-foot">MICROSERVICES · ERP</div></div>
  </aside>;
}

function Login({ onSuccess }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const data = await request('/auth/login', { method: 'POST', body: { email, password } });
      if (!data.token || !data.user) throw new Error('The login response did not include a token and user.');
      localStorage.setItem('erp_token', data.token); localStorage.setItem('erp_user', JSON.stringify(data.user));
      onSuccess({ token: data.token, user: data.user });
    } catch (err) { setError(err.message || 'Unable to sign in. Check your details and try again.'); }
    finally { setBusy(false); }
  }
  return <div className="login-screen"><div className="login-aside"><div className="login-logo"><div className="brand-mark">C</div><span>CampusFlow</span></div><div className="login-message"><span className="eyebrow">COLLEGE ERP PLATFORM</span><h1>Your campus,<br /><em>in good order.</em></h1><p>A clear view of academics and administration, powered by connected services.</p><div className="login-decoration"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core">C</div><span className="orbit-tag tag-one">Academics</span><span className="orbit-tag tag-two">People</span><span className="orbit-tag tag-three">Operations</span></div></div><div className="login-aside-foot">STUDENT · FACULTY · CAMPUS</div></div><div className="login-panel"><form className="login-form" onSubmit={submit}><div className="welcome-mark">↗</div><span className="eyebrow">WELCOME BACK</span><h2>Sign in to your workspace</h2><p className="login-hint">Use your ERP account credentials to continue.</p><label>Email address<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@college.edu" required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" required /></label>{error && <div className="alert error">{error}</div>}<button className="button primary full" disabled={busy}>{busy ? <><span className="spinner" /> Signing in…</> : <>Sign in <span>→</span></>}</button><div className="login-note"><span className="lock-icon">▣</span> Secure sign-in through the ERP authentication service</div></form><div className="login-panel-foot">CampusFlow <span>·</span> College ERP</div></div></div>;
}

function Dashboard({ token, user, onNavigate }) {
  const [metrics, setMetrics] = useState([]); const [recent, setRecent] = useState([]); const [busy, setBusy] = useState(true); const [warning, setWarning] = useState('');
  useEffect(() => {
    let alive = true;
    const configs = [
      ['students', 'Students', 'students', '♙', 'blue'], ['faculty', 'Active faculty', 'faculties', '♧', 'violet'], ['courses', 'Courses', 'courses', '▤', 'teal'], ['attendance', 'Attendance', 'attendances', '◷', 'amber'], ['exams', 'Exams', 'exams', '✎', 'rose'], ['fees', 'Fees', 'fees', '＄', 'green'], ['notifications', 'Notifications', 'notifications', '◉', 'blue']
    ];
    (async () => {
      const audience = ['student', 'faculty'].includes(user?.role) ? user.role : undefined;
      const values = await Promise.all(configs.map(async ([id, label, key, icon, color]) => {
        try {
          const result = await request(resources[id].endpoint, { token, query: { page: 1, limit: 1, ...(id === 'notifications' && audience ? { target_role: audience } : {}) } });
          return { id, label, icon, color, count: result.pagination?.total ?? result[key]?.length ?? null };
        } catch { return null; }
      }));
      try {
        const result = await request('/notifications', { token, query: audience ? { target_role: audience } : undefined });
        if (alive) setRecent((result.notifications || []).slice(0, 4));
      } catch { /* Recent items are optional when notification access is unavailable. */ }
      if (alive) { setMetrics(values.filter(item => item && item.count !== null)); setWarning(values.some(item => item === null) ? 'Some service summaries are unavailable right now.' : ''); setBusy(false); }
    })();
    return () => { alive = false; };
  }, [token, user?.role]);
  const dateLabel = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  return <>
    <section className="welcome-banner"><div className="welcome-copy"><span className="eyebrow light">{dateLabel.toUpperCase()}</span><h1>Good day, {user?.name?.split(' ')[0] || 'there'} <span>✦</span></h1><p>Here’s what’s happening across your campus today.</p><button className="button banner-button" onClick={() => onNavigate('/students')}>Explore student records <span>→</span></button></div><div className="banner-art"><div className="banner-ring ring-a"/><div className="banner-ring ring-b"/><div className="banner-spark">✦</div><div className="banner-stat"><span>API GATEWAY</span><strong>localhost:8080</strong></div><div className="banner-orb">C</div></div></section>
    <div className="section-heading"><div><span className="eyebrow">AT A GLANCE</span><h2>Campus overview</h2></div><span className="updated-label"><i /> Live data from your services</span></div>
    {warning && <div className="alert neutral">{warning} Refresh the page to try again.</div>}
    <section className="metric-grid">{busy ? Array.from({ length: 6 }, (_, index) => <div className="metric-card skeleton-card" key={index}><div className="skeleton line-short"/><div className="skeleton line-large"/><div className="skeleton line-medium"/></div>) : metrics.map((item, index) => <button className="metric-card" key={item.id} onClick={() => onNavigate(`/${item.id}`)} style={{ animationDelay: `${index * 45}ms` }}><div className="metric-top"><span>{item.label}</span><span className={`metric-icon ${item.color}`}>{item.icon}</span></div><strong className="metric-value">{item.count.toLocaleString()}</strong><span className="metric-bottom"><span className="metric-dot" /> Records in system <span className="metric-arrow">↗</span></span></button>)}</section>
    <section className="dashboard-lower"><div className="panel quick-panel"><div className="panel-heading"><div><span className="eyebrow">QUICK ACCESS</span><h3>Go to a workspace</h3></div></div><div className="quick-grid">{['students', 'courses', 'attendance', 'exams'].map(id => <button className="quick-link" key={id} onClick={() => onNavigate(`/${id}`)}><span className={`quick-icon ${id}`}>{icons[id]}</span><span><strong>{resources[id].title}</strong><small>Open workspace</small></span><b>↗</b></button>)}</div></div><div className="panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">CAMPUS UPDATES</span><h3>Recent notifications</h3></div><button className="link-button" onClick={() => onNavigate('/notifications')}>View all →</button></div>{recent.length ? <div className="recent-list">{recent.map(item => <div className="recent-item" key={item.id}><div className="recent-mark">◉</div><div className="recent-copy"><strong>{item.title}</strong><p>{item.message}</p><span>{formatDate(item.created_at)} · {item.target_role || 'Everyone'}</span></div></div>)}</div> : <div className="empty-inline">{busy ? 'Loading notifications…' : 'No recent notifications to show.'}</div>}</div></section>
  </>;
}

function ResourcePage({ type, token, user }) {
  const config = resources[type];
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({});
  const [filterInput, setFilterInput] = useState({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const canWrite = config.admin ? user?.role === 'admin' : config.writer?.includes(user?.role);
  const canEdit = canWrite && type !== 'notifications';
  const canArchive = canWrite && type !== 'notifications';
  const canDelete = canWrite && type === 'notifications';
  const columns = config.columns;

  const load = async () => {
    setBusy(true);
    setError('');
    setLoadFailed(false);
    try {
      const query = {
        ...(config.paginated !== false ? { page, limit: 20 } : {}),
        ...(search ? { q: search } : {}),
        ...filters
      };
      const data = await request(config.endpoint, { token, query });
      setItems(data[config.key] || []);
      setPagination(data.pagination || null);
    } catch (err) {
      setError(err.message || 'Could not load records.');
      setLoadFailed(true);
      setItems([]);
      setPagination(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, [type, page, search, filters, token]);

  function searchSubmit(event) {
    event.preventDefault();
    const nextFilters = Object.fromEntries((config.filters || [])
      .map(filter => [filter.name, String(filterInput[filter.name] || '').trim()])
      .filter(([, value]) => value !== ''));
    setPage(1);
    setSearch(config.searchable === false ? '' : searchInput.trim());
    setFilters(nextFilters);
  }

  async function saveRecord(values) {
    setSaving(true);
    setError('');
    try {
      const editing = dialog?.mode === 'edit';
      await request(`${config.endpoint}${editing ? `/${dialog.item.id}` : ''}`, { token, method: editing ? 'PUT' : 'POST', body: values });
      setDialog(null);
      setNotice(editing ? 'Record updated.' : 'Record created.');
      await load();
    } catch (err) {
      return err.message || 'Unable to save this record.';
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord(item) {
    const action = type === 'notifications' ? 'delete' : 'archive';
    if (!window.confirm(`${action === 'delete' ? 'Delete' : 'Archive'} this ${config.title.toLowerCase().replace(/s$/, '')} record? ${action === 'archive' ? 'It will no longer appear in the active records list.' : 'This action cannot be undone.'}`)) return;
    setError('');
    try {
      await request(`${config.endpoint}/${item.id}`, { token, method: 'DELETE' });
      setNotice(type === 'notifications' ? 'Notification deleted.' : 'Record archived.');
      await load();
    } catch (err) {
      setError(err.message || 'Unable to remove this record.');
    }
  }

  const singular = { students: 'student', courses: 'course', faculty: 'faculty member', attendance: 'attendance record', exams: 'exam', results: 'result', fees: 'fee', notifications: 'notification' }[type];
  return <>
    <div className="page-heading"><div><span className="eyebrow">CAMPUS MANAGEMENT</span><h1>{config.title}</h1><p>{config.subtitle}</p></div>{canWrite && <button className="button primary" onClick={() => { setError(''); setDialog({ mode: 'create' }); }}><span className="plus">＋</span> Add {singular}</button>}</div>
    {config.context && <p className="resource-context"><span aria-hidden="true">i</span>{config.context}</p>}
    {notice && <div className="alert success">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    {!canWrite && <div className="role-note">You can view these records. {type === 'notifications' ? 'Creating or deleting announcements requires an admin or faculty role.' : `Adding or changing them requires ${config.admin ? 'an admin' : 'an admin or faculty'} role.`}</div>}
    <section className="panel table-panel"><div className="table-toolbar"><div><span className="eyebrow">RECORDS</span><h2>{config.title} directory</h2></div>{(config.searchable !== false || config.filters?.length > 0) && <form className="resource-filters" onSubmit={searchSubmit}>
      {config.searchable !== false && <label className="search-form"><span>⌕</span><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder={`Search ${config.title.toLowerCase()}…`} aria-label={`Search ${config.title}`} /></label>}
      {(config.filters || []).map(filter => <label className="filter-field" key={filter.name}>{filter.label}{filter.type === 'select' ? <select value={filterInput[filter.name] || ''} onChange={event => setFilterInput({ ...filterInput, [filter.name]: event.target.value })}><option value="">All</option>{filter.options.map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select> : <input type={filter.type} min={filter.type === 'number' ? 1 : undefined} value={filterInput[filter.name] || ''} onChange={event => setFilterInput({ ...filterInput, [filter.name]: event.target.value })} />}</label>)}
      <button className="button secondary filter-submit" type="submit">Apply</button>
    </form>}</div>
      {error && <div className="alert error table-alert">{error}<button onClick={load}>Try again</button></div>}
      {busy ? <div className="table-state-panel" role="status"><div className="empty-state"><strong><span className="spinner dark" /> Loading {config.title.toLowerCase()}…</strong></div></div> : loadFailed ? <div className="table-state-panel" role="status"><div className="empty-state unavailable-state"><strong>Records unavailable</strong><span>Try again when the service is available.</span></div></div> : items.length === 0 ? <div className="table-state-panel" role="status"><div className="empty-state"><div className="empty-symbol">⌕</div><strong>{search || Object.keys(filters).length ? 'No matching records' : `No ${config.title.toLowerCase()} yet`}</strong><span>{search || Object.keys(filters).length ? 'Try adjusting your search or filters.' : 'Records from your ERP service will appear here.'}</span></div></div> : <div className="table-scroll"><table><thead><tr>{columns.map(column => <th key={column}>{humanize(column)}</th>)}<th className="actions-head">Actions</th></tr></thead><tbody>
        {items.map(item => <tr key={item.id}>{columns.map(column => <td key={column}>{renderCell(item[column], column)}</td>)}<td className="row-actions"><button className="action-button" title="View details" onClick={() => setDialog({ mode: 'view', item })}>View</button>{canEdit && <button className="action-button" title="Edit record" onClick={() => { setError(''); setDialog({ mode: 'edit', item }); }}>Edit</button>}{canArchive && <button className="action-button danger-text" title="Archive record" onClick={() => removeRecord(item)}>Archive</button>}{canDelete && <button className="action-button danger-text" title="Delete notification" onClick={() => removeRecord(item)}>Delete</button>}</td></tr>)}
      </tbody></table></div>}
      <div className="table-footer"><span>{busy ? 'Loading records…' : loadFailed ? 'Record count unavailable' : pagination ? `Showing ${items.length ? (page - 1) * 20 + 1 : 0}–${(page - 1) * 20 + items.length} of ${pagination.total}` : `${items.length} ${config.title.toLowerCase()} shown`}</span>{pagination && <div className="pagination"><button disabled={page <= 1 || busy} onClick={() => setPage(value => value - 1)}>← Previous</button><span>Page {page}{pagination.pages ? ` of ${pagination.pages}` : ''}</span><button disabled={page >= pagination.pages || busy} onClick={() => setPage(value => value + 1)}>Next →</button></div>}</div>
    </section>
    {dialog && <RecordDialog config={config} dialog={dialog} saving={saving} token={token} onClose={() => setDialog(null)} onSave={saveRecord} />}
  </>;
}

function RecordDialog({ config, dialog, saving, token, onClose, onSave }) {
  const initial = dialog.item || {};
  const [values, setValues] = useState(() => Object.fromEntries(config.fields.map(([key]) => [key, initial[key] === null ? '' : initial[key] ?? ''])));
  const [activeExams, setActiveExams] = useState([]);
  const [loadingExams, setLoadingExams] = useState(config.key === 'results' && dialog.mode !== 'view');
  const [examError, setExamError] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (config.key !== 'results' || dialog.mode === 'view') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const exams = [];
        let currentPage = 1;
        let pageCount = 1;
        do {
          const data = await request('/exams', { token, query: { page: currentPage, limit: 100 } });
          exams.push(...(data.exams || []));
          pageCount = data.pagination?.pages || currentPage;
          currentPage += 1;
        } while (currentPage <= pageCount);
        if (!cancelled) setActiveExams(exams.filter(exam => exam.record_status === 'active'));
      } catch (err) {
        if (!cancelled) setExamError(err.message || 'Unable to load active exams.');
      } finally {
        if (!cancelled) setLoadingExams(false);
      }
    })();
    return () => { cancelled = true; };
  }, [config.key, dialog.mode, token]);

  const selectedExam = activeExams.find(exam => String(exam.id) === String(values.exam_id));
  if (dialog.mode === 'view') return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal detail-modal"><div className="modal-header"><div><span className="eyebrow">RECORD DETAILS</span><h2>{({ students: 'Student', courses: 'Course', faculty: 'Faculty member', attendance: 'Attendance record', exams: 'Exam', results: 'Result', fees: 'Fee', notifications: 'Notification' })[config.key === 'faculties' ? 'faculty' : config.key === 'attendances' ? 'attendance' : config.key] || config.title} #{initial.id}</h2></div><button type="button" className="close-button" onClick={onClose}>×</button></div><div className="detail-grid">{Object.entries(initial).map(([key, value]) => <div className="detail-field" key={key}><span>{humanize(key)}</span><strong>{renderCell(value, key)}</strong></div>)}</div><div className="modal-footer"><button className="button secondary" onClick={onClose}>Close</button></div></section></div>;

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    if (config.key === 'results') {
      if (loadingExams || examError) return;
      if (!selectedExam) { setFormError('Choose an active exam before saving this result.'); return; }
      if (Number(values.marks_obtained) > Number(selectedExam.max_marks)) {
        setFormError(`Marks obtained cannot exceed ${selectedExam.max_marks} for this exam.`);
        return;
      }
    }
    const data = {};
    for (const [key, label, type] of config.fields) {
      const value = values[key];
      if (value === '' || value === null) continue;
      data[key] = type === 'number' ? Number(value) : value;
    }
    if (config.endpoint === '/notifications' && data.target_role === 'all') data.target_role = null;
    const saveError = await onSave(data);
    if (saveError) setFormError(saveError);
  }

  const singular = { students: 'student', courses: 'course', faculty: 'faculty member', attendance: 'attendance record', exams: 'exam', results: 'result', fees: 'fee', notifications: 'notification' }[config.key === 'faculties' ? 'faculty' : config.key === 'attendances' ? 'attendance' : config.key];
  const resultFormBlocked = config.key === 'results' && (loadingExams || Boolean(examError) || activeExams.length === 0);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="modal"><form onSubmit={submit}><div className="modal-header"><div><span className="eyebrow">{dialog.mode === 'edit' ? 'UPDATE RECORD' : 'NEW RECORD'}</span><h2>{dialog.mode === 'edit' ? `Edit ${singular}` : `Add ${singular}`}</h2></div><button type="button" className="close-button" onClick={onClose}>×</button></div>
    {examError && <div className="alert error form-alert">{examError}</div>}
    {config.key === 'results' && !loadingExams && !examError && activeExams.length === 0 && <div className="alert neutral form-alert">Create an active exam before recording results.</div>}
    {formError && <div className="alert error form-alert">{formError}</div>}
    <div className="form-grid">{config.fields.map(([key, label, type, required, options]) => <label key={key} className={type === 'textarea' ? 'span-two' : ''}>{label}{config.key === 'results' && key === 'exam_id' ? <select value={values[key]} required={required} disabled={loadingExams || Boolean(examError) || activeExams.length === 0} onChange={event => { setValues({ ...values, [key]: event.target.value }); setFormError(''); }}><option value="">Select active exam</option>{activeExams.map(exam => <option key={exam.id} value={exam.id}>#{exam.id} · {exam.exam_name} ({exam.course_code}) · max {exam.max_marks}</option>)}</select> : type === 'textarea' ? <textarea value={values[key]} required={required} rows="3" onChange={event => setValues({ ...values, [key]: event.target.value })} /> : type === 'select' ? <select value={values[key]} required={required} onChange={event => setValues({ ...values, [key]: event.target.value })}><option value="">Select {label.toLowerCase()}</option>{options.map(value => <option key={value} value={value}>{value === 'all' ? 'Everyone · broadcast' : humanize(value)}</option>)}</select> : <input type={type} value={values[key]} required={required} min={type === 'number' ? key === 'marks_obtained' || key === 'capacity' ? 0 : 1 : undefined} max={key === 'marks_obtained' && selectedExam ? selectedExam.max_marks : undefined} step={type === 'number' && key === 'amount' ? '0.01' : '1'} onChange={event => { setValues({ ...values, [key]: event.target.value }); setFormError(''); }} />}{config.key === 'results' && key === 'marks_obtained' && selectedExam && <small className="field-hint">Maximum for this exam: {selectedExam.max_marks}</small>}</label>)}</div>
    <div className="modal-footer"><button type="button" className="button secondary" disabled={saving} onClick={onClose}>Cancel</button><button className="button primary" disabled={saving || resultFormBlocked}>{saving ? <><span className="spinner" /> Saving…</> : dialog.mode === 'edit' ? 'Save changes' : 'Create record'}</button></div></form></section></div>;
}
function humanize(value = '') { return String(value).replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()); }
function formatDate(value) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date); }
function renderCell(value, key) {
  if (value === null && key === 'target_role') return 'Everyone';
  if (value === undefined || value === null || value === '') return <span className="muted-cell">—</span>;
  if (key.includes('date') || key.endsWith('_at')) return formatDate(value);
  if (typeof value === 'string' && ['status', 'record_status', 'target_role'].includes(key)) return <span className={`status-pill ${String(value).toLowerCase()}`}>{value}</span>;
  if (typeof value === 'string' && value.length > 64) return `${value.slice(0, 61)}…`;
  return String(value);
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
