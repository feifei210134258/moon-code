import type { BrowserAnnotationMode } from '../../shared/contracts.js'

export const ANNOTATION_WORLD_ID = 999

export function annotationPickScript(mode: BrowserAnnotationMode): string {
  return `(() => new Promise((resolve) => {
    const mode = ${JSON.stringify(mode)};
    const globalKey = '__kimiAgentAnnotationCleanup';
    if (typeof globalThis[globalKey] === 'function') globalThis[globalKey]();

    const host = document.createElement('div');
    host.setAttribute('data-kad-annotation-root', '');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = ':host{all:initial}.box{position:fixed;display:none;border:2px solid #2563eb;background:rgba(37,99,235,.10);box-shadow:0 0 0 1px rgba(255,255,255,.9),0 8px 22px rgba(25,45,75,.16);border-radius:4px;box-sizing:border-box}.hint{position:fixed;top:12px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 24px);padding:7px 10px;border:1px solid rgba(255,255,255,.86);border-radius:9px;color:#1f2937;background:rgba(250,253,255,.92);box-shadow:0 8px 24px rgba(25,45,75,.16);font:600 12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap}';
    const box = document.createElement('div');
    box.className = 'box';
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = mode === 'element' ? '点击选择元素 · Esc 取消' : '拖拽选择区域 · Esc 取消';
    shadow.append(style, box, hint);
    document.documentElement.appendChild(host);

    let done = false;
    let current = null;
    let start = null;
    let dragging = false;

    const cleanText = (value, limit = 240) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, limit);
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
    const showRect = (rect) => {
      box.style.display = 'block';
      box.style.left = Math.round(rect.x) + 'px';
      box.style.top = Math.round(rect.y) + 'px';
      box.style.width = Math.max(1, Math.round(rect.width)) + 'px';
      box.style.height = Math.max(1, Math.round(rect.height)) + 'px';
    };
    const page = () => ({
      url: location.href,
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1 }
    });
    const finish = (value) => {
      if (done) return;
      done = true;
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('mouseup', onUp, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
      host.remove();
      globalThis[globalKey] = undefined;
      resolve(value);
    };
    const elementResult = (element) => {
      const rect = element.getBoundingClientRect();
      const password = element instanceof HTMLInputElement && element.type === 'password';
      return {
        page: page(),
        scroll: { x: scrollX, y: scrollY },
        target: {
          kind: 'element',
          selector: selectorFor(element),
          xpath: xpathFor(element),
          tag: element.tagName.toLowerCase(),
          ariaLabel: cleanText(element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('alt'), 160),
          textSnippet: password ? '' : cleanText(element.innerText || element.textContent, 240),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        }
      };
    };
    function onMove(event) {
      if (mode === 'region' && dragging && start) {
        const x = Math.min(start.x, event.clientX);
        const y = Math.min(start.y, event.clientY);
        showRect({ x, y, width: Math.abs(event.clientX - start.x), height: Math.abs(event.clientY - start.y) });
        return;
      }
      if (mode !== 'element') return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (!(target instanceof Element) || target === host || host.contains(target)) return;
      current = target;
      showRect(target.getBoundingClientRect());
    }
    function onClick(event) {
      if (mode !== 'element') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const target = current || document.elementFromPoint(event.clientX, event.clientY);
      if (target instanceof Element && target !== host && !host.contains(target)) finish(elementResult(target));
    }
    function onDown(event) {
      if (mode !== 'region' || event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      start = { x: event.clientX, y: event.clientY };
      dragging = true;
      showRect({ x: start.x, y: start.y, width: 1, height: 1 });
    }
    function onUp(event) {
      if (mode !== 'region' || !dragging || !start) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      dragging = false;
      const rect = {
        x: Math.min(start.x, event.clientX),
        y: Math.min(start.y, event.clientY),
        width: Math.abs(event.clientX - start.x),
        height: Math.abs(event.clientY - start.y)
      };
      if (rect.width < 6 || rect.height < 6) { start = null; box.style.display = 'none'; return; }
      finish({ page: page(), scroll: { x: scrollX, y: scrollY }, target: { kind: 'region', rect } });
    }
    function onKey(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(null);
    }
    globalThis[globalKey] = () => finish(null);
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('mouseup', onUp, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
  }))()`
}

