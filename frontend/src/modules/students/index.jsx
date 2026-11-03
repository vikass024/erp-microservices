import React, { useCallback, useEffect, useState } from 'react';

const PAGE_SIZE = 20;
const STATUSES = ['active', 'inactive', 'graduated'];

function isPositiveInteger(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function StudentDialog({ item, mode, onClose, onSave, saving }) {
  const [values, setValues] = useState({
    roll_number: item?.roll_number ?? '',
    first_name: item?.first_name ?? '',
    last_name: item?.last_name ?? '',
    email: item?.email ?? '',
    phone: item?.phone ?? '',
    date_of_birth: item?.date_of_birth ? String(item.date_of_birth).slice(0, 10) : '',
    department: item?.department ?? '',
    program: item?.program ?? '',
    year_of_study: item?.year_of_study ?? '',
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
    for (const field of ['roll_number', 'first_name', 'last_name']) {
      if (!values[field].trim()) {
        setFormError(`${field.replaceAll('_', ' ')} is required.`);
        return;
      }
    }
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      setFormError('Enter a valid email address.');
      return;
    }
    if (values.date_of_birth && !isValidDate(values.date_of_birth)) {
      setFormError('Date of birth must be a valid calendar date.');
      return;
    }
    if (values.year_of_study && !isPositiveInteger(values.year_of_study)) {
      setFormError('Year of study must be a positive whole number.');
      return;
    }
    if (!STATUSES.includes(values.status)) {
      setFormError('Choose active, inactive, or graduated.');
      return;
    }
    const error = await onSave({
      roll_number: values.roll_number.trim(),
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim(),
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      date_of_birth: values.date_of_birth || null,
      department: values.department.trim() || null,
      program: values.program.trim() || null,
      year_of_study: values.year_of_study ? Number(values.year_of_study) : null,
      status: values.status
    });
    if (error) setFormError(error);
  }

  const details = [
    ['Student ID', item?.id],
    ['Roll number', item?.roll_number],
    ['First name', item?.first_name],
    ['Last name', item?.last_name],
    ['Email', item?.email || '—'],
    ['Phone', item?.phone || '—'],
    ['Date of birth', item?.date_of_birth ? String(item.date_of_birth).slice(0, 10) : '—'],
    ['Department', item?.department || '—'],
    ['Program', item?.program || '—'],
    ['Year of study', item?.year_of_study ?? '—'],
    ['Status', item?.status],
    ['Created', item?.created_at ? new Date(item.created_at).toLocaleString() : '—'],
    ['Updated', item?.updated_at ? new Date(item.updated_at).toLocaleString() : '—']
  ];

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="student-dialog-title">
      <div className="modal-header">
        <div><span className="eyebrow">{readOnly ? 'RECORD DETAILS' : mode === 'edit' ? 'UPDATE RECORD' : 'NEW RECORD'}</span><h2 id="student-dialog-title">{readOnly ? `Student #${item.id}` : mode === 'edit' ? 'Edit student' : 'Add student'}</h2></div>
        <button type="button" className="close-button" aria-label="Close dialog" onClick={onClose}>×</button>
      </div>
      {readOnly ? <div className="detail-grid">
        {details.map(([label, value]) => <div className="detail-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div> : <form onSubmit={submit}>
        <div className="form-grid">
          <label>Roll number<input name="roll_number" maxLength="100" value={values.roll_number} onChange={update} required /></label>
          <label>First name<input name="first_name" maxLength="255" value={values.first_name} onChange={update} required /></label>
          <label>Last name<input name="last_name" maxLength="255" value={values.last_name} onChange={update} required /></label>
          <label>Email<input name="email" type="email" maxLength="255" value={values.email} onChange={update} /></label>
          <label>Phone<input name="phone" type="tel" maxLength="50" value={values.phone} onChange={update} /></label>
          <label>Date of birth<input name="date_of_birth" type="date" value={values.date_of_birth} onChange={update} /></label>
          <label>Department<input name="department" maxLength="255" value={values.department} onChange={update} /></label>
          <label>Program<input name="program" maxLength="255" value={values.program} onChange={update} /></label>
          <label>Year of study<input name="year_of_study" type="number" min="1" step="1" value={values.year_of_study} onChange={update} /></label>
          <label>Status<select name="status" value={values.status} onChange={update} required>{STATUSES.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
        </div>
        {formError && <div className="alert error form-alert" role="alert">{formError}</div>}
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create student'}</button>
        </div>
      </form>}
      {readOnly && <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Close</button></div>}
    </section>
  </div>;
}

export default function StudentsPage({ request, token, user }) {
  const [students, setStudents] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [filterInput, setFilterInput] = useState({ department: '', year_of_study: '', status: '' });
  const [query, setQuery] = useState({ q: '', department: '', year_of_study: '', status: '' });
  const [busy, setBusy] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const canWrite = user?.role === 'admin';

  const loadStudents = useCallback(async () => {
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
      const response = await request('/students', { token, query: { page, limit: PAGE_SIZE, ...query } });
      if (!Array.isArray(response.students) || !response.pagination) throw new Error('The student service returned an invalid list response.');
      setStudents(response.students);
      setPagination(response.pagination);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load students.');
      setLoadFailed(true);
      setStudents([]);
      setPagination({ total: 0, pages: 0 });
    } finally {
      setBusy(false);
    }
  }, [page, query, request, token]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  async function saveStudent(values) {
    setSaving(true);
    setError('');
    try {
      const editing = dialog.mode === 'edit';
      await request(`/students${editing ? `/${dialog.item.id}` : ''}`, { token, method: editing ? 'PUT' : 'POST', body: values });
      setDialog(null);
      setNotice(editing ? 'Student updated.' : 'Student created.');
      await loadStudents();
      return null;
    } catch (requestError) {
      return requestError.message || 'Unable to save this student.';
    } finally {
      setSaving(false);
    }
  }

  async function deactivateStudent(student) {
    if (!window.confirm(`Deactivate ${student.first_name} ${student.last_name}? This changes the student status to inactive.`)) return;
    setError('');
    setNotice('');
    try {
      await request(`/students/${student.id}`, { token, method: 'DELETE' });
      setNotice('Student deactivated.');
      await loadStudents();
    } catch (requestError) {
      setError(requestError.message || 'Unable to deactivate this student.');
    }
  }

  function applyFilters(event) {
    event.preventDefault();
    const year = filterInput.year_of_study.trim();
    if (year && !isPositiveInteger(year)) {
      setError('Year of study filter must be a positive whole number.');
      return;
    }
    setError('');
    setPage(1);
    setQuery({ q: searchInput.trim(), department: filterInput.department.trim(), year_of_study: year, status: filterInput.status });
  }

  const firstStudent = students.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  return <>
    <div className="page-heading">
      <div><span className="eyebrow">CAMPUS MANAGEMENT</span><h1>Students</h1><p>Browse student records and enrollment details.</p></div>
      {canWrite && <button className="button primary" onClick={() => { setError(''); setNotice(''); setDialog({ mode: 'create' }); }}>＋ Add student</button>}
    </div>
    {notice && <div className="alert success">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    <section className="panel table-panel">
      <div className="table-toolbar">
        <div><span className="eyebrow">RECORDS</span><h2>Student directory</h2></div>
        <form className="resource-filters" onSubmit={applyFilters}>
          <label className="search-form"><span>⌕</span><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search students" aria-label="Search students" /></label>
          <label className="filter-field">Department<input value={filterInput.department} onChange={event => setFilterInput(current => ({ ...current, department: event.target.value }))} placeholder="All departments" /></label>
          <label className="filter-field">Year<input type="number" min="1" step="1" value={filterInput.year_of_study} onChange={event => setFilterInput(current => ({ ...current, year_of_study: event.target.value }))} /></label>
          <label className="filter-field">Status<select value={filterInput.status} onChange={event => setFilterInput(current => ({ ...current, status: event.target.value }))}><option value="">All</option>{STATUSES.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
          <button className="button secondary filter-submit" type="submit">Apply</button>
        </form>
      </div>
      {error && <div className="alert error table-alert" role="alert">{error}<button onClick={loadStudents}>Try again</button></div>}
      {busy ? <div className="table-state-panel" role="status"><div className="empty-state"><strong>Loading students…</strong></div></div>
        : loadFailed ? <div className="table-state-panel" role="status"><div className="empty-state unavailable-state"><strong>Students unavailable</strong><span>Try again when the service is available.</span></div></div>
          : students.length === 0 ? <div className="table-state-panel" role="status"><div className="empty-state"><strong>{query.q || query.department || query.year_of_study || query.status ? 'No matching students' : 'No students yet'}</strong><span>Student records from the service will appear here.</span></div></div>
            : <div className="table-scroll"><table><thead><tr>{['Roll number', 'Name', 'Email', 'Department', 'Program', 'Year', 'Status'].map(column => <th key={column}>{column}</th>)}<th className="actions-head">Actions</th></tr></thead><tbody>
              {students.map(student => <tr key={student.id}>
                <td>{student.roll_number}</td><td>{student.first_name} {student.last_name}</td><td>{student.email || <span className="muted-cell">—</span>}</td><td>{student.department || <span className="muted-cell">—</span>}</td><td>{student.program || <span className="muted-cell">—</span>}</td><td>{student.year_of_study ?? <span className="muted-cell">—</span>}</td><td><span className={`status-pill ${student.status}`}>{student.status}</span></td>
                <td className="row-actions"><button className="action-button" onClick={() => setDialog({ mode: 'view', item: student })}>View</button>{canWrite && <><button className="action-button" onClick={() => { setError(''); setNotice(''); setDialog({ mode: 'edit', item: student }); }}>Edit</button><button className="action-button danger-text" onClick={() => deactivateStudent(student)}>Deactivate</button></>}</td>
              </tr>)}
            </tbody></table></div>}
      <div className="table-footer"><span>{busy ? 'Loading records…' : loadFailed ? 'Record count unavailable' : `Showing ${firstStudent}–${firstStudent + students.length - 1} of ${pagination.total}`}</span>
        <div className="pagination"><button disabled={page <= 1 || busy} onClick={() => setPage(current => current - 1)}>← Previous</button><span>Page {page}{pagination.pages ? ` of ${pagination.pages}` : ''}</span><button disabled={page >= pagination.pages || busy} onClick={() => setPage(current => current + 1)}>Next →</button></div>
      </div>
    </section>
    {dialog && <StudentDialog item={dialog.item} mode={dialog.mode} onClose={() => setDialog(null)} onSave={saveStudent} saving={saving} />}
  </>;
}
