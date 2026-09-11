'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ThinkingIndicator } from '@/components/ui/thinking-indicator';

export default function ThinkingBridge() {
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState(null);
  const [mountPoint, setMountPoint] = useState(null);
  const startRef = useRef(0);

  useEffect(() => {
    const findMount = () => {
      const el = document.getElementById('thinkingIndicatorRoot');
      if (el) {
        setMountPoint(el);
        return true;
      }
      return false;
    };

    if (!findMount()) {
      const interval = setInterval(() => {
        if (findMount()) clearInterval(interval);
      }, 100);
      const observer = new MutationObserver(() => findMount());
      observer.observe(document.body, { childList: true, subtree: true });
      return () => {
        clearInterval(interval);
        observer.disconnect();
      };
    }
  }, []);

  const show = useCallback((customLabel) => {
    startRef.current = Date.now();
    if (customLabel) setLabel(customLabel);
    setVisible(true);
  }, []);
  const hide = useCallback(() => {
    const elapsed = Date.now() - startRef.current;
    const remaining = 7000 - elapsed;
    const doHide = () => {
      setVisible(false);
      setLabel(null);
    };
    if (remaining <= 0) doHide();
    else setTimeout(doHide, remaining);
  }, []);

  useEffect(() => {
    window.__showThinking = show;
    window.__hideThinking = hide;
    window.__setThinkingLabel = (l) => setLabel(l);
    return () => {
      delete window.__showThinking;
      delete window.__hideThinking;
      delete window.__setThinkingLabel;
    };
  }, [show, hide]);

  if (!visible || !mountPoint) return null;

  return createPortal(<ThinkingIndicator label={label} />, mountPoint);
}
