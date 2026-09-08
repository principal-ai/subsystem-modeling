import { showcaseCases, type ShowcaseCase } from './cases';
import type { SubsystemCarouselItem } from '../components/SubsystemCarousel';

/** Map the shared showcase registry into carousel items. */
export function showcaseCasesToCarouselItems(
  cases: readonly ShowcaseCase[] = showcaseCases,
): SubsystemCarouselItem[] {
  return cases.map((c) => ({
    id: c.meta.id,
    title: c.model.title,
    stack: c.meta.stack,
    complexity: c.meta.complexity,
    components: c.model.components,
    edges: c.model.edges,
    throughlines: c.model.throughlines,
  }));
}
