import './style.css';
import { NameEffect, FONT_OPTIONS } from './name-effect';
import { ImageReveal } from './image-reveal';

function createFontSwitcher(nameEffect: NameEffect, currentFont: string): void {
  const switcher = document.createElement('div');
  switcher.id = 'font-switcher';
  switcher.innerHTML = `
    <select id="font-select">
      ${Object.entries(FONT_OPTIONS).map(([key, name]) =>
        `<option value="${key}" ${key === currentFont ? 'selected' : ''}>${name}</option>`
      ).join('')}
    </select>
  `;
  document.body.appendChild(switcher);

  const select = document.getElementById('font-select') as HTMLSelectElement;
  select.addEventListener('change', (e) => {
    const fontKey = (e.target as HTMLSelectElement).value;
    nameEffect.setFont(fontKey);
  });
}

function getFontFromURL(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('font') || 'junction-stroked';
}

function init(): void {
  const nameCanvas = document.getElementById('name-canvas') as HTMLCanvasElement;
  const imageCanvas = document.getElementById('image-canvas') as HTMLCanvasElement;
  const imageContainer = document.getElementById('image-reveal') as HTMLElement;

  if (!nameCanvas || !imageCanvas || !imageContainer) {
    console.error('Required elements not found');
    return;
  }

  const fontKey = getFontFromURL();
  console.log('Using font:', fontKey);

  // Wait for fonts to load
  document.fonts.ready.then(() => {
    // Initialize name effect (WebGL ripple on S/Mateer)
    const nameEffect = new NameEffect(nameCanvas, fontKey);
    nameEffect.start();

    // Create font switcher for testing
    createFontSwitcher(nameEffect, fontKey);

    // Initialize image reveal effect
    const imageReveal = new ImageReveal(imageCanvas, imageContainer);

    // Set up hover triggers for bio keywords
    const triggers = document.querySelectorAll('.hover-trigger');

    triggers.forEach((trigger) => {
      const imageKey = (trigger as HTMLElement).dataset.image;

      if (imageKey) {
        trigger.addEventListener('mouseenter', () => {
          imageReveal.show(imageKey);
        });

        trigger.addEventListener('mouseleave', () => {
          imageReveal.hide();
        });
      }
    });

    // Expose for debugging
    (window as any).nameEffect = nameEffect;
    (window as any).imageReveal = imageReveal;
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
