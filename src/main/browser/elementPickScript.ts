export const ELEMENT_PICK_WORLD_ID = 999

export function elementPickScript(): string {
  return `(() => new Promise((resolve) => {
    const globalKey = '__kimiAgentElementPickerCleanup';
    if (typeof globalThis[globalKey] === 'function') globalThis[globalKey]();

    const host = document.createElement('div');
    host.setAttribute('data-kad-element-picker-root', '');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = ':host{all:initial}.frame{position:fixed;display:none;border:2px solid #2563eb;background:rgba(37,99,235,.12);border-radius:4px;box-sizing:border-box;pointer-events:none;z-index:1}.flash{position:fixed;display:none;border:2px solid #10b981;background:rgba(16,185,129,.18);border-radius:4px;box-sizing:border-box;pointer-events:none;z-index:1;animation:pickflash .6s ease-out forwards}.hint{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);padding:6px 12px;border-radius:999px;background:rgba(15,23,42,.55);color:#fff;font:500 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:none;z-index:3;user-select:none;white-space:nowrap;opacity:.92}@keyframes pickflash{from{opacity:1}to{opacity:0}}';
    const frame = document.createElement('div');
    frame.className = 'frame';
    const flash = document.createElement('div');
    flash.className = 'flash';
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = '点击元素加入输入框 · Esc 结束';
    shadow.append(style, frame, flash, hint);
    document.documentElement.appendChild(host);

    let finished = false;
    let hovered = null;
    let flashTimer = null;

    const cleanText = (value, limit = 300) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, limit);
    const escapeCss = (value) => globalThis.CSS && typeof CSS.escape === 'function'
      ? CSS.escape(value)
      : String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => '\\\\' + char);
    const selectorFor = (element) => {
      if (!(element instanceof Element)) return '';
      if (element.id) return '#' + escapeCss(element.id);
      for (const name of ['data-testid', 'data-test', 'aria-label', 'name']) {
        const value = cleanText(element.getAttribute(name), 120);
        if (value) return element.tagName.toLowerCase() + '[' + name + '="' + escapeCss(value) + '"]';
      }
      const parts = [];
      let node = element;
      for (let depth = 0; node && node.nodeType === 1 && depth < 4; depth += 1) {
        let part = node.tagName.toLowerCase();
        const parent = node.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((item) => item.tagName === node.tagName);
          if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
        }
        parts.unshift(part);
        node = parent;
      }
      return parts.join(' > ');
    };
    const xpathFor = (element) => {
      if (!(element instanceof Element)) return '';
      const parts = [];
      let node = element;
      while (node && node.nodeType === 1 && parts.length < 6) {
        const tag = node.tagName.toLowerCase();
        const parent = node.parentElement;
        if (!parent) { parts.unshift(tag); break; }
        const siblings = Array.from(parent.children).filter((item) => item.tagName === node.tagName);
        parts.unshift(tag + (siblings.length > 1 ? '[' + (siblings.indexOf(node) + 1) + ']' : ''));
        node = parent;
      }
      return '/' + parts.join('/');
    };
    const showFrameFor = (element) => {
      if (!(element instanceof Element)) {
        frame.style.display = 'none';
        return;
      }
      const rect = element.getBoundingClientRect();
      frame.style.display = 'block';
      frame.style.left = Math.round(rect.x) + 'px';
      frame.style.top = Math.round(rect.y) + 'px';
      frame.style.width = Math.max(1, Math.round(rect.width)) + 'px';
      frame.style.height = Math.max(1, Math.round(rect.height)) + 'px';
    };
    const flashElement = (element) => {
      if (!(element instanceof Element)) return;
      const rect = element.getBoundingClientRect();
      frame.style.display = 'none';
      flash.style.left = Math.round(rect.x) + 'px';
      flash.style.top = Math.round(rect.y) + 'px';
      flash.style.width = Math.max(1, Math.round(rect.width)) + 'px';
      flash.style.height = Math.max(1, Math.round(rect.height)) + 'px';
      flash.style.animation = 'none';
      void flash.offsetWidth;
      flash.style.animation = '';
      flash.style.display = 'block';
    };
    const styleSummary = (element) => {
      const style = globalThis.getComputedStyle(element);
      const fontFamily = cleanText((style.fontFamily || '').split(',')[0], 80);
      const border = style.borderStyle === 'none'
        ? 'none'
        : cleanText(
            [style.borderTopWidth, style.borderTopStyle, style.borderTopColor].filter(Boolean).join(' '),
            80
          );
      return {
        display: cleanText(style.display, 40),
        position: cleanText(style.position, 40),
        fontFamily,
        fontSize: cleanText(style.fontSize, 40),
        fontWeight: cleanText(style.fontWeight, 40),
        lineHeight: cleanText(style.lineHeight, 40),
        color: cleanText(style.color, 60),
        background: cleanText(style.backgroundColor, 80),
        padding: cleanText(style.padding, 80),
        margin: cleanText(style.margin, 80),
        border,
        borderRadius: cleanText(style.borderRadius, 60)
      };
    };
    const elementResult = (element) => {
      const rect = element.getBoundingClientRect();
      const password = element instanceof HTMLInputElement && element.type === 'password';
      return {
        selector: selectorFor(element),
        xpath: xpathFor(element),
        tag: element.tagName.toLowerCase(),
        ariaLabel: cleanText(
          element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('alt'),
          200
        ),
        textSnippet: password ? '' : cleanText(element.innerText || element.textContent, 300),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        pageUrl: location.href,
        pageTitle: document.title,
        styles: styleSummary(element)
      };
    };
    const finish = (value) => {
      if (finished) return;
      finished = true;
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', reflow, true);
      window.removeEventListener('resize', reflow);
      document.removeEventListener('kimi:element-pick-cancel', onCancel, true);
      if (flashTimer !== null) clearTimeout(flashTimer);
      host.remove();
      globalThis[globalKey] = undefined;
      resolve(value);
    };
    function onMove(event) {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (!(target instanceof Element)) {
        hovered = null;
        frame.style.display = 'none';
        return;
      }
      hovered = target;
      showFrameFor(target);
    }
    function onClick(event) {
      const target = hovered instanceof Element
        ? hovered
        : document.elementFromPoint(event.clientX, event.clientY);
      if (!(target instanceof Element)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      flashElement(target);
      if (flashTimer !== null) clearTimeout(flashTimer);
      flashTimer = setTimeout(
        () => finish({ cancelled: false, elements: [elementResult(target)] }),
        650
      );
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish({ cancelled: true, elements: [] });
      }
    }
    function onCancel(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      finish({ cancelled: true, elements: [] });
    }
    const reflow = () => {
      if (hovered instanceof Element) showFrameFor(hovered);
    };
    globalThis[globalKey] = () => finish({ cancelled: true, elements: [] });
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('kimi:element-pick-cancel', onCancel, true);
    window.addEventListener('scroll', reflow, true);
    window.addEventListener('resize', reflow);
  }))()`
}