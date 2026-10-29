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


// Hero «EL MOMENTO»: zoom reversible con GSAP/ScrollTrigger.
// Sin videos definitivos, conserva un fondo de reserva sin pedir archivos inexistentes.
(() => {
  'use strict';

  const hero = document.querySelector('[data-hero]');
  if (!hero) return;

  const visual = hero.querySelector('[data-hero-visual]');
  const video = hero.querySelector('.hero__video');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Cuando se incorporen los MP4, el primer fotograma reemplazará al fondo de reserva.
  const hasSource = video.hasAttribute('src') || Boolean(video.querySelector('source[src]'));
  if (hasSource) {
    const showVideo = () => hero.classList.add('has-video');
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) showVideo();
    else video.addEventListener('loadeddata', showVideo, { once: true });

    if (reducedMotion.matches) video.pause();
    else if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          video.play().catch(() => { /* Autoplay puede ser restringido por el navegador. */ });
        } else {
          video.pause();
        }
      }, { threshold: 0.05 });
      observer.observe(hero.querySelector('.hero__media'));
    }
  }

  // Con movimiento reducido, evitamos tanto la reproducción como el zoom.
  if (reducedMotion.matches) return;

  if (window.gsap && window.ScrollTrigger) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    window.gsap.fromTo(visual, { scale: 1 }, {
      scale: 1.08,
      ease: 'none',
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        scrub: 0.5,
        invalidateOnRefresh: true,
      },
    });
  } else {
    // Respaldo ligero para vistas sin acceso al CDN de GSAP.
    let frame = 0;
    const updateZoom = () => {
      frame = 0;
      const progress = Math.max(0, Math.min(1,
        -hero.getBoundingClientRect().top / Math.max(hero.offsetHeight, 1)));
      visual.style.transform = `scale(${(1 + progress * 0.08).toFixed(4)})`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(updateZoom);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    updateZoom();
  }
})();


// «TU MOMENTO»: reveal vertical reversible y desplazamiento del título.
// Mantiene un placeholder visible hasta recibir los MP4 definitivos.
(() => {
  'use strict';

  const section = document.querySelector('[data-tu-momento]');
  if (!section) return;

  const intro = section.querySelector('.tu-momento__intro');
  const title = section.querySelector('[data-tu-momento-title]');
  const reveal = section.querySelector('[data-tu-momento-reveal]');
  const video = section.querySelector('.tu-momento__video');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hasVideo = video.hasAttribute('src') || Boolean(video.querySelector('source[src]'));

  if (hasVideo) {
    const showVideo = () => section.classList.add('has-video');
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) showVideo();
    else video.addEventListener('loadeddata', showVideo, { once: true });

    if (reducedMotion.matches) {
      video.pause();
    } else if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          video.play().catch(() => { /* Reproducción automática no permitida. */ });
        } else {
          video.pause();
        }
      }, { threshold: 0.05 });
      observer.observe(section.querySelector('.tu-momento__media'));
    }
  }

  section.classList.add('is-animated');

  // Sin animación para quienes prefieren movimiento reducido:
  // el título se muestra al desplazarse, sin efectos de transición.
  if (reducedMotion.matches) {
    const updateTitleVisibility = () => {
      title.style.opacity =
        section.getBoundingClientRect().top < window.innerHeight * 0.65 ? '1' : '0';
    };
    window.addEventListener('scroll', updateTitleVisibility, { passive: true });
    window.addEventListener('resize', updateTitleVisibility);
    updateTitleVisibility();
    return;
  }

  if (window.gsap && window.ScrollTrigger) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    const timeline = window.gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top 75%',
        end: 'top top',
        scrub: 0.5,
        invalidateOnRefresh: true,
      },
    });

    // Se revela desde arriba hacia abajo. Al retroceder, se oculta de nuevo.
    timeline.fromTo(reveal,
      { clipPath: 'inset(0% 0% 100% 0%)' },
      { clipPath: 'inset(0% 0% 0% 0%)', duration: 1, ease: 'none' }, 0);
    timeline.fromTo(title,
      { y: 0 },
      { y: () => intro.offsetHeight, duration: 1, ease: 'none' }, 0);
    // No se ve al cargar; aparece suavemente después de iniciar el scroll.
    timeline.fromTo(title,
      { opacity: 0 },
      { opacity: 1, duration: 0.35, ease: 'none' }, 0.20);
  } else {
    // Fallback si GSAP no está disponible (p. ej., navegador sin CDN).
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = section.getBoundingClientRect().top;
      const range = Math.max(window.innerHeight * 0.75, 1);
      const progress = Math.max(0, Math.min(1, (range - top) / range));
      title.style.transform = `translate3d(0, ${(intro.offsetHeight * progress).toFixed(2)}px, 0)`;
      title.style.opacity = String(Math.max(0, Math.min(1, (progress - 0.20) / 0.35)));
      reveal.style.clipPath = `inset(0 0 ${(100 * (1 - progress)).toFixed(2)}% 0)`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
  }
})();


