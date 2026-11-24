"use client";

import { useEffect, useState } from "react";

/**
 * Google refuses sign-in inside apps' built-in browsers ("disallowed_useragent"), and most
 * of our visitors arrive from Instagram. Without this, "Log in with Google" just fails there.
 */
const IN_APP_UA =
  /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|Barcelona|Threads|TikTok|musical_ly|Bytedance|Snapchat|LinkedInApp|Twitter|Line\/|; wv\)/i;

type InAppInfo = { app: string; android: boolean };

function detectInAppBrowser(ua: string): InAppInfo | null {
  if (!IN_APP_UA.test(ua)) return null;
  const app = /Instagram/i.test(ua)
    ? "Instagram"
    : /FBAN|FBAV|FB_IAB|FBIOS|Messenger/i.test(ua)
      ? "Facebook"
      : /Barcelona|Threads/i.test(ua)
        ? "Threads"
        : /TikTok|musical_ly|Bytedance/i.test(ua)
          ? "TikTok"
          : "this app";
  return { app, android: /Android/i.test(ua) };
}

export default function InAppBrowserNotice() {
  const [info, setInfo] = useState<InAppInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setInfo(detectInAppBrowser(navigator.userAgent || ""));
  }, []);

  if (!info) return null;

  const url = window.location.href;
  // Android: hand the page to Chrome directly. iOS has no reliable equivalent, so the
  // instructions cover it.
  const chromeIntent = `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* Clipboard blocked: the instructions still work. */
    }
  };

  const where = info.app === "this app" ? "inside apps" : `inside ${info.app}`;

  return (
    <div
      role="note"
      className="rounded-md border border-amber-300 bg-amber-50 p-3 text-left text-sm text-amber-950"
    >
      <p className="font-semibold">Google log-in doesn&apos;t work {where}.</p>
      <p className="mt-1">
        Tap the <span className="font-semibold">⋯</span> menu and choose{" "}
        <span className="font-semibold">Open in browser</span> (or{" "}
        <span className="font-semibold">Open in Safari / Chrome</span>), or use your email and
        password here.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {info.android ? (
          <a
            href={chromeIntent}
            className="rounded bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Open in Chrome
          </a>
        ) : null}
        <button
          type="button"
          onClick={copyLink}
          className="rounded border border-amber-900 px-3 py-1.5 text-xs font-semibold text-amber-950"
        >
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
