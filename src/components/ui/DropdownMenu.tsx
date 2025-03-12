"use client";

import React from "react";

interface DropdownItemProps {
  children?: React.ReactNode;
  icon?: string;
  className?: string;
}

const DropdownItem = React.forwardRef<HTMLElement, DropdownItemProps>(
  function DropdownItem({ children, icon = "⭐", className, ...otherProps }: DropdownItemProps, ref) {
    return (
      <div
        className={`group flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-3 hover:bg-neutral-100 active:bg-neutral-50 ${className}`}
        ref={ref as any}
        {...otherProps}
      >
        <span className="text-body font-body text-default-font">{icon}</span>
        {children && (
          <span className="line-clamp-1 grow shrink-0 basis-0 text-body font-body text-default-font group-hover:text-default-font">
            {children}
          </span>
        )}
      </div>
    );
  }
);

interface DropdownDividerProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

const DropdownDivider = React.forwardRef<HTMLElement, DropdownDividerProps>(
  function DropdownDivider({ className, ...otherProps }: DropdownDividerProps, ref) {
    return (
      <div
        className={`flex w-full items-start gap-2 px-1 py-1 ${className}`}
        ref={ref as any}
        {...otherProps}
      >
        <div className="flex h-px grow shrink-0 basis-0 flex-col items-center gap-2 bg-neutral-200" />
      </div>
    );
  }
);

interface DropdownMenuRootProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
}

const DropdownMenuRoot = React.forwardRef<HTMLElement, DropdownMenuRootProps>(
  function DropdownMenuRoot({ children, className, ...otherProps }: DropdownMenuRootProps, ref) {
    return children ? (
      <div
        className={`flex min-w-[192px] flex-col items-start rounded-md border border-solid border-neutral-border bg-default-background px-1 py-1 shadow-lg ${className}`}
        ref={ref as any}
        {...otherProps}
      >
        {children}
      </div>
    ) : null;
  }
);

export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  DropdownItem,
  DropdownDivider,
});
