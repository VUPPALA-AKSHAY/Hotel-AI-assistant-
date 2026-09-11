'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

const ThinkingBridge = dynamic(() => import('./thinking-bridge'), { ssr: false });

function loadScript(src) {
  return new Promise((resolve) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = false;
    el.onload = resolve;
    el.onerror = resolve;
    document.body.appendChild(el);
  });
}

export default function Home() {
  const rootRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let html = '';
      try {
        const res = await fetch('/app-ui.html');
        html = await res.text();
      } catch {
        return;
      }
      if (cancelled) return;

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const scripts = Array.from(doc.body.querySelectorAll('script'))
        .map((s) => s.src)
        .filter(Boolean);
      doc.body.querySelectorAll('script').forEach((s) => s.remove());

      if (document.readyState !== 'loading') {
        const origAddEventListener = document.addEventListener.bind(document);
        document.addEventListener = (type, cb, ...rest) => {
          if (type === 'DOMContentLoaded') {
            setTimeout(cb, 0);
            return;
          }
          return origAddEventListener(type, cb, ...rest);
        };
      }

      if (!rootRef.current) return;
      rootRef.current.innerHTML = doc.body.innerHTML;

      for (const src of scripts) {
        await loadScript(src);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div id="app-root" ref={rootRef} />
      <ThinkingBridge />
    </>
  );
}
