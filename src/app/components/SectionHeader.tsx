import { ReactNode, ReactElement } from "react";

interface SectionHeaderProps {
  children: ReactNode;
}

export function SectionHeader({ children }: SectionHeaderProps): ReactElement {
  return (
    <h2 className="text-center text-3xl font-bold text-white">{children}</h2>
  );
}
