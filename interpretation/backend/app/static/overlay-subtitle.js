// Subtitle stage: keeps up to maxLines DOM nodes, fades in new lines, fades
// out old ones after `holdMs` of no updates.

export class SubtitleStage {
  /**
   * @param {HTMLElement} root
   * @param {{ maxLines?: number, holdMs?: number }} [opts]
   */
  constructor(root, { maxLines = 2, holdMs = 4500 } = {}) {
    this._root = root;
    this._maxLines = maxLines;
    this._holdMs = holdMs;
    /** @type {{ el: HTMLElement, isFinal: boolean }[]} */
    this._lines = [];
    this._fadeTimer = null;
    this._currentInterimIndex = -1;
  }

  /**
   * @param {string} text
   * @param {{ isFinal?: boolean }} [opts]
   */
  push(text, { isFinal = false } = {}) {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (
      !isFinal &&
      this._currentInterimIndex >= 0 &&
      this._currentInterimIndex < this._lines.length
    ) {
      // Update existing interim line in place.
      const line = this._lines[this._currentInterimIndex];
      line.el.textContent = trimmed;
      this._scheduleFade();
      return;
    }

    const el = document.createElement("div");
    el.className = "subtitle-line";
    el.textContent = trimmed;
    this._root.appendChild(el);

    // Trigger reflow so the .show transition runs.
    requestAnimationFrame(() => el.classList.add("show"));

    const entry = { el, isFinal };
    this._lines.push(entry);
    if (!isFinal) this._currentInterimIndex = this._lines.length - 1;
    else this._currentInterimIndex = -1;

    while (this._lines.length > this._maxLines) {
      const old = this._lines.shift();
      if (old) {
        old.el.classList.add("fade-out");
        setTimeout(() => old.el.remove(), 260);
        if (this._currentInterimIndex >= 0) this._currentInterimIndex--;
      }
    }

    this._scheduleFade();
  }

  _scheduleFade() {
    if (this._fadeTimer) clearTimeout(this._fadeTimer);
    this._fadeTimer = setTimeout(() => this.clear(), this._holdMs);
  }

  clear() {
    while (this._lines.length) {
      const entry = this._lines.shift();
      if (!entry) continue;
      entry.el.classList.add("fade-out");
      setTimeout(() => entry.el.remove(), 260);
    }
    this._currentInterimIndex = -1;
  }
}
