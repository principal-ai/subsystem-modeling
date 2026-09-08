/**
 * Thin PostHog wrapper — runs in the browser on product moments.
 * Showcase fixture: no real PostHog project; the call site is what matters.
 */
type Props = Record<string, string | number | boolean | null | undefined>;

export function captureEvent(event: string, properties?: Props): void {
  // posthog.capture(event, properties) in a real app
  void event;
  void properties;
}
