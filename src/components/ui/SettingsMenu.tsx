"use client";
/*
 * Documentation:
 * Settings Menu — https://app.subframe.com/bf019fa501b5/library?component=Settings+Menu_786775dd-5f70-4b46-85ee-a3c74e6a00d6
 */

import React from "react";
import * as SubframeCore from "@subframe/core";

interface ItemProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  icon?: SubframeCore.IconName;
  label?: React.ReactNode;
  className?: string;
}

const Item = React.forwardRef<HTMLElement, ItemProps>(function Item(
  {
    selected = false,
    icon = "FeatherUser",
    label,
    className,
    ...otherProps
  }: ItemProps,
  ref
) {
  return (
    <div
      className={SubframeCore.twClassNames(
        "group/cd4ad3a1 flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1 hover:bg-default-background active:bg-brand-50",
        { "bg-brand-100 hover:bg-brand-100 active:bg-brand-50": selected },
        className
      )}
      ref={ref as any}
      {...otherProps}
    >
      <SubframeCore.Icon
        className={SubframeCore.twClassNames(
          "text-body font-body text-default-font",
          { "text-brand-700": selected }
        )}
        name={icon}
      />
      {label ? (
        <span
          className={SubframeCore.twClassNames(
            "line-clamp-1 grow shrink-0 basis-0 text-body font-body text-default-font",
            {
              "text-body-bold font-body-bold text-brand-700 group-hover/cd4ad3a1:text-brand-700 group-active/cd4ad3a1:text-brand-700":
                selected,
            }
          )}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
});

interface SettingsMenuRootProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
}

const SettingsMenuRoot = React.forwardRef<HTMLElement, SettingsMenuRootProps>(
  function SettingsMenuRoot(
    { children, className, ...otherProps }: SettingsMenuRootProps,
    ref
  ) {
    return children ? (
      <div
        className={SubframeCore.twClassNames(
          "group/786775dd flex h-full w-60 flex-col items-start gap-8 border-r border-solid border-neutral-border bg-default-background px-6 py-6",
          className
        )}
        ref={ref as any}
        {...otherProps}
      >
        {children}
      </div>
    ) : null;
  }
);

export const SettingsMenu = Object.assign(SettingsMenuRoot, {
  Item,
});
