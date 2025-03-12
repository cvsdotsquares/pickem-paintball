"use client";

import React from "react";

interface IconButtonRootProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
  | "brand-primary"
  | "brand-secondary"
  | "brand-tertiary"
  | "neutral-primary"
  | "neutral-secondary"
  | "neutral-tertiary"
  | "destructive-primary"
  | "destructive-secondary"
  | "destructive-tertiary"
  | "inverse";
  size?: "large" | "medium" | "small";
  icon?: string; // Icon as a string (can be an icon name or SVG)
  loading?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

const IconButtonRoot = React.forwardRef<HTMLElement, IconButtonRootProps>(
  function IconButtonRoot(
    {
      variant = "neutral-tertiary",
      size = "medium",
      icon = "⭐", // Default icon
      loading = false,
      className,
      type = "button",
      ...otherProps
    }: IconButtonRootProps,
    ref
  ) {
    return (
      <button
        className={`group flex items-center justify-center gap-2 rounded-md border-none bg-transparent cursor-pointer disabled:cursor-default disabled:bg-neutral-100 hover:disabled:cursor-default hover:disabled:bg-neutral-100 active:disabled:cursor-default active:disabled:bg-neutral-100 ${className} ${size === "small" ? "h-6 w-6" : size === "large" ? "h-10 w-10" : "h-8 w-8"
          } 
        ${variant === "inverse"
            ? "hover:bg-[#ffffff29] active:bg-[#ffffff3d]"
            : variant === "destructive-tertiary"
              ? "hover:bg-error-50 active:bg-error-100"
              : variant === "destructive-secondary"
                ? "bg-error-50 hover:bg-error-100 active:bg-error-50"
                : variant === "destructive-primary"
                  ? "bg-error-600 hover:bg-error-500 active:bg-error-600"
                  : variant === "neutral-secondary"
                    ? "border border-solid border-neutral-border bg-black hover:bg-neutral-100 active:bg-black"
                    : variant === "neutral-primary"
                      ? "bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-100"
                      : variant === "brand-tertiary"
                        ? "hover:bg-brand-50 active:bg-brand-100"
                        : variant === "brand-secondary"
                          ? "bg-brand-50 hover:bg-brand-100 active:bg-brand-50"
                          : variant === "brand-primary"
                            ? "bg-brand-600 hover:bg-brand-500 active:bg-brand-600"
                            : ""
          }`}
        ref={ref as any}
        type={type}
        {...otherProps}
      >
        {!loading && icon && (
          <span className="text-heading-3 font-heading-3 text-neutral-700">{icon}</span>
        )}
        {loading && (
          <span className="inline-block text-caption font-caption text-neutral-700">
            Loading...
          </span>
        )}
      </button>
    );
  }
);

export const IconButton = IconButtonRoot;