// Carrusel caracol: la animación se controla por scroll, no por tiempo.
// Sin GSAP o con movimiento reducido, se muestra la grilla estática.
(() => {
  'use strict';

  const section = document.querySelector('[data-caracol]');
  if (!section) return;
  const stage = section.querySelector('[data-caracol-stage]');
  const intro = section.querySelector('[data-caracol-intro]');
  const words = [...section.querySelectorAll('[data-caracol-word]')];
  const gallery = section.querySelector('[data-caracol-gallery]');
  const cards = [...section.querySelectorAll('[data-caracol-card]')];
  const outro = section.querySelector('[data-caracol-outro]');
  const question = section.querySelector('.caracol__question');
  const play = section.querySelector('[data-caracol-play]');
  const destination = document.querySelector('[data-caracol-destino]');
  const wipe = document.querySelector('[data-caracol-wipe]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
  const ease = (value) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  let activated = false;
  let transitionPending = false;

  function goToSecret(instant = false) {
    if (!destination) return;
    if (!activated) {
      destination.hidden = false;
      activated = true;
      play.setAttribute('aria-expanded', 'true');
      // Al cambiar la altura de la página, GSAP debe recalcular el pin.
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    }
    destination.scrollIntoView({
      // El salto se hace detrás del velo azul, sin mostrar secciones intermedias.
      behavior: (instant || reduceMotion) ? 'instant' : 'smooth',
      block: 'start',
    });
    const heading = destination.querySelector('h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }

  play.addEventListener('click', () => {
    if (transitionPending) return;
    if (reduceMotion || !wipe) {
      goToSecret();
      return;
    }
    transitionPending = true;
    wipe.classList.add('is-active');
    window.setTimeout(() => {
      goToSecret(true);
      // Dos cuadros para que el navegador pinte la nueva sección
      // antes de retirar el velo: no se ven las secciones del medio.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          wipe.classList.remove('is-active');
          transitionPending = false;
        });
      });
    }, 360);
  });

  if (reduceMotion || !window.gsap || !window.ScrollTrigger) return;
  window.gsap.registerPlugin(window.ScrollTrigger);
  section.classList.add('is-enhanced');
  outro.inert = true;

  // ESCALERA CARACOL: los escalones son fotografías dispuestas alrededor
  // de un eje vertical. Cada fotografía ocupa una altura diferente.
  // El scroll desciende por la escalera: las próximas fotos quedan
  // cada vez más abajo y las ya recorridas pasan por encima.
  function renderSpiral(travel, retreat, entrance) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const mobile = width < 768;
    const radiusX = mobile ? Math.min(width * 0.35, 155) : Math.min(width * 0.255, 385);
    const radiusZ = mobile ? 155 : 300;
    const stepRise = mobile
      ? Math.min(112, Math.max(85, height * 0.12))
      : Math.min(160, Math.max(115, height * 0.155));
    const currentStep = travel * (cards.length - 1);
    const radiansPerStep = Math.PI / 3.6; // 50° entre escalones: más separación lateral.

    cards.forEach((card, index) => {
      const relativeStep = index - currentStep;
      const angle = relativeStep * radiansPerStep;
      // Coordenadas cilíndricas: radio + ángulo + altura incremental.
      const x = Math.sin(angle) * radiusX;
      const y = relativeStep * stepRise; // La escalera baja al avanzar.
      const z = Math.cos(angle) * radiusZ - retreat * 950;
      const facing = -Math.sin(angle) * 13;
      const scale = 1 - retreat * 0.58;

      card.style.transform =
        'translate3d(calc(-50% + ' + x.toFixed(2) + 'px), calc(-50% + ' +
        y.toFixed(2) + 'px), ' + z.toFixed(2) + 'px) ' +
        'rotateY(' + facing.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';

      // Los escalones más próximos tapan naturalmente los del fondo.
      card.style.zIndex = String(Math.round(z + 1500));

      // Conservamos un tramo corto de escalones visibles para que no se
      // amontonen en profundidad; el resto se desvanece gradualmente.
      const proximity = clamp(4.5 - Math.abs(relativeStep));
      // Cada escalón se materializa ligeramente después del anterior.
      const reveal = ease((entrance - index * 0.055) / 0.7);
      card.style.opacity = String(proximity * reveal);
    });
  }

  function render(progress) {
    // 1. Las palabras entran secuencialmente, con una breve pausa
    // para leer la frase completa antes de pasar a las imágenes.
    const wordPhase = clamp((progress - 0.015) / 0.205);
    words.forEach((word, index) => {
      const offset = (index / Math.max(words.length - 1, 1)) * 0.8;
      const visible = ease((wordPhase - offset) / 0.20);
      word.style.opacity = String(0.12 + visible * 0.88);
      word.style.transform = 'translateY(' + ((1 - visible) * 22).toFixed(2) + 'px)';
    });

    // 2. La frase se aleja apenas, mientras los primeros escalones
    // aparecen de forma escalonada. Sin alterar la hélice aprobada.
    const textExit = ease((progress - 0.27) / 0.095);
    const introOpacity = 1 - textExit;
    intro.style.opacity = String(introOpacity);
    intro.style.visibility = introOpacity > 0.005 ? 'visible' : 'hidden';
    intro.style.transform = 'translateY(' + (-18 * textExit).toFixed(2) + 'px) ' +
      'scale(' + (1 - 0.035 * textExit).toFixed(4) + ')';

    const entry = ease((progress - 0.315) / 0.12);
    const retreat = ease((progress - 0.775) / 0.125);
    const galleryOpacity = entry * (1 - ease((progress - 0.79) / 0.11));
    gallery.style.opacity = String(galleryOpacity);
    gallery.style.visibility = galleryOpacity > 0.005 ? 'visible' : 'hidden';
    gallery.style.transform = 'scale(' + (1.04 - 0.04 * entry - 0.06 * retreat).toFixed(4) + ')';
    renderSpiral(clamp((progress - 0.35) / 0.43), retreat, entry);

    // 3. Se aleja la escalera; primero aparece la pregunta y después PLAY.
    const outroPhase = ease((progress - 0.855) / 0.085);
    const questionPhase = ease((progress - 0.855) / 0.075);
    const playPhase = ease((progress - 0.915) / 0.065);
    outro.style.opacity = String(outroPhase);
    outro.style.visibility = outroPhase > 0.005 ? 'visible' : 'hidden';
    outro.style.transform = 'translateY(' + ((1 - outroPhase) * 18).toFixed(2) + 'px)';
    question.style.opacity = String(questionPhase);
    question.style.transform = 'translateY(' + ((1 - questionPhase) * 18).toFixed(2) + 'px)';
    play.style.opacity = String(playPhase);
    play.style.setProperty('--play-enter-y', ((1 - playPhase) * 28).toFixed(2) + 'px');
    play.style.setProperty('--play-enter-scale', (0.94 + 0.06 * playPhase).toFixed(4));

    const clickable = progress >= 0.97;
    outro.classList.toggle('is-clickable', clickable);
    outro.inert = !clickable;
  }

  // GSAP interpola el progreso durante una fracción de segundo.
  // Antes renderizábamos directamente self.progress en cada evento de scroll,
  // lo que hacía que las tarjetas respondieran demasiado bruscamente.
  const smoothProgress = { value: 0 };
  const inertiaSeconds = window.innerWidth < 768 ? 0.8 : 1.1;

  window.gsap.to(smoothProgress, {
    value: 1,
    ease: 'none',
    onUpdate: () => render(smoothProgress.value),
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => '+=' + Math.round(Math.max(window.innerHeight, 480) * 5.2),
      pin: stage,
      pinSpacing: true,
      scrub: inertiaSeconds,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onRefresh: () => render(smoothProgress.value),
    },
  });
  render(smoothProgress.value);
  window.addEventListener('resize', () => render(smoothProgress.value), { passive: true });
})();


// Reveal de servicios: animación individual para cada bloque cuando entra
// al viewport; una vez revelado permanece visible incluso al subir.
// Sin IntersectionObserver o con movimiento reducido, no se oculta nada.
(() => {
  'use strict';

  const section = document.querySelector('[data-servicios]');
  if (!section) return;

  const elements = [...section.querySelectorAll('[data-reveal]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, {
    root: null,
    threshold: 0.12,
    rootMargin: '0px 0px -7% 0px',
  });

  section.classList.add('has-scroll-reveal');
  elements.forEach((el) => observer.observe(el));
})();
