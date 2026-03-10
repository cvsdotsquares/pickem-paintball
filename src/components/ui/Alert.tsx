"use client";

import { motion } from "framer-motion";
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
      neutral: "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200",
      warning: "border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200",
      success: "border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200",
      error: "border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200",
      brand: "border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200",
    };

    return (
      <motion.div
      layout
      initial={{ y: -15, scale: 0.95 }}
      animate={{ y: 0, scale: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
        className={`flex flex-col w-full items-start gap-2 rounded-md border px-4 py-3 ${variantClasses[variant]
          } ${className}`}
        
      >
        <div className="flex w-full items-center gap-4" ref={ref}
        {...otherProps}>
          {icon && <span className="text-lg">{icon}</span>}
          <div className="flex flex-grow flex-col items-start">
            {title && (
              <span className="w-full text-base font-semibold">{title}</span>
            )}
            {description && (
              <span className="w-full text-sm text-gray-600 dark:text-gray-400">
                {description}
              </span>
            )}
          </div>
          {actions && (
            <div className="flex items-center justify-end gap-2">{actions}</div>
          )}
        </div>
      </motion.div>
    );
  }
);

export default Alert;
