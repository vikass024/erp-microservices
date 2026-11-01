import React, { useCallback, useEffect, useState } from 'react';

const PAGE_SIZE = 20;
const STATUSES = ['present', 'absent', 'leave'];

function isPositiveInteger(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function AttendanceDialog({ item, mode, onClose, onSave, saving }) {
  const [values, setValues] = useState({
    student_id: item?.student_id ?? '',
    date: item?.date ? String(item.date).slice(0, 10) : '',
    status: item?.status ?? 'present',
    remarks: item?.remarks ?? ''
  });
  const [formError, setFormError] = useState('');
  const readOnly = mode === 'view';

  function update(event) {
    setValues(current => ({ ...current, [event.target.name]: event.target.value }));
    setFormError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (!isPositiveInteger(values.student_id)) {
      setFormError('Student ID must be a positive whole number.');
      return;
    }
    if (!isValidDate(values.date)) {
      setFormError('Date must be a valid calendar date.');
      return;
    }
    if (!STATUSES.includes(values.status)) {
      setFormError('Choose present, absent, or leave.');
      return;
    }
    const error = await onSave({
      student_id: Number(values.student_id),
      date: values.date,
      status: values.status,
      remarks: values.remarks === '' ? null : values.remarks
    });
    if (error) setFormError(error);
  }

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="attendance-dialog-title">
      <div className="modal-header">
        <div><span className="eyebrow">{readOnly ? 'RECORD DETAILS' : mode === 'edit' ? 'UPDATE RECORD' : 'NEW RECORD'}</span><h2 id="attendance-dialog-title">{readOnly ? `Attendance #${item.id}` : mode === 'edit' ? 'Edit attendance' : 'Add attendance'}</h2></div>
        <button type="button" className="close-button" aria-label="Close dialog" onClick={onClose}>×</button>
      </div>
      {readOnly ? <div className="detail-grid">
        {[
          ['Record ID', item.id],
          ['Student ID', item.student_id],
          ['Date', item.date ? String(item.date).slice(0, 10) : '—'],
          ['Status', item.status],
          ['Remarks', item.remarks || '—'],
          ['Record status', item.record_status || '—'],
          ['Created', item.created_at ? new Date(item.created_at).toLocaleString() : '—']
        ].map(([label, value]) => <div className="detail-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div> : <form onSubmit={submit}>
        <div className="form-grid">
          <label>Student ID<input name="student_id" type="number" min="1" step="1" value={values.student_id} onChange={update} required readOnly={readOnly} /></label>
          <label>Date<input name="date" type="date" value={values.date} onChange={update} required readOnly={readOnly} /></label>
          <label>Status<select name="status" value={values.status} onChange={update} required disabled={readOnly}>{STATUSES.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
          <label className="span-two">Remarks<textarea name="remarks" value={values.remarks} onChange={update} rows="3" readOnly={readOnly} /></label>
        </div>
        {formError && <div className="alert error form-alert" role="alert">{formError}</div>}
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create attendance'}</button>
        </div>
      </form>}
      {readOnly && <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Close</button></div>}
    </section>
  </div>;
}

export default function AttendancePage({ request, token, user }) {
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [filterInput, setFilterInput] = useState({ student_id: '', date: '', status: '' });
  const [query, setQuery] = useState({ q: '', student_id: '', date: '', status: '' });
  const [busy, setBusy] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const canWrite = ['admin', 'faculty'].includes(user?.role);

  const loadRecords = useCallback(async () => {
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
      const response = await request('/attendance', {
        token,
        query: { page, limit: PAGE_SIZE, ...query }
      });
      setRecords(response.attendances);
      setPagination(response.pagination);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load attendance records.');
      setLoadFailed(true);
      setRecords([]);
      setPagination({ total: 0, pages: 0 });
    } finally {
      setBusy(false);
    }
  }, [page, query, request, token]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  async function saveRecord(values) {
    setSaving(true);
    setError('');
    try {
      const editing = dialog.mode === 'edit';
      await request(`/attendance${editing ? `/${dialog.item.id}` : ''}`, {
        token,
        method: editing ? 'PUT' : 'POST',
        body: values
      });
      setDialog(null);
      setNotice(editing ? 'Attendance record updated.' : 'Attendance record created.');
      await loadRecords();
      return null;
    } catch (requestError) {
      return requestError.message || 'Unable to save this attendance record.';
    } finally {
      setSaving(false);
    }
  }

  async function archiveRecord(record) {
    if (!window.confirm(`Archive attendance record #${record.id}? It will no longer appear in the active records list.`)) return;
    setError('');
    setNotice('');
    try {
      await request(`/attendance/${record.id}`, { token, method: 'DELETE' });
      setNotice('Attendance record archived.');
      await loadRecords();
    } catch (requestError) {
      setError(requestError.message || 'Unable to archive this attendance record.');
    }
  }

  function applyFilters(event) {
    event.preventDefault();
    const studentId = filterInput.student_id.trim();
    if (studentId && !isPositiveInteger(studentId)) {
      setError('Student ID filter must be a positive whole number.');
      return;
    }
    if (filterInput.date && !isValidDate(filterInput.date)) {
      setError('Date filter must be a valid calendar date.');
      return;
    }
    setError('');
    setPage(1);
    setQuery({
      q: searchInput.trim(),
      student_id: studentId,
      date: filterInput.date,
      status: filterInput.status
    });
  }

  const firstRecord = records.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  return <>
    <div className="page-heading">
      <div><span className="eyebrow">CAMPUS MANAGEMENT</span><h1>Attendance</h1><p>Review and record daily student attendance.</p></div>
      {canWrite && <button className="button primary" onClick={() => { setNotice(''); setDialog({ mode: 'create' }); }}>＋ Add attendance</button>}
    </div>
    {!canWrite && <div className="role-note">You can view attendance records. Creating, editing, or archiving records requires an admin or faculty role.</div>}
    {notice && <div className="alert success">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    <section className="panel table-panel">
      <div className="table-toolbar">
        <div><span className="eyebrow">RECORDS</span><h2>Attendance directory</h2></div>
        <form className="resource-filters" onSubmit={applyFilters}>
          <label className="search-form"><span>⌕</span><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search attendance" aria-label="Search attendance" /></label>
          <label className="filter-field">Student ID<input type="number" min="1" step="1" value={filterInput.student_id} onChange={event => setFilterInput(current => ({ ...current, student_id: event.target.value }))} /></label>
          <label className="filter-field">Date<input type="date" value={filterInput.date} onChange={event => setFilterInput(current => ({ ...current, date: event.target.value }))} /></label>
          <label className="filter-field">Status<select value={filterInput.status} onChange={event => setFilterInput(current => ({ ...current, status: event.target.value }))}><option value="">All</option>{STATUSES.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
          <button className="button secondary filter-submit" type="submit">Apply</button>
        </form>
      </div>
      {error && <div className="alert error table-alert" role="alert">{error}<button onClick={loadRecords}>Try again</button></div>}
      {busy ? <div className="table-state-panel" role="status"><div className="empty-state"><strong>Loading attendance…</strong></div></div>
        : loadFailed ? <div className="table-state-panel" role="status"><div className="empty-state unavailable-state"><strong>Attendance unavailable</strong><span>Try again when the service is available.</span></div></div>
          : records.length === 0 ? <div className="table-state-panel" role="status"><div className="empty-state"><strong>{query.q || query.student_id || query.date || query.status ? 'No matching records' : 'No attendance records yet'}</strong><span>Attendance records from the service will appear here.</span></div></div>
            : <div className="table-scroll"><table><thead><tr>{['Student ID', 'Date', 'Status', 'Remarks', 'Record status'].map(column => <th key={column}>{column}</th>)}<th className="actions-head">Actions</th></tr></thead><tbody>
              {records.map(record => <tr key={record.id}>
                <td>{record.student_id}</td><td>{String(record.date).slice(0, 10)}</td><td><span className={`status-pill ${record.status}`}>{record.status}</span></td>
                <td>{record.remarks || <span className="muted-cell">—</span>}</td><td><span className={`status-pill ${record.record_status}`}>{record.record_status}</span></td>
                <td className="row-actions"><button className="action-button" onClick={() => setDialog({ mode: 'view', item: record })}>View</button>{canWrite && <><button className="action-button" onClick={() => { setNotice(''); setDialog({ mode: 'edit', item: record }); }}>Edit</button><button className="action-button danger-text" onClick={() => archiveRecord(record)}>Archive</button></>}</td>
              </tr>)}
            </tbody></table></div>}
      <div className="table-footer"><span>{busy ? 'Loading records…' : loadFailed ? 'Record count unavailable' : `Showing ${firstRecord}–${firstRecord + records.length - 1} of ${pagination.total}`}</span>
        <div className="pagination"><button disabled={page <= 1 || busy} onClick={() => setPage(current => current - 1)}>← Previous</button><span>Page {page}{pagination.pages ? ` of ${pagination.pages}` : ''}</span><button disabled={page >= pagination.pages || busy} onClick={() => setPage(current => current + 1)}>Next →</button></div>
      </div>
    </section>
    {dialog && <AttendanceDialog item={dialog.item} mode={dialog.mode} onClose={() => setDialog(null)} onSave={saveRecord} saving={saving} />}
  </>;
}
