import { Request } from 'express';

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
  search: string;
}

export function extractPagination(req: Request): PaginationParams {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const search = ((req.query.search as string) || '').trim();
  return { page, limit, offset, search };
}

export function paginatedResponse(data: unknown[], total: number, page: number, limit: number) {
  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
