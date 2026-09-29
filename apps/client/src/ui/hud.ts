function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent?.append(node);
  return node;
}

export type HitKind = "body" | "head" | "kill";

/** HUD del joc: punt de mira, impactes, vida, munició, marcador i pantalla d'inici/pausa. */
export class Hud {
  private readonly crosshair: HTMLDivElement;
  private readonly hitmarker: HTMLDivElement;
  private readonly health: HTMLDivElement;
  private readonly healthBar: HTMLDivElement;
  private readonly weaponName: HTMLDivElement;
  private readonly ammo: HTMLDivElement;
  private readonly score: HTMLDivElement;
  private readonly feed: HTMLDivElement;
  private readonly overlay: HTMLDivElement;
  private readonly overlayTitle: HTMLHeadingElement;
  private readonly overlayText: HTMLParagraphElement;
  private hitTimer = 0;

  constructor(root: HTMLElement) {
    root.replaceChildren();
    this.crosshair = el("div", "crosshair", root);
    for (const side of ["t", "b", "l", "r"]) el("i", side, this.crosshair);
    el("b", "dot", this.crosshair);
    this.hitmarker = el("div", "hitmarker", root);
    for (let i = 0; i < 4; i++) el("i", "", this.hitmarker);

    const left = el("div", "hud-panel hud-left", root);
    this.health = el("div", "hud-health", left);
    this.healthBar = el("div", "hud-bar", el("div", "hud-bar-track", left));

    const right = el("div", "hud-panel hud-right", root);
    this.weaponName = el("div", "hud-weapon", right);
    this.ammo = el("div", "hud-ammo", right);

    this.score = el("div", "hud-score", root);
    this.feed = el("div", "hud-feed", root);

    this.overlay = el("div", "overlay", root);
    const card = el("div", "overlay-card", this.overlay);
    this.overlayTitle = el("h1", "", card);
    this.overlayText = el("p", "", card);
    const keys = el("ul", "overlay-keys", card);
    for (const [k, v] of [
      ["WASD", "moure's"],
      ["Ratolí", "apuntar · clic esquerre dispara"],
      ["Espai", "saltar"],
      ["Maj.", "córrer"],
      ["C", "ajupir-se"],
      ["R", "recarregar"],
      ["1 2 3 / roda", "canviar d'arma"],
      ["Esc", "pausa"],
    ]) {
      const li = el("li", "", keys);
      el("kbd", "", li).textContent = k;
      li.append(` ${v}`);
    }
  }

  /** Obertura del punt de mira en píxels (segons la dispersió de l'arma). */
  setSpread(px: number): void {
    this.crosshair.style.setProperty("--gap", `${Math.round(4 + px)}px`);
  }

  showHit(kind: HitKind): void {
    this.hitmarker.dataset.kind = kind;
    this.hitmarker.classList.remove("show");
    void this.hitmarker.offsetWidth; // reinicia l'animació CSS
    this.hitmarker.classList.add("show");
    this.hitTimer = 0.2;
  }

  setHealth(value: number): void {
    const v = Math.max(0, Math.round(value));
    this.health.textContent = `${v}`;
    this.healthBar.style.width = `${v}%`;
  }

  setWeapon(name: string, ammo: number, reserve: number, reloading: boolean): void {
    this.weaponName.textContent = reloading ? `${name} · recarregant…` : name;
    this.ammo.textContent = `${ammo} / ${reserve}`;
    this.ammo.classList.toggle("low", ammo === 0);
  }

  setScore(text: string): void {
    this.score.textContent = text;
  }

  pushFeed(text: string): void {
    const line = el("div", "hud-feed-line", this.feed);
    line.textContent = text;
    setTimeout(() => line.remove(), 3000);
    while (this.feed.childElementCount > 5) this.feed.firstElementChild?.remove();
  }

  onOverlayClick(listener: () => void): void {
    this.overlay.addEventListener("click", listener);
  }

  showOverlay(title: string, text: string): void {
    this.overlayTitle.textContent = title;
    this.overlayText.textContent = text;
    this.overlay.classList.remove("hidden");
  }

  hideOverlay(): void {
    this.overlay.classList.add("hidden");
  }

  update(dt: number): void {
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.hitmarker.classList.remove("show");
    }
  }
}
