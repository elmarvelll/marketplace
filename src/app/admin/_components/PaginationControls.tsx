// src/app/admin/_components/PaginationControls.tsx
//
// Shared prev/next pager for every admin list (users, businesses,
// disputes, events, fines, reports) — offset-based pagination is new to
// this codebase (see services/marketplace/admin/shared/pagination.ts), so
// this is the one UI piece for it rather than six copies.

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function PaginationControls({ page, totalPages, total, onPageChange }: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
      <span>
        Page {page} of {totalPages} · {total} total
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-semibold disabled:opacity-40 hover:bg-gray-50 transition"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-semibold disabled:opacity-40 hover:bg-gray-50 transition"
        >
          Next
        </button>
      </div>
    </div>
  );
}
