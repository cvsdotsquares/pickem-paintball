"use client";

import { cn } from "@/src/lib/utils";
import React from "react";

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
  | "primary"
  | "secondary"
  | "tertiary"
  | "neutral"
  | "destructive"
  | "inverse";
  size?: "large" | "medium" | "small";
  children?: React.ReactNode;
  loading?: boolean;
  className?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "medium",
      children,
      loading = false,
      className,
      type = "button",
      ...otherProps
    },
    ref
  ) => {
    const baseStyles =
      "flex items-center justify-center uppercase font-azonix hover:bg-white bg-gray-50 backdrop-blur-md lg:font-semibold isolation-auto before:absolute before:w-full before:transition-all before:duration-700 before:hover:w-full before:-left-full before:hover:left-0 before:rounded-full before:bg-black hover:text-white before:-z-10 before:aspect-square before:hover:scale-150 before:hover:duration-700 relative z-10 px-4 py-2 overflow-hidden border-2 rounded-full group rounded-md px-3 py-1 focus:outline-none transition-all";

    const sizeStyles = {
      small: "h-6 px-2 text-sm",
      medium: "h-8 px-3 text-base",
      large: "h-10 px-4 text-lg",
    };

    const variantStyles = {
      primary: "bg-white text-black  ",
      secondary: "bg-neutral-100 text-blue-950 ",
      tertiary: "bg-transparent text-blue-600 ",
      neutral: "bg-gray-100 text-gray-800 ",
      "neutral-secondary":
        "border border-gray-400 bg-white text-gray-800 ",
      "neutral-tertiary": "bg-transparent text-gray-600 ",
      destructive: "bg-red-600 text-white hover:bg-red-500",
      "destructive-secondary": "bg-red-50 text-red-600 ",
      "destructive-tertiary": "bg-transparent text-red-600 ",
      inverse: "bg-transparent text-white ",
    };

    const disabledStyles = "opacity-50 cursor-not-allowed";

    return (
      <button
        ref={ref}
        type={type}
        className={cn(`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${loading ? disabledStyles : ""} ${className}`)}
        disabled={loading}
        {...otherProps}
      >
        {loading ? <span className="loader h-4 w-4 border-2 border-t-white" /> : children}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
