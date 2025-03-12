"use client";

import React from "react";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "brand" | "neutral" | "error" | "success" | "warning";
  size?: "x-large" | "large" | "medium" | "small" | "x-small";
  children?: React.ReactNode;
  image?: string;
  square?: boolean;
  className?: string;
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(function Avatar(
  {
    variant = "brand",
    size = "medium",
    children,
    image,
    square = false,
    className,
    ...otherProps
  }: AvatarProps,
  ref
) {
  const sizeClasses = {
    "x-small": "h-5 w-5 text-xs",
    small: "h-6 w-6 text-sm",
    medium: "h-8 w-8 text-md",
    large: "h-12 w-12 text-lg",
    "x-large": "h-16 w-16 text-xl",
  };

  const variantClasses = {
    brand: "bg-blue-100 text-blue-800",
    warning: "bg-yellow-100 text-yellow-800",
    success: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
    neutral: "bg-gray-100 text-gray-800",
  };

  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-full ${sizeClasses[size]} ${variantClasses[variant]} ${square ? "rounded-md" : ""} ${className}`}
      ref={ref}
      {...otherProps}
    >
      {image ? (
        <img
          src={image}
          alt="Avatar"
          className={`object-cover absolute ${sizeClasses[size]} rounded-full`}
        />
      ) : null}
      {children && (
        <span
          className={`absolute text-center font-medium ${sizeClasses[size]} leading-tight`}
        >
          {children}
        </span>
      )}
    </div>
  );
});

export default Avatar;
