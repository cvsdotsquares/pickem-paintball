"use client";

import React from "react";

// Item Component
interface ItemProps extends React.HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}

const Item = React.forwardRef<HTMLElement, ItemProps>(function Item(
  {
    active = false,
    disabled = false,
    icon = null,
    children,
    className,
    "aria-label": ariaLabel = children ? String(children) : "Tab Item",
    ...otherProps
  }: ItemProps,
  ref
) {
  return (
    <div
      className={`group relative flex h-12 items-center justify-center gap-2 px-4 py-2 cursor-pointer 
        ${disabled ? "cursor-not-allowed text-gray-400" : "text-gray-600 hover:text-blue-700"} 
        ${active ? "text-black border-b-2 border-black" : "border-b border-transparent"} 
        ${className}`}
      ref={ref as any}
      aria-label={ariaLabel}
      {...otherProps}
    >
      {icon && (
        <span
          className={`text-lg ${active ? "text-black" : "text-gray-400 group-hover:text-blue-700"}
            ${disabled ? "text-gray-300 group-hover:text-gray-300" : ""}`}
        >
          {icon}
        </span>
      )}
      {children && (
        <span
          className={`text-sm font-medium ${disabled ? "text-gray-300" : ""}
            ${active ? "text-blue-900" : "group-hover:text-blue-900"}`}
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
  "aria-label"?: string;
}

const TabsRoot = React.forwardRef<HTMLElement, TabsRootProps>(function TabsRoot(
  { children, className, "aria-label": ariaLabel = "Tabs", ...otherProps }: TabsRootProps,
  ref
) {
  return (
    <div
      className={`flex w-full items-center border-b border-gray-300 ${className}`}
      ref={ref as any}
      aria-label={ariaLabel}
      {...otherProps}
    >
      {children}
    </div>
  );
});

export const Tabs = Object.assign(TabsRoot, {
  Item,
});
