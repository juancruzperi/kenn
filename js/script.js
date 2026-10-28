(() => {
  'use strict';

  const instances = new WeakMap();

  function initHeader(header) {
    if (!header) return () => {};
    if (instances.has(header)) return instances.get(header);

    const button = header.querySelector('.menu-toggle');
    const menu = document.getElementById(button.getAttribute('aria-controls'));
    const links = [...menu.querySelectorAll('a[href^="#"]')];
    const events = new AbortController();
    const options = { signal: events.signal };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const directionThreshold = 10;
    const topThreshold = 8;
    let open = false;
    let frame = 0;
    let previousY = window.scrollY;
    let distance = 0;
    let savedScroll = 0;
    let bodyStyles = [];
    let backgroundStates = [];

    function updateScroll() {
      frame = 0;
      if (open) return;
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.max(0, Math.min(window.scrollY, maxY));
      const delta = y - previousY;
      previousY = y;
      header.classList.toggle('is-solid', y > topThreshold);

      if (y <= topThreshold) {
        header.classList.remove('is-hidden');
        distance = 0;
        return;
      }
      if (delta === 0) return;
      distance = Math.sign(delta) === Math.sign(distance) ? distance + delta : delta;
      if (Math.abs(distance) >= directionThreshold) {
        header.classList.toggle('is-hidden', distance > 0);
        distance = 0;
      }
    }

    function scheduleScroll() {
      if (!frame && !open) frame = requestAnimationFrame(updateScroll);
    }

    function lockPage() {
      savedScroll = window.scrollY;
      const properties = ['position', 'top', 'left', 'right', 'overflow', 'padding-right'];
      bodyStyles = properties.map(name => [name, document.body.style.getPropertyValue(name),
        document.body.style.getPropertyPriority(name)]);
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      const padding = parseFloat(getComputedStyle(document.body).paddingRight) || 0;
      Object.assign(document.body.style, {
        position: 'fixed', top: `${-savedScroll}px`, left: '0', right: '0', overflow: 'hidden',
        paddingRight: `${padding + scrollbar}px`,
      });
      // Aislar también las futuras secciones sin cambiar su estado inert original.
      backgroundStates = [...document.body.children]
        .filter(element => element !== header && element !== menu && element.tagName !== 'SCRIPT')
        .map(element => [element, element.inert]);
      backgroundStates.forEach(([element]) => { element.inert = true; });
    }

    function unlockPage() {
      bodyStyles.forEach(([name, value, priority]) => {
        if (value) document.body.style.setProperty(name, value, priority);
        else document.body.style.removeProperty(name);
      });
      backgroundStates.forEach(([element, inert]) => { element.inert = inert; });
      window.scrollTo({ top: savedScroll, behavior: 'instant' });
      previousY = savedScroll;
      distance = 0;
    }

    function setMenu(nextOpen) {
      if (open === nextOpen) return;
      open = nextOpen;
      if (open) {
        lockPage();
        menu.inert = false;
        menu.removeAttribute('aria-hidden');
      } else {
        // Mover el foco antes de ocultar el árbol accesible del menú.
        button.focus({ preventScroll: true });
        menu.inert = true;
        menu.setAttribute('aria-hidden', 'true');
        unlockPage();
      }
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      menu.classList.toggle('is-open', open);
      header.classList.toggle('is-menu-open', open);
      if (!open) updateScroll();
      // El foco permanece en el botón convertido en X; Tab entra a los enlaces.
    }

    function handleKeyboard(event) {
      if (!open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenu(false);
      }
      if (event.key !== 'Tab') return;
      const focusable = [button, ...links];
      const index = focusable.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        focusable.at(-1).focus();
      } else if (!event.shiftKey && (index === focusable.length - 1 || index === -1)) {
        event.preventDefault();
        button.focus();
      }
    }

    function navigate(event) {
      event.preventDefault();
      const target = document.getElementById(event.currentTarget.hash.slice(1));
      setMenu(false);
      // Los destinos se incorporarán después. Nunca revelar contenido oculto.
      if (!target || target.closest('[hidden], [inert]') || !target.getClientRects().length) return;
      target.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
      const originalTabindex = target.getAttribute('tabindex');
      if (originalTabindex === null) {
        target.setAttribute('tabindex', '-1');
        target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      }
      target.focus({ preventScroll: true });
    }

    button.addEventListener('click', () => setMenu(!open), options);
    links.forEach(link => link.addEventListener('click', navigate, options));
    document.addEventListener('keydown', handleKeyboard, options);
    // Evitar que el foco salga del menú incluso por foco programático externo.
    document.addEventListener('focusin', event => {
      if (open && !header.contains(event.target) && !menu.contains(event.target)) {
        button.focus({ preventScroll: true });
      }
    }, options);
    window.addEventListener('scroll', scheduleScroll, { ...options, passive: true });
    window.addEventListener('resize', () => {
      if (open) return;
      previousY = window.scrollY;
      distance = 0;
      scheduleScroll();
    }, options);

    function destroy() {
      if (open) setMenu(false);
      events.abort();
      cancelAnimationFrame(frame);
      header.classList.remove('is-hidden', 'is-solid', 'is-menu-open');
      instances.delete(header);
    }

    window.addEventListener('pagehide', event => {
      if (!event.persisted) destroy();
    }, options);
    instances.set(header, destroy);
    updateScroll();
    return destroy;
  }

  initHeader(document.querySelector('[data-header]'));
})();
