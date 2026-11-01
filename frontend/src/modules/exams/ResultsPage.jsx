import React, { useCallback, useEffect, useState } from 'react';

const PAGE_SIZE = 20;

function isPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function ResultDialog({ dialog, request, token, onClose, onSaved }) {
  const record = dialog.item || {};
  const readOnly = dialog.mode === 'view';
  const [values, setValues] = useState({
    exam_id: record.exam_id ?? '',
    student_id: record.student_id ?? '',
    marks_obtained: record.marks_obtained ?? '',
    grade: record.grade ?? ''
  });
  const [exams, setExams] = useState([]);
  const [loadingExams, setLoadingExams] = useState(!readOnly);
  const [examError, setExamError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (readOnly) return undefined;
    let cancelled = false;

    async function loadExams() {
      try {
        const allExams = [];
        let page = 1;
        let pages = 1;
        do {
          const response = await request('/exams', { token, query: { page, limit: 100 } });
          allExams.push(...(response.exams || []));
          pages = response.pagination?.pages || page;
          page += 1;
        } while (page <= pages);

        if (!cancelled) setExams(allExams.filter(exam => exam.record_status === 'active'));
      } catch (error) {
        if (!cancelled) setExamError(error.message || 'Unable to load active exams.');
      } finally {
        if (!cancelled) setLoadingExams(false);
      }
    }

    loadExams();
    return () => { cancelled = true; };
  }, [readOnly, request, token]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const selectedExam = exams.find(exam => String(exam.id) === String(values.exam_id));

  function updateField(event) {
    setValues(current => ({ ...current, [event.target.name]: event.target.value }));
    setFormError('');
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');

    if (!isPositiveInteger(values.exam_id)) {
      setFormError('Choose an active exam.');
      return;
    }
    if (!isPositiveInteger(values.student_id)) {
      setFormError('Enter a valid positive student ID.');
      return;
    }
    if (!Number.isInteger(Number(values.marks_obtained)) || Number(values.marks_obtained) < 0) {
      setFormError('Marks obtained must be a non-negative whole number.');
      return;
    }
    if (!selectedExam) {
      setFormError('Choose an active exam to validate the maximum marks.');
      return;
    }
    if (Number(values.marks_obtained) > Number(selectedExam.max_marks)) {
      setFormError(`Marks cannot exceed ${selectedExam.max_marks} for this exam.`);
      return;
    }

    setSaving(true);
    const body = {
      exam_id: Number(values.exam_id),
      student_id: Number(values.student_id),
      marks_obtained: Number(values.marks_obtained),
      grade: values.grade.trim() || null
    };
    try {
      const editing = dialog.mode === 'edit';
      await request(`/exams/results${editing ? `/${record.id}` : ''}`, {
        token,
        method: editing ? 'PUT' : 'POST',
        body
      });
      onSaved(editing ? 'Result updated.' : 'Result created.');
    } catch (error) {
      const message = error.message || 'Unable to save this result.';
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal results-modal" role="dialog" aria-modal="true" aria-labelledby="result-dialog-title">
      <div className="modal-header">
        <div>
          <span className="eyebrow">{readOnly ? 'RECORD DETAILS' : dialog.mode === 'edit' ? 'UPDATE RECORD' : 'NEW RECORD'}</span>
          <h2 id="result-dialog-title">{readOnly ? `Result #${record.id}` : dialog.mode === 'edit' ? 'Edit result' : 'Add result'}</h2>
        </div>
        <button type="button" className="close-button" aria-label="Close dialog" onClick={onClose}>×</button>
      </div>

      {readOnly ? <div className="detail-grid">
        {[
          ['Result ID', record.id],
          ['Exam ID', record.exam_id],
          ['Student ID', record.student_id],
          ['Marks obtained', record.marks_obtained],
          ['Grade', record.grade || '—'],
          ['Record status', record.record_status || '—'],
          ['Created', record.created_at ? new Date(record.created_at).toLocaleString() : '—']
        ].map(([label, value]) => <div className="detail-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div> : <form onSubmit={submit}>
        {examError && <div className="alert error form-alert">{examError}<button type="button" onClick={() => setExamError('')}>Dismiss</button></div>}
        <div className="form-grid results-form-grid">
          <label>Exam
            <select name="exam_id" value={values.exam_id} onChange={updateField} required disabled={loadingExams || Boolean(examError)}>
              <option value="">{loadingExams ? 'Loading active exams…' : 'Select an active exam'}</option>
              {exams.map(exam => <option key={exam.id} value={exam.id}>{exam.exam_name} · {exam.course_code} (#{exam.id}, max {exam.max_marks})</option>)}
            </select>
            {selectedExam && <span className="field-hint">Maximum marks: {selectedExam.max_marks}</span>}
          </label>
          <label>Student ID
            <input name="student_id" type="number" min="1" step="1" value={values.student_id} onChange={updateField} required />
          </label>
          <label>Marks obtained
            <input name="marks_obtained" type="number" min="0" max={selectedExam?.max_marks} step="1" value={values.marks_obtained} onChange={updateField} required />
          </label>
          <label>Grade <span className="field-hint">Optional</span>
            <input name="grade" type="text" value={values.grade} onChange={updateField} placeholder="e.g. A" />
          </label>
        </div>
        {formError && <div className="alert error form-alert" role="alert">{formError}</div>}
        <div className="modal-footer results-modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={saving || loadingExams || Boolean(examError)}>
            {saving ? <><span className="spinner" /> Saving…</> : dialog.mode === 'edit' ? 'Save changes' : 'Create result'}
          </button>
        </div>
      </form>}

      {readOnly && <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Close</button></div>}
    </section>
  </div>;
}

export default function ResultsPage({ request, token, user }) {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [filtersInput, setFiltersInput] = useState({ exam_id: '', student_id: '' });
  const [query, setQuery] = useState({ q: '', exam_id: '', student_id: '' });
  const [busy, setBusy] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const canWrite = ['admin', 'faculty'].includes(user?.role);

  const load = useCallback(async () => {
    setBusy(true);
    setLoadFailed(false);
    setError('');
    try {
      const response = await request('/exams/results', {
        token,
        query: { page, limit: PAGE_SIZE, ...query }
      });
      const nextRows = response.results || [];
      const nextPagination = response.pagination || { page, limit: PAGE_SIZE, total: nextRows.length, pages: 1 };
      const lastPage = Math.max(1, Number(nextPagination.pages) || Math.ceil((nextPagination.total || 0) / PAGE_SIZE));
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setRows(nextRows);
      setPagination(nextPagination);
    } catch (loadError) {
      setRows([]);
      setLoadFailed(true);
      setError(loadError.message || 'Unable to load results.');
    } finally {
      setBusy(false);
    }
  }, [page, query, request, token]);

  useEffect(() => { load(); }, [load]);

  function applyFilters(event) {
    event.preventDefault();
    setPage(1);
    setQuery({
      q: searchInput.trim(),
      exam_id: filtersInput.exam_id,
      student_id: filtersInput.student_id
    });
  }

  function clearFilters() {
    setSearchInput('');
    setFiltersInput({ exam_id: '', student_id: '' });
    setPage(1);
    setQuery({ q: '', exam_id: '', student_id: '' });
  }

  async function archive(item) {
    const confirmed = window.confirm(`Archive result #${item.id} for student ${item.student_id}? It will be soft-deleted and no longer appear in the active results list.`);
    if (!confirmed) return;
    setError('');
    setNotice('');
    try {
      await request(`/exams/results/${item.id}`, { token, method: 'DELETE' });
      setNotice('Result archived. It has been soft-deleted and removed from the active list.');
      await load();
    } catch (archiveError) {
      setError(archiveError.message || 'Unable to archive this result.');
    }
  }

  function saved(message) {
    setDialog(null);
    setError('');
    setNotice(message);
    load();
  }

  const firstItem = rows.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastItem = Math.min((page - 1) * PAGE_SIZE + rows.length, pagination.total);
  const hasFilters = Boolean(query.q || query.exam_id || query.student_id);
  const pageCount = pagination.pages || (pagination.total ? Math.ceil(pagination.total / PAGE_SIZE) : 0);

  return <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">CAMPUS MANAGEMENT</span>
        <h1>Results</h1>
        <p>Record marks and review published results.</p>
      </div>
      {canWrite && <button className="button primary" onClick={() => { setError(''); setDialog({ mode: 'create' }); }}><span className="plus">＋</span> Add result</button>}
    </div>
    <p className="resource-context"><span aria-hidden="true">i</span>Narrow the list by exam or student ID, then compare marks and grade. Open View to inspect the full result record.</p>
    {notice && <div className="alert success" role="status">{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice('')}>×</button></div>}
    {!canWrite && <div className="role-note">You can view results. Creating, editing, or archiving requires an admin or faculty role.</div>}

    <section className="panel table-panel results-panel" aria-label="Results directory">
      <div className="table-toolbar results-toolbar">
        <div className="results-toolbar-heading"><span className="eyebrow">RECORDS</span><div className="results-title-line"><h2>Results directory</h2>{!busy && !loadFailed && <span className="results-count">{pagination.total} active</span>}</div></div>
        <form className="resource-filters results-filters" onSubmit={applyFilters}>
          <label className="search-form"><span aria-hidden="true">⌕</span><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search grade or student ID…" aria-label="Search grade or student ID" /></label>
          <label className="filter-field">Exam ID<input type="number" min="1" step="1" value={filtersInput.exam_id} onChange={event => setFiltersInput(current => ({ ...current, exam_id: event.target.value }))} /></label>
          <label className="filter-field">Student ID<input type="number" min="1" step="1" value={filtersInput.student_id} onChange={event => setFiltersInput(current => ({ ...current, student_id: event.target.value }))} /></label>
          <button className="button secondary filter-submit" type="submit">Apply</button>
          {hasFilters && <button className="link-button results-clear" type="button" onClick={clearFilters}>Clear</button>}
        </form>
      </div>

      {error && !loadFailed && <div className="alert error table-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')}>Dismiss</button></div>}
      {busy ? <div className="table-state-panel" role="status"><div className="empty-state"><strong><span className="spinner dark" /> Loading results…</strong><span>Fetching the latest active records.</span></div></div>
        : loadFailed ? <div className="table-state-panel" role="status"><div className="empty-state unavailable-state"><strong>Results unavailable</strong>{error && <span className="results-load-error" role="alert">{error}</span>}<button className="button secondary" type="button" onClick={load}>Retry</button></div></div>
          : rows.length === 0 ? <div className="table-state-panel" role="status"><div className="empty-state"><div className="empty-symbol">⌕</div><strong>{hasFilters ? 'No matching results' : 'No results yet'}</strong><span>{hasFilters ? 'Try adjusting your search or filters.' : 'Results from your exam service will appear here.'}</span>{hasFilters && <button className="link-button" type="button" onClick={clearFilters}>Clear filters</button>}</div></div>
            : <div className="table-scroll"><table><thead><tr><th>Result ID</th><th>Exam ID</th><th>Student ID</th><th>Marks</th><th>Grade</th><th>Status</th><th className="actions-head">Actions</th></tr></thead>
              <tbody>{rows.map(item => <tr key={item.id}>
                <td className="muted-cell">#{item.id}</td>
                <td>{item.exam_id}</td>
                <td>{item.student_id}</td>
                <td><span className="result-marks">{item.marks_obtained}</span></td>
                <td>{item.grade || <span className="muted-cell">—</span>}</td>
                <td><span className={`status-pill ${item.record_status || 'active'}`}>{item.record_status || 'active'}</span></td>
                <td className="row-actions"><button className="action-button" type="button" onClick={() => setDialog({ mode: 'view', item })}>View</button>
                  {canWrite && <><button className="action-button" type="button" onClick={() => { setError(''); setDialog({ mode: 'edit', item }); }}>Edit</button><button className="action-button danger-text" type="button" onClick={() => archive(item)}>Archive</button></>}
                </td>
              </tr>)}</tbody>
            </table></div>}

      <div className="table-footer">
        <span>{busy ? 'Loading records…' : loadFailed ? 'Results unavailable' : `Showing ${firstItem}–${lastItem} of ${pagination.total}`}</span>
        <div className="pagination">
          <button type="button" disabled={page <= 1 || busy} onClick={() => setPage(current => current - 1)}>← Previous</button>
          <span>Page {page}{pageCount ? ` of ${pageCount}` : ''}</span>
          <button type="button" disabled={!pageCount || page >= pageCount || busy} onClick={() => setPage(current => current + 1)}>Next →</button>
        </div>
      </div>
    </section>

    {dialog && <ResultDialog
      key={`${dialog.mode}-${dialog.item?.id ?? 'new'}`}
      dialog={dialog}
      request={request}
      token={token}
      onClose={() => setDialog(null)}
      onSaved={saved}
    />}
  </>;
}
