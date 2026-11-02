import { useTheme } from '@principal-ade/industry-theme';
import { IndustryMarkdownSlide } from 'themed-markdown';

export interface DescriptionPreviewProps {
  /** The full Markdown document. */
  content: string;
  /** Open the full description overlay. Omit to hide the toggle. */
  onOpen?: () => void;
  /** Close the full description overlay. */
  onClose?: () => void;
  /** Whether the overlay is currently open (for `aria-expanded` and the label). */
  open?: boolean;
  /**
   * Clamp the preview to `clampLines`. Pass `false` when the content is
   * already length-capped and should size the header by its own height.
   */
  clamp?: boolean;
  /** Visible lines before the clamp (only when `clamp` is true). */
  clampLines?: number;
  /** Prefix for the Markdown slide ids (keeps duplicate headings unique). */
  slideIdPrefix?: string;
  /** Link text while the overlay is closed. */
  moreLabel?: string;
  /** Link text while the overlay is open. */
  lessLabel?: string;
}

/**
 * The top-of-sidebar description shared by the subsystem and C4 views:
 * Markdown plus an optional `Show more` link that opens the full document in
 * a `DescriptionOverlay` (and turns into `Close` while it is open).
 */
export function DescriptionPreview({
  content,
  onOpen,
  onClose,
  open = false,
  clamp = true,
  clampLines = 6,
  slideIdPrefix = 'description-preview',
  moreLabel = 'Show more',
  lessLabel = 'Close',
}: DescriptionPreviewProps) {
  const { theme } = useTheme();
  return (
    <div style={{ fontSize: theme.fontSizes[0], lineHeight: 1.5 }}>
      <div
        style={
          clamp
            ? {
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: clampLines,
                maxHeight: `${clampLines * 1.5}em`,
                overflow: 'hidden',
              }
            : undefined
        }
      >
        <IndustryMarkdownSlide
          content={content}
          slideIdPrefix={slideIdPrefix}
          slideIndex={0}
          isVisible={true}
          theme={theme}
          disableScroll={true}
          disableBasePadding
          enableKeyboardScrolling={false}
          autoFocusOnVisible={false}
        />
      </div>
      {(onOpen || onClose) && (
        <button
          type="button"
          aria-label={open ? 'Close description preview' : 'Read full description'}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? onClose?.() : onOpen?.())}
          style={{
            marginTop: 6,
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[0],
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          {open ? lessLabel : moreLabel}
        </button>
      )}
    </div>
  );
}
