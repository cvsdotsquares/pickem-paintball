"use client";

import React from "react";

// Input Component
interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "placeholder"> {
  placeholder?: React.ReactNode;
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { placeholder, className, ...otherProps }: InputProps,
  ref
) {
  return (
    <input
      className={`h-full w-full border-none bg-transparent text-body font-body text-gray-900 dark:text-gray-200 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500 ${className}`}
      placeholder={placeholder as string}
      ref={ref}
      {...otherProps}
    />
  );
});

// TextField Component
interface TextFieldRootProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {
  disabled?: boolean;
  error?: boolean;
  variant?: "outline" | "filled";
  label?: React.ReactNode;
  helpText?: React.ReactNode;
  icon?: React.ReactNode; // Updated to accept any React node for icon
  iconRight?: React.ReactNode; // Updated to accept any React node for icon
  children?: React.ReactNode;
  className?: string;
}

const TextFieldRoot = React.forwardRef<HTMLLabelElement, TextFieldRootProps>(
  function TextFieldRoot(
    {
      disabled = false,
      error = false,
      variant = "outline",
      label,
      helpText,
      icon = null,
      iconRight = null,
      children,
      className,
      ...otherProps
    }: TextFieldRootProps,
    ref
  ) {
    return (
      <label
        className={`flex flex-col items-start gap-1 ${className}`}
        ref={ref}
        {...otherProps}
      >
        {label && (
          <span className="text-caption-bold font-caption-bold text-gray-900 dark:text-white">
            {label}
          </span>
        )}
        <div
          className={`flex h-8 w-full items-center gap-1 rounded-md border px-2 bg-white dark:bg-gray-800 ${variant === "filled"
            ? "bg-gray-100 dark:bg-gray-700 border-gray-800 dark:border-gray-600 group-hover:border-gray-400"
            : "border-gray-300 dark:border-gray-600"
            } ${disabled ? "border-gray-200 bg-gray-200 dark:border-gray-700 dark:bg-gray-800" : ""} ${error ? "border-red-600" : "group-focus-within:border-blue-500"
            }`}
        >
          {/* Left Icon */}
          {icon && <span className="text-gray-900 dark:text-white">{icon}</span>}
          {children && <div className="flex-grow px-1">{children}</div>}
          {/* Right Icon */}
          {iconRight && (
            <span
              className={`text-gray-900 dark:text-white ${error ? "text-red-600" : ""}`}
            >
              {iconRight}
            </span>
          )}
        </div>
        {helpText && (
          <span className={`text-caption text-gray-700 dark:text-gray-300 ${error ? "text-red-700 dark:text-red-400" : ""}`}>
            {helpText}
          </span>
        )}
      </label>
    );
  }
);

export const TextField = Object.assign(TextFieldRoot, {
  Input,
});
