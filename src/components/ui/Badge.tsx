"use client";

import React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "brand" | "neutral" | "error" | "warning" | "success";
  icon?: React.ReactNode; // Accepts any valid React element or node
  children?: React.ReactNode;
  iconRight?: React.ReactNode;
  className?: string;
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(function Badge(
  {
    variant = "brand",
    icon,
    children,
    iconRight,
    className,
    ...otherProps
  }: BadgeProps,
  ref
) {
  const variantClasses = {
    brand: "bg-blue-100 text-blue-800 border-blue-100",
    success: "bg-green-100 text-green-800 border-green-100",
    warning: "bg-yellow-100 text-yellow-800 border-yellow-100",
    error: "bg-red-100 text-red-800 border-red-100",
    neutral: "bg-gray-100 text-gray-800 border-gray-100",
  };

  return (
    <div
      className={`flex items-center gap-1 rounded-md border px-2 ${variantClasses[variant]} ${className}`}
      ref={ref}
      {...otherProps}
    >
      {icon && (
        <span
          className={`text-xs ${variant === "success" ? "text-green-800" : ""} ${variant === "warning" ? "text-yellow-800" : ""} ${variant === "error" ? "text-red-700" : ""} ${variant === "neutral" ? "text-gray-700" : ""}`}
        >
          {icon}
        </span>
      )}
      {children && (
        <span
          className={`whitespace-nowrap text-xs ${variant === "success" ? "text-green-800" : ""} ${variant === "warning" ? "text-yellow-800" : ""} ${variant === "error" ? "text-red-800" : ""} ${variant === "neutral" ? "text-gray-700" : ""}`}
        >
          {children}
        </span>
      )}
      {iconRight && (
        <span
          className={`text-xs ${variant === "success" ? "text-green-800" : ""} ${variant === "warning" ? "text-yellow-800" : ""} ${variant === "error" ? "text-red-700" : ""} ${variant === "neutral" ? "text-gray-700" : ""}`}
        >
          {iconRight}
        </span>
      )}
    </div>
  );
});

export default Badge;
