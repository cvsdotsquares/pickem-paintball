"use client";

import React from "react";

interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: "brand" | "neutral" | "error" | "success" | "warning";
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  function Alert(
    {
      variant = "neutral",
      icon,
      title,
      description,
      actions,
      className,
      ...otherProps
    }: AlertProps,
    ref
  ) {
    const variantClasses = {
      neutral: "border-gray-300 bg-gray-50 text-gray-800",
      warning: "border-yellow-300 bg-yellow-50 text-yellow-800",
      success: "border-green-300 bg-green-50 text-green-800",
      error: "border-red-300 bg-red-50 text-red-800",
      brand: "border-blue-300 bg-blue-50 text-blue-800",
    };

    return (
      <div
        className={`flex flex-col w-full items-start gap-2 rounded-md border px-4 py-3 ${variantClasses[variant]
          } ${className}`}
        ref={ref}
        {...otherProps}
      >
        <div className="flex w-full items-center gap-4">
          {icon && <span className="text-lg">{icon}</span>}
          <div className="flex flex-grow flex-col items-start">
            {title && (
              <span className="w-full text-base font-semibold">{title}</span>
            )}
            {description && (
              <span className="w-full text-sm text-gray-600">
                {description}
              </span>
            )}
          </div>
          {actions && (
            <div className="flex items-center justify-end gap-2">{actions}</div>
          )}
        </div>
      </div>
    );
  }
);

export default Alert;
