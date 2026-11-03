import React, { useCallback, useEffect, useState } from 'react';

const PAGE_SIZE = 20;
const REQUIRED_FIELDS = ['name', 'employee_code', 'department', 'designation', 'email'];

function FacultyDialog({ item, mode, onClose, onSave, saving }) {
  const [values, setValues] = useState({
    name: item?.name ?? '',
    employee_code: item?.employee_code ?? '',
    department: item?.department ?? '',
    designation: item?.designation ?? '',
    email: item?.email ?? '',
    phone: item?.phone ?? '',
    record_status: item?.record_status ?? 'active'
  });
  const [formError, setFormError] = useState('');
  const readOnly = mode === 'view';

  function update(event) {
    setValues(current => ({ ...current, [event.target.name]: event.target.value }));
    setFormError('');
  }

  async function submit(event) {
    event.preventDefault();
    for (const field of REQUIRED_FIELDS) {
      if (!values[field].trim()) {
        setFormError(`${field.replaceAll('_', ' ')} is required.`);
        return;
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      setFormError('Enter a valid email address.');
      return;
    }
    if (!['active', 'archived'].includes(values.record_status)) {
      setFormError('Record status must be active or archived.');
      return;
    }
    const error = await onSave({
      name: values.name.trim(),
      employee_code: values.employee_code.trim(),
      department: values.department.trim(),
      designation: values.designation.trim(),
      email: values.email.trim(),
      phone: values.phone === '' ? null : values.phone.trim(),
      record_status: values.record_status
    });
    if (error) setFormError(error);
  }

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="faculty-dialog-title">
      <div className="modal-header">
        <div><span className="eyebrow">{readOnly ? 'RECORD DETAILS' : mode === 'edit' ? 'UPDATE RECORD' : 'NEW RECORD'}</span><h2 id="faculty-dialog-title">{readOnly ? `Faculty #${item.id}` : mode === 'edit' ? 'Edit faculty member' : 'Add faculty member'}</h2></div>
        <button type="button" className="close-button" aria-label="Close dialog" onClick={onClose}>×</button>
      </div>
      {readOnly ? <div className="detail-grid">
        {[
          ['Record ID', item.id],
          ['Name', item.name],
          ['Employee code', item.employee_code],
          ['Department', item.department],
          ['Designation', item.designation],
          ['Email', item.email],
          ['Phone', item.phone || '—'],
          ['Record status', item.record_status || '—'],
          ['Created', item.created_at ? new Date(item.created_at).toLocaleString() : '—']
        ].map(([label, value]) => <div className="detail-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div> : <form onSubmit={submit}>
        <div className="form-grid">
          <label>Full name<input name="name" value={values.name} onChange={update} required readOnly={readOnly} /></label>
          <label>Employee code<input name="employee_code" value={values.employee_code} onChange={update} required readOnly={readOnly} /></label>
          <label>Department<input name="department" value={values.department} onChange={update} required readOnly={readOnly} /></label>
          <label>Designation<input name="designation" value={values.designation} onChange={update} required readOnly={readOnly} /></label>
          <label>Email<input name="email" type="email" value={values.email} onChange={update} required readOnly={readOnly} /></label>
          <label>Phone<input name="phone" type="tel" value={values.phone} onChange={update} readOnly={readOnly} /></label>
          <label>Record status<select name="record_status" value={values.record_status} onChange={update} disabled={readOnly}><option value="active">Active</option><option value="archived">Archived</option></select></label>
        </div>
        {formError && <div className="alert error form-alert" role="alert">{formError}</div>}
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create faculty member'}</button>
        </div>
      </form>}
      {readOnly && <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Close</button></div>}
    </section>
  </div>;
}

export default function FacultyPage({ request, token, user }) {
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });
  const [departmentInput, setDepartmentInput] = useState('');
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const canWrite = user?.role === 'admin';

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
      const response = await request('/faculty', {
        token,
        query: { page, limit: PAGE_SIZE, ...(department ? { department } : {}) }
      });
      setRecords(response.faculties);
      setPagination(response.pagination);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load faculty records.');
      setLoadFailed(true);
      setRecords([]);
      setPagination({ total: 0, pages: 0 });
    } finally {
      setBusy(false);
    }
  }, [department, page, request, token]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  async function saveRecord(values) {
    setSaving(true);
    setError('');
    try {
      const editing = dialog.mode === 'edit';
      await request(`/faculty${editing ? `/${dialog.item.id}` : ''}`, {
        token,
        method: editing ? 'PUT' : 'POST',
        body: values
      });
      setDialog(null);
      setNotice(editing ? 'Faculty member updated.' : 'Faculty member created.');
      await loadRecords();
      return null;
    } catch (requestError) {
      return requestError.message || 'Unable to save this faculty member.';
    } finally {
      setSaving(false);
    }
  }

  async function archiveRecord(record) {
    if (!window.confirm(`Archive ${record.name}? The record will remain stored but will no longer appear in the active faculty list.`)) return;
    setError('');
    setNotice('');
    try {
      await request(`/faculty/${record.id}`, { token, method: 'DELETE' });
      setNotice('Faculty member archived.');
      await loadRecords();
    } catch (requestError) {
      setError(requestError.message || 'Unable to archive this faculty member.');
    }
  }

  function applyDepartment(event) {
    event.preventDefault();
    setPage(1);
    setDepartment(departmentInput.trim());
  }

  const firstRecord = records.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  return <>
    <div className="page-heading">
      <div><span className="eyebrow">CAMPUS MANAGEMENT</span><h1>Faculty</h1><p>Keep faculty directory details current.</p></div>
      {canWrite && <button className="button primary" onClick={() => { setNotice(''); setDialog({ mode: 'create' }); }}>＋ Add faculty member</button>}
    </div>
    {notice && <div className="alert success">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    <section className="panel table-panel">
      <div className="table-toolbar">
        <div><span className="eyebrow">RECORDS</span><h2>Faculty directory</h2></div>
        <form className="resource-filters" onSubmit={applyDepartment}>
          <label className="filter-field">Department<input value={departmentInput} onChange={event => setDepartmentInput(event.target.value)} placeholder="All departments" /></label>
          <button className="button secondary filter-submit" type="submit">Apply</button>
        </form>
      </div>
      {error && <div className="alert error table-alert" role="alert">{error}<button onClick={loadRecords}>Try again</button></div>}
      {busy ? <div className="table-state-panel" role="status"><div className="empty-state"><strong>Loading faculty…</strong></div></div>
        : loadFailed ? <div className="table-state-panel" role="status"><div className="empty-state unavailable-state"><strong>Faculty unavailable</strong><span>Try again when the service is available.</span></div></div>
          : records.length === 0 ? <div className="table-state-panel" role="status"><div className="empty-state"><strong>{department ? 'No matching faculty' : 'No faculty records yet'}</strong><span>Faculty records from the service will appear here.</span></div></div>
            : <div className="table-scroll"><table><thead><tr>{['Employee code', 'Name', 'Department', 'Designation', 'Email', 'Phone'].map(column => <th key={column}>{column}</th>)}<th className="actions-head">Actions</th></tr></thead><tbody>
              {records.map(record => <tr key={record.id}>
                <td>{record.employee_code}</td><td>{record.name}</td><td>{record.department}</td><td>{record.designation}</td><td>{record.email}</td><td>{record.phone || <span className="muted-cell">—</span>}</td>
                <td className="row-actions"><button className="action-button" onClick={() => setDialog({ mode: 'view', item: record })}>View</button>{canWrite && <><button className="action-button" onClick={() => { setNotice(''); setDialog({ mode: 'edit', item: record }); }}>Edit</button><button className="action-button danger-text" onClick={() => archiveRecord(record)}>Archive</button></>}</td>
              </tr>)}
            </tbody></table></div>}
      <div className="table-footer"><span>{busy ? 'Loading records…' : loadFailed ? 'Record count unavailable' : `Showing ${firstRecord}–${firstRecord + records.length - 1} of ${pagination.total}`}</span>
        <div className="pagination"><button disabled={page <= 1 || busy} onClick={() => setPage(current => current - 1)}>← Previous</button><span>Page {page}{pagination.pages ? ` of ${pagination.pages}` : ''}</span><button disabled={page >= pagination.pages || busy} onClick={() => setPage(current => current + 1)}>Next →</button></div>
      </div>
    </section>
    {dialog && <FacultyDialog item={dialog.item} mode={dialog.mode} onClose={() => setDialog(null)} onSave={saveRecord} saving={saving} />}
  </>;
}
