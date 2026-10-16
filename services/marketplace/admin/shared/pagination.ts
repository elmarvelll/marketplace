// services/marketplace/admin/shared/pagination.ts
//
// Offset-based pagination — a new pattern for this codebase (every
// existing list route today is naturally bounded: one business's own
// products/orders, one deliverer's own deliveries). The admin dashboard is
// the first place that lists platform-wide data (all users, all
// businesses, all events) that can genuinely grow large, so this is
// introduced here rather than reusing something that doesn't exist yet.

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PageParams {
  page: number;
  pageSize: number;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function parsePageParams(searchParams: URLSearchParams): PageParams {
  const page = Math.max(1, Math.trunc(Number(searchParams.get("page")) || 1));
  const pageSizeRaw = Math.trunc(Number(searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSizeRaw));
  return { page, pageSize };
}

export function toPageResult<T>(items: T[], total: number, { page, pageSize }: PageParams): PageResult<T> {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
