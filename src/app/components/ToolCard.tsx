import { ReactElement, cloneElement, SVGProps } from "react";

interface ToolCardProps {
  icon: ReactElement<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  codeExample: string;
  iconColor: string;
  className?: string;
}

const colorMap = {
  green: { bg: "bg-green-900", text: "text-green-400" },
  blue: { bg: "bg-blue-900", text: "text-blue-400" },
  purple: { bg: "bg-purple-900", text: "text-purple-400" },
  orange: { bg: "bg-orange-900", text: "text-orange-400" },
  red: { bg: "bg-red-900", text: "text-red-400" },
  indigo: { bg: "bg-indigo-900", text: "text-indigo-400" },
  yellow: { bg: "bg-yellow-900", text: "text-yellow-400" },
  cyan: { bg: "bg-cyan-900", text: "text-cyan-400" },
  pink: { bg: "bg-pink-900", text: "text-pink-400" },
  teal: { bg: "bg-teal-900", text: "text-teal-400" },
  violet: { bg: "bg-violet-900", text: "text-violet-400" },
};

export function ToolCard({
  icon,
  title,
  description,
  codeExample,
  iconColor,
  className = "",
}: ToolCardProps): ReactElement {
  function isIconColor(v: unknown): v is keyof typeof colorMap {
    return typeof v === "string" && v in colorMap;
  }

  const colors = isIconColor(iconColor) ? colorMap[iconColor] : colorMap.blue;

  return (
    <div
      className={`rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-sm ${className}`}
    >
      <div className="mb-4 flex items-center">
        <div
          className={`mr-4 flex h-12 w-12 items-center justify-center rounded-lg ${colors.bg}`}
        >
          {cloneElement(icon, { className: `h-6 w-6 ${colors.text}` })}
        </div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </div>
      <p className="mb-4 text-sm text-slate-400">{description}</p>
      <code className="block rounded bg-slate-700 p-2 font-mono text-xs text-slate-200">
        {codeExample}
      </code>
    </div>
  );
}
