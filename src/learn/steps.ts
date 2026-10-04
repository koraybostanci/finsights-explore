/** Karar adımları (geçici iskelet). mount: sekme ilk kez kurulurken; refresh: sekme görünür olduğunda ve genişlik değişince. */

export function mount(root: HTMLElement): void {
  root.innerHTML = '<div class="stack read"><h2>Karar adımları</h2><p class="muted">Bu bölüm hazırlanıyor.</p></div>';
}

export function refresh(): void {}
