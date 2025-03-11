"use client";
/*
 * Documentation:
 * Sidebar Collapsible — https://app.subframe.com/bf019fa501b5/library?component=Sidebar+Collapsible_e732d4fd-dae8-4053-bb88-7c02acab53f9
 * Avatar — https://app.subframe.com/bf019fa501b5/library?component=Avatar_bec25ae6-5010-4485-b46b-cf79e3943ab2
 * Dropdown Menu — https://app.subframe.com/bf019fa501b5/library?component=Dropdown+Menu_99951515-459b-4286-919e-a89e7549b43b
 */

import React from "react";
import * as SubframeCore from "@subframe/core";
import { DropdownMenu } from "./DropdownMenu";

interface NavItemProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: SubframeCore.IconName;
  children?: React.ReactNode;
  selected?: boolean;
  rightSlot?: React.ReactNode;
  className?: string;
}

const NavItem = React.forwardRef<HTMLElement, NavItemProps>(function NavItem(
  {
    icon = "FeatherCircleDashed",
    children,
    selected = false,
    rightSlot,
    className,
    ...otherProps
  }: NavItemProps,
  ref
) {
  return (
    <div
      className={SubframeCore.twClassNames(
        "group/4b5b3cb8 flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 hover:bg-neutral-50 active:bg-neutral-100",
        { "bg-brand-50 hover:bg-brand-50 active:bg-brand-100": selected },
        className
      )}
      ref={ref as any}
      {...otherProps}
    >
      <SubframeCore.Icon
        className={SubframeCore.twClassNames(
          "text-heading-3 font-heading-3 text-neutral-600",
          { "text-brand-700": selected }
        )}
        name={icon}
      />
      {children ? (
        <span
          className={SubframeCore.twClassNames(
            "line-clamp-1 grow shrink-0 basis-0 text-body-bold font-body-bold text-neutral-600",
            { "text-brand-700": selected }
          )}
        >
          {children}
        </span>
      ) : null}
      {rightSlot ? <div className="flex items-center">{rightSlot}</div> : null}
    </div>
  );
});

interface SidebarCollapsibleRootProps
  extends React.HTMLAttributes<HTMLElement> {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  expanded?: boolean;
  className?: string;
}

const SidebarCollapsibleRoot = React.forwardRef<
  HTMLElement,
  SidebarCollapsibleRootProps
>(function SidebarCollapsibleRoot(
  {
    header,
    footer,
    children,
    expanded = false,
    className,
    ...otherProps
  }: SidebarCollapsibleRootProps,
  ref
) {
  return (
    <nav
      className={SubframeCore.twClassNames(
        "group/e732d4fd flex h-full w-16 flex-col items-start gap-2 cursor-default",
        className
      )}
      ref={ref as any}
      {...otherProps}
    >
      <div
        className={SubframeCore.twClassNames(
          "flex w-16 grow shrink-0 basis-0 flex-col items-start border-r border-solid border-neutral-border bg-default-background absolute top-0 bottom-0 transition-all group-hover/e732d4fd:w-60 group-hover/e732d4fd:grow group-hover/e732d4fd:shrink-0 group-hover/e732d4fd:basis-0",
          { "w-60 grow shrink-0 basis-0": expanded }
        )}
      >
        {header ? (
          <div className="flex w-full flex-col items-start gap-2 px-5 py-6">
            {header}
          </div>
        ) : null}
        {children ? (
          <div className="flex w-full grow shrink-0 basis-0 flex-col items-start gap-1 px-3 py-4 overflow-auto">
            {children}
          </div>
        ) : null}
        {footer ? (
          <div className="flex w-full items-center gap-4 overflow-hidden border-t border-solid border-neutral-border px-4 py-6">
            {footer}
          </div>
        ) : null}
      </div>
    </nav>
  );
});

export const SidebarCollapsible = Object.assign(SidebarCollapsibleRoot, {
  NavItem,
});
