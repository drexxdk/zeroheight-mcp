"use client";

import { Menu } from "@base-ui/react/menu";

const { Root, Trigger, Portal, Positioner, Popup, Item } = Menu;

interface NavigationMenuProps {
  activeSection: string;
  navigationOptions: { value: string; label: string }[];
  onSectionChange: (value: string) => void;
  onScrollToSection: (value: string) => void;
}

export default function NavigationMenu({
  activeSection,
  navigationOptions,
  onSectionChange,
  onScrollToSection,
}: NavigationMenuProps) {
  return (
    <Root highlightItemOnHover={false} loopFocus={false}>
      <Trigger className="flex w-full items-center justify-between rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-cyan-400 hover:bg-slate-900 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900">
        {navigationOptions.find((option) => option.value === activeSection)
          ?.label || "Navigate..."}
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </Trigger>
      <Portal>
        <Positioner className={"z-50"}>
          <Popup className="mt-2 w-48 rounded-lg border border-slate-600 bg-slate-800 p-1 shadow-lg">
            {navigationOptions.map((option) => (
              <Item
                key={option.value}
                autoFocus={option.value === activeSection}
                className={`cursor-pointer rounded px-3 py-2 text-sm transition-colors hover:bg-slate-700 hover:text-white ${
                  activeSection === option.value
                    ? "bg-cyan-400 text-slate-800"
                    : "text-slate-300"
                }`}
                onClick={() => {
                  onSectionChange(option.value);
                  onScrollToSection(option.value);
                }}
              >
                {option.label}
              </Item>
            ))}
          </Popup>
        </Positioner>
      </Portal>
    </Root>
  );
}
