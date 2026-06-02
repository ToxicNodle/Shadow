import { useEffect } from 'react';

/**
 * Call once at the app level. Makes every .modal and .modal-box draggable
 * by their .modal-header or .modal-title — no per-modal changes needed.
 */
export function useGlobalDraggableModals() {
  useEffect(() => {
    let dragging = false;
    let target: HTMLElement | null = null;
    let startX = 0, startY = 0;
    let origLeft = 0, origTop = 0;

    function getModalContainer(el: Element): HTMLElement | null {
      return (el.closest('.modal') ?? el.closest('.modal-box')) as HTMLElement | null;
    }

    function isDragHandle(el: Element): boolean {
      return !!(
        el.closest('.modal-header') ||
        el.closest('.modal-title') ||
        el.closest('[data-drag-handle]')
      );
    }

    function onMouseDown(e: MouseEvent) {
      const el = e.target as Element;
      if (!isDragHandle(el)) return;
      // Let interactive elements inside the header pass through normally
      if (el.closest('button, input, select, textarea, a, [data-no-drag]')) return;

      const modal = getModalContainer(el);
      if (!modal) return;

      const rect = modal.getBoundingClientRect();

      // Convert from CSS-based centering (transform / flex / margin: auto) to
      // explicit viewport-relative coordinates so the element can be freely moved.
      modal.style.position = 'fixed';
      modal.style.left = `${rect.left}px`;
      modal.style.top = `${rect.top}px`;
      modal.style.transform = 'none';
      modal.style.margin = '0';
      modal.style.transition = 'none';

      dragging = true;
      target = modal;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = rect.left;
      origTop = rect.top;

      document.body.style.userSelect = 'none';
      e.preventDefault();
    }

    function onMouseMove(e: MouseEvent) {
      if (!dragging || !target) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // Keep at least 60px of the modal visible on all edges
      const maxLeft = window.innerWidth - Math.min(target.offsetWidth, window.innerWidth - 60);
      const maxTop = window.innerHeight - 60;
      const newLeft = Math.max(0, Math.min(maxLeft, origLeft + dx));
      const newTop = Math.max(0, Math.min(maxTop, origTop + dy));
      target.style.left = `${newLeft}px`;
      target.style.top = `${newTop}px`;
    }

    function onMouseUp() {
      dragging = false;
      target = null;
      document.body.style.userSelect = '';
    }

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);
}
