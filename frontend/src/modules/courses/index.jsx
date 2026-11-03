import React, { useCallback, useEffect, useState } from 'react';

const PAGE_SIZE = 20;
const STATUSES = ['active', 'archived'];

function isPositiveInteger(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0;
}

function CourseDialog({ item, mode, onClose, onSave, saving }) {
  const [values, setValues] = useState({
    course_code: item?.course_code ?? '',
    title: item?.title ?? '',
    description: item?.description ?? '',
    credits: item?.credits ?? '',
    department: item?.department ?? '',
    semester: item?.semester ?? '',
    instructor_name: item?.instructor_name ?? '',
    capacity: item?.capacity ?? '',
    status: item?.status ?? 'active'
  });
  const [formError, setFormError] = useState('');
  const readOnly = mode === 'view';

  function update(event) {
    setValues(current => ({ ...current, [event.target.name]: event.target.value }));
    setFormError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (!values.course_code.trim()) {
      setFormError('Course code is required.');
      return;
    }
    if (!values.title.trim()) {
      setFormError('Title is required.');
      return;
    }
    if (!/^\d+$/.test(String(values.credits)) || Number(values.credits) < 1 || Number(values.credits) > 6) {
      setFormError('Credits must be a whole number from 1 to 6.');
      return;
    }
    if (values.semester && !isPositiveInteger(values.semester)) {
      setFormError('Semester must be a positive whole number.');
      return;
    }
    if (values.capacity && (!/^\d+$/.test(String(values.capacity)) || Number(values.capacity) < 0)) {
      setFormError('Capacity must be a non-negative whole number.');
      return;
    }
    if (!STATUSES.includes(values.status)) {
      setFormError('Choose active or archived.');
      return;
    }
    const error = await onSave({
      course_code: values.course_code.trim(),
      title: values.title.trim(),
      description: values.description.trim() || null,
      credits: Number(values.credits),
      department: values.department.trim() || null,
      semester: values.semester ? Number(values.semester) : null,
      instructor_name: values.instructor_name.trim() || null,
      capacity: values.capacity === '' ? null : Number(values.capacity),
      status: values.status
    });
    if (error) setFormError(error);
  }

  const details = [
    ['Course ID', item?.id],
    ['Course code', item?.course_code],
    ['Title', item?.title],
    ['Description', item?.description || '—'],
    ['Credits', item?.credits],
    ['Department', item?.department || '—'],
    ['Semester', item?.semester ?? '—'],
    ['Instructor', item?.instructor_name || '—'],
    ['Capacity', item?.capacity ?? '—'],
    ['Status', item?.status],
    ['Created', item?.created_at ? new Date(item.created_at).toLocaleString() : '—'],
    ['Updated', item?.updated_at ? new Date(item.updated_at).toLocaleString() : '—']
  ];

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="course-dialog-title">
      <div className="modal-header">
        <div><span className="eyebrow">{readOnly ? 'RECORD DETAILS' : mode === 'edit' ? 'UPDATE RECORD' : 'NEW RECORD'}</span><h2 id="course-dialog-title">{readOnly ? `Course #${item.id}` : mode === 'edit' ? 'Edit course' : 'Add course'}</h2></div>
        <button type="button" className="close-button" aria-label="Close dialog" onClick={onClose}>×</button>
      </div>
      {readOnly ? <div className="detail-grid">
        {details.map(([label, value]) => <div className="detail-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div> : <form onSubmit={submit}>
        <div className="form-grid">
          <label>Course code<input name="course_code" maxLength="100" value={values.course_code} onChange={update} required /></label>
          <label>Title<input name="title" maxLength="255" value={values.title} onChange={update} required /></label>
          <label className="span-two">Description<textarea name="description" value={values.description} onChange={update} rows="3" /></label>
          <label>Credits<input name="credits" type="number" min="1" max="6" step="1" value={values.credits} onChange={update} required /></label>
          <label>Department<input name="department" maxLength="255" value={values.department} onChange={update} /></label>
          <label>Semester<input name="semester" type="number" min="1" step="1" value={values.semester} onChange={update} /></label>
          <label>Instructor name<input name="instructor_name" maxLength="255" value={values.instructor_name} onChange={update} /></label>
          <label>Capacity<input name="capacity" type="number" min="0" step="1" value={values.capacity} onChange={update} /></label>
          <label>Status<select name="status" value={values.status} onChange={update} required>{STATUSES.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
        </div>
        {formError && <div className="alert error form-alert" role="alert">{formError}</div>}
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create course'}</button>
        </div>
      </form>}
      {readOnly && <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Close</button></div>}
    </section>
  </div>;
}

export default function CoursesPage({ request, token, user }) {
  const [courses, setCourses] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [filterInput, setFilterInput] = useState({ department: '', semester: '', status: '' });
  const [query, setQuery] = useState({ q: '', department: '', semester: '', status: '' });
  const [busy, setBusy] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const canWrite = user?.role === 'admin';

  const loadCourses = useCallback(async () => {
    if (typeof request !== 'function') {
      setBusy(false);
      setLoadFailed(true);
      setError('The authenticated API request client was not provided.');
      return;
    }
    setBusy(true);
    setLoadFailed(false);
    setError('');
    try {
      const response = await request('/courses', { token, query: { page, limit: PAGE_SIZE, ...query } });
      if (!Array.isArray(response.courses) || !response.pagination) throw new Error('The course service returned an invalid list response.');
      setCourses(response.courses);
      setPagination(response.pagination);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load courses.');
      setLoadFailed(true);
      setCourses([]);
      setPagination({ total: 0, pages: 0 });
    } finally {
      setBusy(false);
    }
  }, [page, query, request, token]);

  useEffect(() => { loadCourses(); }, [loadCourses]);

  async function saveCourse(values) {
    setSaving(true);
    setError('');
    try {
      const editing = dialog.mode === 'edit';
      await request(`/courses${editing ? `/${dialog.item.id}` : ''}`, { token, method: editing ? 'PUT' : 'POST', body: values });
      setDialog(null);
      setNotice(editing ? 'Course updated.' : 'Course created.');
      await loadCourses();
      return null;
    } catch (requestError) {
      return requestError.message || 'Unable to save this course.';
    } finally {
      setSaving(false);
    }
  }

  async function archiveCourse(course) {
    if (!window.confirm(`Archive ${course.course_code} — ${course.title}? This changes the course status to archived.`)) return;
    setError('');
    setNotice('');
    try {
      await request(`/courses/${course.id}`, { token, method: 'DELETE' });
      setNotice('Course archived.');
      await loadCourses();
    } catch (requestError) {
      setError(requestError.message || 'Unable to archive this course.');
    }
  }

  function applyFilters(event) {
    event.preventDefault();
    const semester = filterInput.semester.trim();
    if (semester && !isPositiveInteger(semester)) {
      setError('Semester filter must be a positive whole number.');
      return;
    }
    setError('');
    setPage(1);
    setQuery({ q: searchInput.trim(), department: filterInput.department.trim(), semester, status: filterInput.status });
  }

  const firstCourse = courses.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  return <>
    <div className="page-heading">
      <div><span className="eyebrow">CAMPUS MANAGEMENT</span><h1>Courses</h1><p>Browse the course catalog and manage course offerings.</p></div>
      {canWrite && <button className="button primary" onClick={() => { setError(''); setNotice(''); setDialog({ mode: 'create' }); }}>＋ Add course</button>}
    </div>
    {notice && <div className="alert success">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    <section className="panel table-panel">
      <div className="table-toolbar">
        <div><span className="eyebrow">RECORDS</span><h2>Course catalog</h2></div>
        <form className="resource-filters" onSubmit={applyFilters}>
          <label className="search-form"><span>⌕</span><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search courses" aria-label="Search courses" /></label>
          <label className="filter-field">Department<input value={filterInput.department} onChange={event => setFilterInput(current => ({ ...current, department: event.target.value }))} placeholder="All departments" /></label>
          <label className="filter-field">Semester<input type="number" min="1" step="1" value={filterInput.semester} onChange={event => setFilterInput(current => ({ ...current, semester: event.target.value }))} /></label>
          <label className="filter-field">Status<select value={filterInput.status} onChange={event => setFilterInput(current => ({ ...current, status: event.target.value }))}><option value="">All</option>{STATUSES.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
          <button className="button secondary filter-submit" type="submit">Apply</button>
        </form>
      </div>
      {error && <div className="alert error table-alert" role="alert">{error}<button onClick={loadCourses}>Try again</button></div>}
      {busy ? <div className="table-state-panel" role="status"><div className="empty-state"><strong>Loading courses…</strong></div></div>
        : loadFailed ? <div className="table-state-panel" role="status"><div className="empty-state unavailable-state"><strong>Courses unavailable</strong><span>Try again when the service is available.</span></div></div>
          : courses.length === 0 ? <div className="table-state-panel" role="status"><div className="empty-state"><strong>{query.q || query.department || query.semester || query.status ? 'No matching courses' : 'No courses yet'}</strong><span>Course records from the service will appear here.</span></div></div>
            : <div className="table-scroll"><table><thead><tr>{['Course code', 'Title', 'Department', 'Credits', 'Semester', 'Instructor', 'Status'].map(column => <th key={column}>{column}</th>)}<th className="actions-head">Actions</th></tr></thead><tbody>
              {courses.map(course => <tr key={course.id}>
                <td>{course.course_code}</td><td>{course.title}</td><td>{course.department || <span className="muted-cell">—</span>}</td><td>{course.credits}</td><td>{course.semester ?? <span className="muted-cell">—</span>}</td><td>{course.instructor_name || <span className="muted-cell">—</span>}</td><td><span className={`status-pill ${course.status}`}>{course.status}</span></td>
                <td className="row-actions"><button className="action-button" onClick={() => setDialog({ mode: 'view', item: course })}>View</button>{canWrite && <><button className="action-button" onClick={() => { setError(''); setNotice(''); setDialog({ mode: 'edit', item: course }); }}>Edit</button><button className="action-button danger-text" onClick={() => archiveCourse(course)}>Archive</button></>}</td>
              </tr>)}
            </tbody></table></div>}
      <div className="table-footer"><span>{busy ? 'Loading records…' : loadFailed ? 'Record count unavailable' : `Showing ${firstCourse}–${firstCourse + courses.length - 1} of ${pagination.total}`}</span>
        <div className="pagination"><button disabled={page <= 1 || busy} onClick={() => setPage(current => current - 1)}>← Previous</button><span>Page {page}{pagination.pages ? ` of ${pagination.pages}` : ''}</span><button disabled={page >= pagination.pages || busy} onClick={() => setPage(current => current + 1)}>Next →</button></div>
      </div>
    </section>
    {dialog && <CourseDialog item={dialog.item} mode={dialog.mode} onClose={() => setDialog(null)} onSave={saveCourse} saving={saving} />}
  </>;
}
