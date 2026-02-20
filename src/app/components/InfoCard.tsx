import { ReactNode, ReactElement } from "react";

interface InfoCardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function InfoCard({
  title,
  children,
  className = "",
}: InfoCardProps): ReactElement {
  return (
    <div
      className={`rounded-xl border border-slate-700 bg-slate-800 p-6 ${className}`}
    >
      <h3 className="mb-4 text-xl font-semibold text-white">{title}</h3>
      {children}
    </div>
  );
}
