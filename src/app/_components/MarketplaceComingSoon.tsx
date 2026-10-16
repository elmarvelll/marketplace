// src/app/_components/MarketplaceComingSoon.tsx
//
// Section-scoped "not built yet" placeholder for marketplace sections
// backed by no real data source — currently Skills/Services (the Skill/
// SkillOffer models exist in prisma/schema.prisma, but there's no API
// route, service, or listing-creation flow for them anywhere in the app).
// Same visual convention as
// src/app/admin/_components/DomainComingSoon.tsx (icon in a
// rounded box + heading + description), but with buyer-facing copy — that
// component's text ("{label} admin", "nothing to administer") is written
// for an admin audience and doesn't fit here, so this is a small sibling
// rather than a direct reuse.

import type { LucideIcon } from "lucide-react";

export default function MarketplaceComingSoon({ label, icon: Icon }: { label: string; icon: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 bg-white rounded-2xl border border-gray-100">
      <div className="w-14 h-14 bg-gray-50 rounded-xl flex items-center justify-center mb-4">
        <Icon size={26} className="text-gray-400" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1.5">{label} — Coming Soon</h3>
      <p className="text-sm text-gray-500 max-w-sm">We&apos;re still building this out. Check back soon.</p>
    </div>
  );
}
