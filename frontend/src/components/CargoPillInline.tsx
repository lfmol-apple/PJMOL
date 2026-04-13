"use client";
import { useCargo } from "@/hooks/useCargo";

export default function CargoPillInline({ className = "" }: { className?: string }) {
  const cargo = useCargo();
  if (!cargo) return null;

  const cls =
    cargo === "Gerente"
      ? "bg-amber-100 text-amber-700 border border-amber-300"
      : cargo === "Advogado"
      ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
      : "bg-blue-100 text-blue-700 border border-blue-300";

  return (
    <span
      className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold inline-flex items-center ${cls} ${className}`}
      title={cargo}
    >
      {cargo}
    </span>
  );
}
