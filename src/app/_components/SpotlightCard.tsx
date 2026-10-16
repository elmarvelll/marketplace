// src/app/_components/SpotlightCard.tsx
//
// Shared card for the "Top Businesses" and "Best Services" sections —
// simpler than ProductCard/SkillCard since there's no price, just a name,
// a subtitle (industry / skill), and an orders/product count. `image` is
// nullable since real businesses (Top Businesses is real data now — see
// ../page.tsx) may not have uploaded a profile photo.

import Image from "next/image";

interface SpotlightCardProps {
  image: string | null;
  name: string;
  subtitle: string;
  ordersFulfilled: number;
  // Defaults to "orders" (the original Top Businesses/Best Services
  // meaning) — School Vendors passes "items" since itemCount isn't an
  // order count. See src/app/page.tsx.
  countLabel?: string;
}

export default function SpotlightCard({ image, name, subtitle, ordersFulfilled, countLabel = "orders" }: SpotlightCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_8px_rgba(16,24,40,0.06)] hover:shadow-[0_6px_16px_rgba(16,24,40,0.10)] transition cursor-pointer">
      <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
        {image ? (
          <Image src={image} alt={name} fill sizes="56px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px]">No image</div>
        )}
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold text-gray-900 text-sm truncate">{name}</h3>
        <p className="text-xs text-gray-500 truncate">{subtitle}</p>
        <p className="text-xs text-blue-600 font-medium mt-0.5">{ordersFulfilled} {countLabel}</p>
      </div>
    </div>
  );
}
