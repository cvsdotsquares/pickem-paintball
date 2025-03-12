"use client";

import React from "react";

// Item Component
interface ItemProps extends React.HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode; // Accepts React nodes (e.g., SVG or custom icons)
  children?: React.ReactNode;
  className?: string;
  "aria-label"?: string; // Added for accessibility
}

const Item = React.forwardRef<HTMLElement, ItemProps>(function Item(
  {
    active = false,
    disabled = false,
    icon = null,
    children,
    className,
    "aria-label": ariaLabel = children ? String(children) : "Tab Item", // Default aria-label
    ...otherProps
  }: ItemProps,
  ref
) {
  return (
    <div
      className={`group flex h-10 cursor-pointer items-center justify-center gap-2 border-b border-solid border-gray-200 px-2.5 py-0.5 ${active ? "border-b-2 border-solid border-blue-600 px-2.5 pt-0.5 pb-px hover:border-blue-600" : ""
        } ${className}`}
      ref={ref as any}
      aria-label={ariaLabel} // Accessibility improvement
      {...otherProps}
    >
      {/* Icon */}
      {React.isValidElement(icon) ? (
        <span className="text-body text-gray-700">{icon}</span>
      ) : (
        <span
          className={`text-gray-400 group-hover:text-gray-800 ${active ? "text-blue-700 group-hover:text-blue-700" : ""
            } ${disabled ? "text-gray-300 group-hover:text-gray-300" : ""}`}
        >
          {icon}
        </span>
      )}
      {/* Label */}
      {children && (
        <span
          className={`font-semibold text-gray-700 group-hover:text-gray-800 ${active ? "text-blue-700 group-hover:text-blue-700" : ""
            } ${disabled ? "text-gray-300 group-hover:text-gray-300" : ""}`}
        >
          {children}
        </span>
      )}
    </div>
  );
});

// Tabs Container
interface TabsRootProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  "aria-label"?: string; // Added for accessibility
}

const TabsRoot = React.forwardRef<HTMLElement, TabsRootProps>(function TabsRoot(
  { children, className, "aria-label": ariaLabel = "Tabs", ...otherProps }: TabsRootProps,
  ref
) {
  return (
    <div
      className={`flex w-full items-end ${className}`}
      ref={ref as any}
      aria-label={ariaLabel} // Accessibility improvement
      {...otherProps}
    >
      {children && (
        <div className="flex items-start self-stretch">{children}</div>
      )}
      <div className="flex grow shrink-0 basis-0 flex-col items-start gap-2 self-stretch border-b border-solid border-gray-200" />
    </div>
  );
});

export const Tabs = Object.assign(TabsRoot, {
  Item,
});
