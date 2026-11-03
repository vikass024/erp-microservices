import { useEffect, useState } from 'react';

export const STUDENT_PROFILE_MESSAGE = 'Your student profile isn’t linked yet. Contact the administrator.';

export function useStudentProfile(request, token, user) {
  const [state, setState] = useState({ loading: user?.role === 'student', student: null, error: '' });

  useEffect(() => {
    if (user?.role !== 'student') {
      setState({ loading: false, student: null, error: '' });
      return undefined;
    }
    let cancelled = false;
    setState({ loading: true, student: null, error: '' });
    (async () => {
      try {
        const students = [];
        let page = 1;
        let pages = 1;
        do {
          const response = await request('/students', { token, query: { page, limit: 100 } });
          students.push(...(response.students || []));
          pages = response.pagination?.pages || page;
          page += 1;
        } while (page <= pages);
        const student = students.find(item => item.email?.toLowerCase() === user?.email?.toLowerCase()) || null;
        if (!cancelled) setState({ loading: false, student, error: '' });
      } catch (error) {
        if (!cancelled) setState({ loading: false, student: null, error: error.message || 'Unable to load your student profile.' });
      }
    })();
    return () => { cancelled = true; };
  }, [request, token, user?.email, user?.role]);

  return state;
}

export function StudentProfileNotice({ loading, student, error }) {
  if (loading) return <div className="profile-state" role="status">Loading your student profile…</div>;
  if (error) return <div className="alert error" role="alert">{error}</div>;
  if (!student) return <div className="profile-state profile-unlinked" role="status">{STUDENT_PROFILE_MESSAGE}</div>;
  return null;
}
