import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Quiz, QuizWithChoices } from './types';

const KEY_LIST = (eventId: number) => ['quizzes', 'event', eventId] as const;
const KEY_DETAIL = (id: number) => ['quizzes', 'detail', id] as const;

export function useQuizzes(eventId: number | null) {
  return useQuery({
    queryKey: KEY_LIST(eventId ?? 0),
    queryFn: async () => {
      if (!eventId) return [] as Quiz[];
      const res = await api.get(`/quiz/events/${eventId}/quizzes`);
      return res.data.data as Quiz[];
    },
    enabled: !!eventId,
  });
}

export function useQuiz(id: number | null) {
  return useQuery({
    queryKey: KEY_DETAIL(id ?? 0),
    queryFn: async () => {
      if (!id) return null;
      const res = await api.get(`/quiz/quizzes/${id}`);
      return res.data.data as QuizWithChoices;
    },
    enabled: !!id,
  });
}

export function useCreateQuiz(eventId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<Quiz>) => {
      if (!eventId) throw new Error('eventId required');
      const res = await api.post(`/quiz/events/${eventId}/quizzes`, body);
      return res.data.data as Quiz;
    },
    onSuccess: () => {
      if (eventId) qc.invalidateQueries({ queryKey: KEY_LIST(eventId) });
    },
  });
}

export function useUpdateQuiz(id: number | null, eventId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<Quiz>) => {
      if (!id) throw new Error('id required');
      const res = await api.put(`/quiz/quizzes/${id}`, body);
      return res.data.data as Quiz;
    },
    onSuccess: () => {
      if (id) qc.invalidateQueries({ queryKey: KEY_DETAIL(id) });
      if (eventId) qc.invalidateQueries({ queryKey: KEY_LIST(eventId) });
    },
  });
}

export function useUpdateQuizChoice(quizId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ position, body }: { position: number; body: Record<string, unknown> }) => {
      if (!quizId) throw new Error('quizId required');
      const res = await api.put(`/quiz/quizzes/${quizId}/choices/${position}`, body);
      return res.data.data;
    },
    onSuccess: () => {
      if (quizId) qc.invalidateQueries({ queryKey: KEY_DETAIL(quizId) });
    },
  });
}

export function useSyncQuizFromCategory(quizId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!quizId) throw new Error('quizId required');
      const res = await api.post(`/quiz/quizzes/${quizId}/sync-from-category`);
      return res.data.data;
    },
    onSuccess: () => {
      if (quizId) qc.invalidateQueries({ queryKey: KEY_DETAIL(quizId) });
    },
  });
}

export function useDeleteQuiz(eventId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/quiz/quizzes/${id}`);
    },
    onSuccess: () => {
      if (eventId) qc.invalidateQueries({ queryKey: KEY_LIST(eventId) });
    },
  });
}
