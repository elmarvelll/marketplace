// src/app/_components/SkillCard.tsx
//
// Skill listing card — same layout as ProductCard, "from ₦x" instead of a
// flat price since skills are quoted, not fixed-priced.

import Image from "next/image";
import type { MarketplaceSkill } from "@/services/marketplace/shared/types";

const nairaFormatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

export default function SkillCard({ skill }: { skill: MarketplaceSkill }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(16,24,40,0.06)] hover:shadow-[0_6px_16px_rgba(16,24,40,0.10)] transition overflow-hidden cursor-pointer">
      <div className="relative w-full aspect-square bg-gray-100">
        <Image src={skill.image} alt={skill.name} fill sizes="(min-width: 1024px) 240px, 45vw" className="object-cover" />
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 text-sm truncate">{skill.name}</h3>
        <p className="text-xs text-gray-500 mt-0.5">by {skill.providerName}</p>
        <p className="mt-2 font-bold text-blue-600">from ₦{nairaFormatter.format(skill.startingPrice)}</p>
      </div>
    </div>
  );
}
