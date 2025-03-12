"use client";

import React from "react";

// Item Component
interface ItemProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  icon?: React.ReactNode; // Accept React components (like SVG or custom icons) instead of just strings
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string; // Added for accessibility
}

const Item = React.forwardRef<HTMLElement, ItemProps>(function Item(
  {
    selected = false,
    icon = "FeatherUser", // Default to FeatherUser, but can accept any React node
    label,
    className,
    "aria-label": ariaLabel = label ? String(label) : "Item", // Default label if none is provided
    ...otherProps
  }: ItemProps,
  ref
) {
  return (
    <div
      className={`group flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1 hover:bg-gray-100 active:bg-blue-50 ${selected ? "bg-blue-100 hover:bg-blue-100 active:bg-blue-50" : ""
        } ${className}`}
      ref={ref as any}
      aria-label={ariaLabel} // Accessibility improvement
      {...otherProps}
    >
      {/* Icon */}
      {React.isValidElement(icon) ? (
        <span className="text-body text-gray-700">{icon}</span>
      ) : (
        <span className={`text-gray-700 ${selected ? "text-blue-700" : ""}`}>{icon}</span>
      )}
      {/* Label */}
      {label && (
        <span
          className={`line-clamp-1 grow shrink-0 basis-0 text-body text-gray-700 ${selected
              ? "font-bold text-blue-700 group-hover:text-blue-700 group-active:text-blue-700"
              : ""
            }`}
        >
          {label}
        </span>
      )}
    </div>
  );
});

// Settings Menu Container
interface SettingsMenuRootProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  "aria-label"?: string; // Added for accessibility
}

const SettingsMenuRoot = React.forwardRef<HTMLElement, SettingsMenuRootProps>(function SettingsMenuRoot(
  { children, className, "aria-label": ariaLabel = "Settings Menu", ...otherProps }: SettingsMenuRootProps,
  ref
) {
  return children ? (
    <div
      className={`flex h-full w-60 flex-col items-start gap-8 border-r border-solid border-gray-200 bg-white px-6 py-6 ${className ? className : ""
        }`}
      ref={ref as any}
      aria-label={ariaLabel} // Accessibility improvement
      {...otherProps}
    >
      {children}
    </div>
  ) : null;
});

export const SettingsMenu = Object.assign(SettingsMenuRoot, {
  Item,
});
