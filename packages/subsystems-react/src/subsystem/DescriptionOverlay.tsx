import { useEffect, useRef } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { X } from 'lucide-react';
import { IndustryMarkdownSlide } from 'themed-markdown';

export function DescriptionOverlay({ description, onClose }: {
  description: string;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-label="Subsystem description"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        background: theme.colors.background,
        color: theme.colors.text,
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
        padding: '12px 16px',
        borderBottom: `1px solid ${theme.colors.border}`,
      }}>
        <h3 style={{
          flex: 1,
          margin: 0,
          fontSize: theme.fontSizes[1],
          fontFamily: theme.fonts.monospace,
          textTransform: 'uppercase',
          color: theme.colors.textSecondary,
        }}>
          Overview
        </h3>
        <button
          ref={closeRef}
          type="button"
          aria-label="Close description"
          onClick={onClose}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            padding: 0,
            border: 'none',
            borderRadius: 4,
            background: 'transparent',
            color: theme.colors.textSecondary,
            cursor: 'pointer',
          }}
        >
          <X size={14} />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 0 32px' }}>
        <div style={{ lineHeight: 1.7 }}>
          <IndustryMarkdownSlide
            content={description}
            slideIdPrefix="subsystem-desc-overlay"
            slideIndex={0}
            isVisible
            theme={theme}
            disableScroll
            disableBasePadding
            transparentBackground
            additionalPadding={{ left: '24px', right: '24px' }}
            fontSizeScale={1.05}
            enableKeyboardScrolling={false}
            autoFocusOnVisible={false}
          />
        </div>
      </div>
    </div>
  );
}
