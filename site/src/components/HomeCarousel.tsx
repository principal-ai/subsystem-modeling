import '@xyflow/react/dist/style.css';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemCarousel } from './SubsystemCarousel';
import { showcaseCasesToCarouselItems } from '../showcase/carouselItems';

const items = showcaseCasesToCarouselItems();

/** Carousel of showcase subsystem models for the home page. */
export function HomeCarousel() {
  return (
    <ThemeProvider theme={defaultEditorTheme}>
      <SubsystemCarousel items={items} stageHeight="100%" />
    </ThemeProvider>
  );
}
