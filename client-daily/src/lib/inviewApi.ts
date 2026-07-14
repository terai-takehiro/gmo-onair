import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './api';
import type { InviewRegistration } from './types';

// 内覧会 来場予約 API の react-query フック集

export interface InviewInput {
  session_label?: string;
  session_date?: string | null;
  name?: string;
  furigana?: string | null;
  email?: string | null;
  company?: string | null;
  role?: string | null;
  postal_code?: string | null;
  address?: string | null;
  phone?: string | null;
  fax?: string | null;
  mobile?: string | null;
  mail_consent?: boolean | null;
  party_size?: number | null;
  companions?: string[] | null;
  visit_time?: string | null;
  interests?: string | null;
  notes?: string | null;
}

export function useInviewList(params: { upcoming?: boolean } = {}) {
  return useQuery({
    queryKey: ['inview', params.upcoming ? 'upcoming' : 'all'],
    queryFn: () =>
      api.get('/dailyops/inview', { params: params.upcoming ? { upcoming: 1 } : {} })
        .then((r) => r.data.data as InviewRegistration[]),
    refetchOnMount: 'always',
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['inview'] });
}

export function useCreateInview() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: InviewInput) => api.post('/dailyops/inview', input).then((r) => r.data.data as InviewRegistration),
    onSuccess: invalidate,
  });
}

export function useUpdateInview() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: InviewInput }) =>
      api.put(`/dailyops/inview/${id}`, fields).then((r) => r.data.data as InviewRegistration),
    onSuccess: invalidate,
  });
}

export function useCheckInInview() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, checkedIn }: { id: string; checkedIn: boolean }) =>
      api.post(`/dailyops/inview/${id}/check-in`, { checked_in: checkedIn }).then((r) => r.data.data as InviewRegistration),
    onSuccess: invalidate,
  });
}

export function useDeleteInview() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/dailyops/inview/${id}`),
    onSuccess: invalidate,
  });
}
