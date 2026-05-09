# Streaming Box Design System

```yaml
format: design.md/1.0
name: streaming-box
version: 1.1.4
mode: dark-first
base_font: Space Grotesk
```

## Tokens

### Colors

```yaml
colors:
  dark:
    bg0: "#141b33"
    bg1: "#1a2342"
    card: rgba(30, 41, 75, 0.9)
    card2: rgba(22, 30, 62, 0.8)
    stroke: rgba(59, 130, 246, 0.22)
    stroke2: rgba(255, 255, 255, 0.05)
    text: "#ffffff"
    muted: "#f1f5f9"
    muted2: "#e2e8f0"
    accent: "#3B82F6"
    accent_dark: "#2563EB"
    accent2: "#8B5CF6"
    accent_glow: rgba(59, 130, 246, 0.30)
    danger: "#EF4444"
    input_bg: rgba(0, 0, 0, 0.25)
    input_color: "#FFFFFF"
    input_stroke: rgba(255, 255, 255, 0.10)
    fx1: rgba(37, 99, 235, 0.18)
    fx2: rgba(139, 92, 246, 0.14)
  light:
    bg0: "#f0f4ff"
    bg1: "#e8edf8"
    card: rgba(255, 255, 255, 0.9)
    card2: rgba(249, 250, 251, 0.8)
    stroke: rgba(0, 0, 0, 0.06)
    stroke2: rgba(0, 0, 0, 0.03)
    text: "#0f172a"
    muted: "#64748b"
    muted2: "#94a3b8"
    input_bg: "#f9fafb"
    input_color: "#0f172a"
    input_stroke: rgba(0, 0, 0, 0.08)
    shadow: 0 10px 40px rgba(0, 0, 0, 0.04)
    fx1: rgba(59, 130, 246, 0.05)
    fx2: rgba(139, 92, 246, 0.04)
  constants:
    cyan_accent: "#0da6f2"
    violet_gradient: "#6333ff"
    green_success: "#10b981"
    red_danger: "#EF4444"
    red_dark: "#dc2626"
    amber_warning: "#f59e0b"
    cyan_promo: "#22d3ee"
    yellow_low_stock: "#fde047"
    admin_active: "#0ca5e9"
```

### Typography

```yaml
typography:
  font_family: "'Space Grotesk', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
  font_weights: [400, 500, 600, 700, 800, 900]
  scale:
    h1: { size: 22px, weight: 900, letter_spacing: -0.4px }
    h2: { size: 18px, weight: 800 }
    h3: { size: 16px, weight: 800 }
    card_title: { size: 13px, weight: 800, transform: uppercase, letter_spacing: 0.4px }
    price: { size: 22px, weight: 900 }
    body: { size: 14px, weight: 400, line_height: 1.5 }
    muted: { size: 13px, weight: 400, color: muted }
    badge: { size: 10px, weight: 800, transform: uppercase, letter_spacing: 0.6px }
    kpi_value: { size: 28px, weight: 900 }
    mono: { font_family: "ui-monospace, SFMono-Regular, Consolas, monospace", size: 13px }
```

### Spacing

```yaml
spacing:
  radii:
    base: 12px
    large: 24px
    pill: 999px
    card: 16px
    modal: 20px
    input: 10px
    button: 10px
    badge: 8px
  gaps:
    page: 16px
    grid: 14px
    kpi_grid: 12px
    sidebar_nav: 4px
  padding:
    card: 16px
    page_inner: 18px
    section: 24px
  button_heights:
    primary: 48px
    ghost: 42px
    compact: 36px
    small: 32px
```

### Shadows

```yaml
shadows:
  card: 0 30px 60px -12px rgba(0, 0, 0, 0.7)
  card_hover: 0 12px 40px rgba(0, 0, 0, 0.2)
  button_glow: 0 4px 12px rgba(13, 166, 242, 0.3)
  modal: 0 24px 64px rgba(0, 0, 0, 0.5)
  badge_pulse: 0 0 8px rgba(245, 158, 11, 0.5)
  light_mode: 0 10px 40px rgba(0, 0, 0, 0.04)
```

### Gradients

```yaml
gradients:
  primary_button: linear-gradient(180deg, #3B82F6, #2563EB)
  cta_gradient: linear-gradient(135deg, #0da6f2, #6333ff)
  danger_gradient: linear-gradient(135deg, #ef4444, #dc2626)
  admin_active_bg: linear-gradient(135deg, rgba(13, 166, 242, 0.15), rgba(99, 51, 255, 0.08))
  card_hover_overlay: linear-gradient(135deg, rgba(13, 95, 230, 0.12), rgba(99, 0, 200, 0.08))
  page_bg: linear-gradient(180deg, var(--bg0), var(--bg1))
  expirations_badge: linear-gradient(135deg, #ef4444, #f97316)
```

---

## Layout System

```yaml
layout:
  page_shell:
    css: |
      display: flex; flex-direction: column; min-height: 100vh;
      background: linear-gradient(180deg, var(--bg0), var(--bg1));
      position: relative; overflow-x: hidden;
    contains: [page_shell_bg, page_inner]
  
  page_shell_bg:
    css: "position: absolute; inset: 0; pointer-events: none; z-index: 0;"
    contains: [orb_1, orb_2, bg_grid]
  
  orb:
    css: "position: fixed; width: 520px; height: 520px; border-radius: 50%; filter: blur(40px); opacity: 0.14;"
    variants:
      orb_1: "right: -140px; top: -80px; background: var(--fx1);"
      orb_2: "left: -100px; bottom: 30%; background: var(--fx2);"
  
  bg_grid:
    css: |
      opacity: 0.10;
      background-image: repeating-linear-gradient(0deg, var(--stroke2), var(--stroke2) 1px, transparent 1px, transparent 48px),
                        repeating-linear-gradient(90deg, var(--stroke2), var(--stroke2) 1px, transparent 1px, transparent 48px);
    note: "Hidden in light mode via html[data-theme='light'] .bg-grid { display: none; }"

  page_inner:
    css: |
      display: flex; flex-direction: row; align-items: stretch;
      max-width: 1600px; width: 100%; margin: 0 auto; flex: 1;
      position: relative; z-index: 1;

  main:
    css: "flex: 1 1 auto; padding: 16px; min-width: 0;"

  sidebar:
    css: "width: 320px; flex-shrink: 0; background: var(--card); border-right: 1px solid var(--stroke);"
    mobile: "position: fixed; transform: translateX(-100%); transition: transform 0.3s; z-index: 999;"
    collapsed_class: "sidebar--collapsed"

  glass:
    css: "backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);"
    note: "Disabled on mobile (< 900px) for performance: backdrop-filter: none;"
```

---

## Components

### Button

```yaml
button:
  base:
    css: |
      cursor: pointer; font-family: var(--font); border: none;
      transition: all 0.2s ease; display: inline-flex; align-items: center; justify-content: center;
  
  variants:
    primary:
      class: btn
      css: |
        background: linear-gradient(180deg, #3B82F6, #2563EB);
        color: #fff; height: 48px; padding: 0 24px; border-radius: var(--radius);
        font-size: 14px; font-weight: 700;
        box-shadow: 0 8px 24px rgba(37, 99, 235, 0.25);
      hover: "transform: translateY(-2px); box-shadow: 0 14px 28px rgba(37, 99, 235, 0.35);"
      active: "transform: translateY(0);"
      disabled: "opacity: 0.5; cursor: not-allowed; pointer-events: none;"

    ghost:
      class: btn-ghost
      css: |
        background: transparent; color: var(--text);
        border: 1px solid var(--stroke); height: 42px; padding: 0 20px;
        border-radius: var(--radius); font-size: 13px; font-weight: 600;
      hover: "background: rgba(255, 255, 255, 0.05);"
      danger_hover: "background: rgba(239, 68, 68, 0.1); color: #EF4444; border-color: rgba(239, 68, 68, 0.3);"

    cta:
      css: |
        background: linear-gradient(135deg, #0da6f2, #6333ff);
        color: #fff; height: 38px; padding: 0 18px;
        border-radius: 10px; font-size: 13px; font-weight: 700;
        box-shadow: 0 4px 12px rgba(13, 166, 242, 0.3);
        position: relative; overflow: hidden;
      shimmer: "::before pseudo-element with linear-gradient shimmer animation"

    icon:
      css: |
        background: transparent; border: none; color: var(--muted);
        cursor: pointer; padding: 4px 8px; font-size: 13px;
      hover: "color: var(--text);"

    danger:
      css: |
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: #fff; border: none; border-radius: 12px;
        font-weight: 700; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
```

### Card

```yaml
card:
  base:
    css: |
      background: var(--card); border: 1px solid var(--stroke);
      border-radius: var(--radius2); backdrop-filter: blur(16px);
      box-shadow: var(--shadow); transition: all 0.2s ease;

  variants:
    glass:
      class: card
      css: |
        background: var(--card); border: 1px solid var(--stroke);
        border-radius: var(--radius2); position: relative; overflow: hidden;
      pseudo_before: |
        content: ""; position: absolute; inset: 0; border-radius: inherit;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), transparent 60%);
        pointer-events: none;

    promo:
      class: catalog-card--promo
      css: |
        border: 2px solid var(--promo-ring, #22d3ee);
        box-shadow: 0 0 24px var(--promo-glow, rgba(34, 211, 238, 0.18)), var(--shadow);
        position: relative;

    admin:
      css: |
        background: var(--bg0); border: 1px solid var(--stroke);
        border-radius: 14px; padding: 20px;
      hover: "transform: scale(1.02) translateY(-4px); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);"

    image_thumbnail:
      css: |
        background: var(--bg0); border: 1px solid var(--stroke);
        border-radius: 12px; overflow: hidden;
        aspect-ratio: 16 / 10;
      variants:
        active: "opacity: 1; border-color: var(--stroke);"
        hidden: "opacity: 0.5; border-color: rgba(239, 68, 68, 0.25);"

  kpi:
    css: |
      background: var(--card); border: 1px solid var(--stroke);
      border-radius: 16px; padding: 16px; backdrop-filter: blur(16px);
```

### Input

```yaml
input:
  base:
    css: |
      appearance: none; height: 44px; padding: 0 14px;
      background: var(--input-bg); color: var(--input-color);
      border: 1px solid var(--input-stroke); border-radius: var(--radius);
      font-size: 14px; font-weight: 500; font-family: var(--font);
      outline: none; width: 100%; transition: border-color 0.2s;
    focus: "border-color: var(--accent); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);"

  variants:
    compact:
      css: "height: 36px; font-size: 13px; padding: 0 10px;"
    search:
      class: dash-search2
      css: "border-radius: 999px; height: 44px; min-width: 44px; max-width: 280px;"
      focus: "box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.25); border-color: var(--accent2);"

    inline_rename:
      css: "height: 30px; font-size: 12px; padding: 0 8px; border-radius: 8px;"
```

### Modal

```yaml
modal:
  base:
    css: |
      position: fixed; inset: 0; z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.7);

  variants:
    confirm:
      css: |
        backdrop-filter: blur(6px);
        dialog: max-width: 420px; width: 100%;
        background: var(--bg0); border: 1px solid var(--stroke);
        border-radius: 20px; padding: 24px;
        box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);

    preview:
      css: |
        background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px);
        padding: 20px;
        dialog: max-width: 90vw; max-height: 90vh;

    sidebar_overlay:
      css: "background: rgba(0, 0, 0, 0.45); backdrop-filter: blur(2px); z-index: 998;"
```

### Badge

```yaml
badge:
  base:
    css: |
      border-radius: 999px; font-weight: 800;
      display: inline-flex; align-items: center; justify-content: center;

  variants:
    stock_ok:
      css: "background: #10b981; color: #fff; font-size: 10px; padding: 2px 7px;"
    stock_low:
      css: "background: #fde047; color: #000; font-size: 10px; padding: 2px 7px;"
    stock_out:
      css: "background: #fca5a5; color: #991b1b; font-size: 10px; padding: 2px 7px;"
    expirations:
      css: "background: linear-gradient(135deg, #ef4444, #f97316); color: #fff; font-size: 10px; padding: 2px 7px; animation: pulse 1.8s infinite;"
    new_version:
      css: "background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff; font-size: 10px; padding: 3px 8px; box-shadow: 0 0 12px rgba(34, 197, 94, 0.28);"
    promo:
      css: "font-size: 8px; text-transform: uppercase; letter-spacing: 0.6px; padding: 4px 8px;"
    hidden_overlay:
      css: "background: rgba(239, 68, 68, 0.8); color: #fff; padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 800;"
```

### Sidebar

```yaml
sidebar:
  admin:
    component: AdminSidebar
    groups:
      - title: Principal
        links: [{ path: /admin, label: Panel Principal, icon: 🏠 }]
      - title: Ventas & Finanzas
        links: [{ path: /admin/analytics, icon: 📊 }, { path: /admin/sales-top, icon: 🏆 }, { path: /admin/transactions, icon: 💲 }, { path: /admin/topups, icon: 💸 }, { path: /admin/orders, icon: 📜 }, { path: /admin/renewals, icon: 🔄 }]
      - title: Cuentas & Inventario
        links: [{ path: /admin/accounts, icon: 🔐 }, { path: /admin/inventory, icon: 📦 }, { path: /admin/expirations, icon: ⏳ }, { path: /admin/code-requests, icon: 🎟️ }, { path: /admin/code-logs, icon: 🎫 }, { path: /admin/stock-notify, icon: 🔔 }, { path: /admin/upload-logs, icon: 📋 }, { path: /admin/advertising, icon: 📢 }]
      - title: Catalogo & Oferta
        links: [{ path: /admin/categories, icon: 📁 }, { path: /admin/platforms, icon: 📺 }, { path: /admin/prices, icon: 💳 }, { path: /admin/durations, icon: ⏱️ }]
      - title: Usuarios & Atencion
        links: [{ path: /admin/users, icon: 👥 }, { path: /admin/support, icon: 🎧 }, { path: /admin/replacements, icon: 🔁 }]
    nav_item:
      base:
        css: |
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px; border-radius: 14px; cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      active:
        css: |
          background: linear-gradient(135deg, rgba(13, 166, 242, 0.15), rgba(99, 51, 255, 0.08));
          color: #0ca5e9; border: 1px solid rgba(13, 166, 242, 0.25);
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
      icon:
        css: "font-size: 18px; opacity: 0.7; flex-shrink: 0;"
        active: "opacity: 1; color: #0ca5e9; filter: drop-shadow(0 0 4px rgba(13, 166, 242, 0.6));"
      label:
        css: "font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;"
        active: "font-weight: 700;"

  user:
    component: Sidebar
    items:
      - { key: home, label: Inicio, icon: 🏠, path: /dashboard }
      - { key: wallet, label: Recargas, icon: 💳, path: /topups }
      - { key: orders, label: Historial de Compras, icon: 🧾, path: /orders }
      - { key: renewals, label: Renovaciones, icon: 🔄, path: /renewals }
      - { key: analytics, label: Mis Estadísticas, icon: 📊, path: /analytics }
      - { key: expirations, label: Vencimientos, icon: ⏳, path: /expirations }
      - { key: codes, label: Códigos, icon: 🔐, path: /codes }
      - { key: advertising, label: Publicidad, icon: 📢, path: /advertising }
      - { key: support, label: Soporte, icon: 🛠️, path: null }
    nav_item:
      base:
        css: |
          display: flex; align-items: center; gap: 12px; width: 100%;
          padding: 10px 14px; border-radius: 12px; border: 1px solid transparent;
          background: transparent; color: var(--muted);
          font-size: 13px; font-weight: 500; font-family: var(--font);
          cursor: pointer; transition: all 0.2s ease; text-align: left;
      active:
        css: |
          background: linear-gradient(135deg, rgba(13, 166, 242, 0.15), rgba(99, 51, 255, 0.08));
          color: #0ca5e9; border-color: rgba(13, 166, 242, 0.25);
      indicator:
        component: motion.span
        css: "position: absolute; right: 8px; width: 6px; height: 6px; border-radius: 50%; background: #0da6f2;"
        prop: layoutId="activeNavDot"
    balance_card:
      css: |
        background: rgba(0, 0, 0, 0.2); border: 1px solid var(--stroke);
        border-radius: 14px; padding: 14px; margin: 12px 0;
```

### Toast / Message

```yaml
toast:
  animated: true
  component: motion.div
  animation:
    initial: { opacity: 0, y: -6 }
    animate: { opacity: 1, y: 0 }
    exit: { opacity: 0 }
  variants:
    error:
      css: |
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #ef4444; border-radius: 10px;
        padding: 12px 16px; margin-bottom: 16px;
        font-size: 13px; font-weight: 600; cursor: pointer;
    success:
      css: |
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.3);
        color: #10b981; border-radius: 10px;
        padding: 12px 16px; margin-bottom: 16px;
        font-size: 13px; font-weight: 600;
  auto_dismiss: 3000ms
```

### Spinner / Loader

```yaml
spinner:
  css: |
    width: 32px; height: 32px;
    border: 3px solid var(--stroke);
    border-top-color: #0da6f2;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto;

  animations:
    spin: "0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); }"
    pulse: "0%, 100% { opacity: 1; } 50% { opacity: 0.5; }"
```

---

## Animations

```yaml
animations:
  css:
    spin:
      keyframes: "0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); }"
      usage: "spinners, refresh buttons"
    pulse:
      keyframes: "0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(0.95); }"
      usage: "badges (expirations, stock alerts)"
    slideUp:
      keyframes: "0% { opacity: 0; transform: translateY(16px); } 100% { opacity: 1; transform: translateY(0); }"
      usage: "dashboard items entrance"
    beam_spin:
      keyframes: "0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); }"
      usage: "cta button shimmer border (conic-gradient)"

  framer_motion:
    spring:
      stiffness: [280, 500]
      damping: [20, 25]
      usage: "buttons, cards, sidebar items"
    stagger:
      delay_per_item: 0.03
      max_total_delay: 0.5
      usage: "image grids, catalog cards"
    page_enter:
      initial: { opacity: 0, y: -10 }
      animate: { opacity: 1, y: 0 }
      usage: "page headers"
    card_enter:
      initial: { opacity: 0, y: 16, scale: 0.96 }
      animate: { opacity: 1, y: 0, scale: 1 }
      transition: { type: spring, stiffness: 300, damping: 25 }
    hover_lift:
      whileHover: { y: -4 }
      usage: "folder cards, catalog cards"

  special_effects:
    beam:
      description: "Rotating conic-gradient border glow around CTA buttons"
      css: |
        position: relative; overflow: hidden;
        ::before {
          content: ""; position: absolute; inset: -2px; z-index: -1;
          background: conic-gradient(from var(--beam-angle, 0deg), transparent, #0da6f2, transparent 40%);
          border-radius: inherit; animation: beam-spin 3s linear infinite;
        }
    glass:
      description: "Frosted glass effect on cards and sidebars"
      css: "backdrop-filter: blur(16px); background: var(--card);"
      mobile: "Disabled for performance"
    orbs:
      description: "Large blurred radial-gradient circles in page background"
      css: "position: fixed; width: 520px; height: 520px; border-radius: 50%; filter: blur(40px); opacity: 0.14;"
```

---

## Page Patterns

### Admin Advertising

```yaml
page: AdminAdvertising
  layout: two_panel_responsive
  description: "CRUD panel for Google Drive advertising images. Left panel = folder list, right panel = image grid."
  
  header:
    icon: 📢
    title: Publicidad
    subtitle: Administra imágenes publicitarias en Google Drive. Organiza por carpetas y controla visibilidad.
    indicators: [carpetas_count, refresh_button]

  panels:
    left:
      title: Carpetas en Drive
      create_input:
        placeholder: Nueva carpeta...
        button: "+ Crear"
      folder_list:
        item:
          css: |
            display: flex; align-items: center; gap: 10px;
            padding: 12px 18px; cursor: pointer;
            border-bottom: 1px solid var(--stroke2);
            border-left: 3px solid transparent;
          active:
            border_left_color: "#0da6f2"
            background: rgba(13, 166, 242, 0.1)
          hover: rgba(255, 255, 255, 0.03)
          icon: 📁
          name_font: { size: 13px, weight: 700 }
          count_font: { size: 11px, color: muted }
          actions:
            - rename: { icon: ✎, on_hover_only: true }
            - delete: { icon: 🗑, on_hover_only: true, color: "#ef444488" }
        rename_inline:
          input: { height: 30px, font_size: 12px }
          buttons: [OK (green), ✕ (red)]
      max_height: calc(100vh - 320px)
      empty_state: { icon: 📂, text: No hay carpetas. Crea una nueva. }

    right:
      header:
        folder_name: { size: 16px, weight: 800 }
        meta: "{count} imágenes · {total_size}"
        upload_button:
          css: |
            background: linear-gradient(135deg, #0da6f2, #6333ff);
            color: #fff; border: none; padding: 0 18px; height: 38px;
            border-radius: 10px; font-size: 13px; font-weight: 700;
            box-shadow: 0 4px 12px rgba(13, 166, 242, 0.3);
          icon: ⬆
          text: Subir imágenes
      image_grid:
        columns: repeat(auto-fill, minmax(180px, 1fr))
        gap: 12px
        item:
          css: |
            background: var(--bg0); border-radius: 12px; overflow: hidden;
            border: 1px solid var(--stroke);
          thumbnail:
            aspect_ratio: 16 / 10
            img_css: "width: 100%; height: 100%; object-fit: cover;"
            loading: lazy
          hidden_overlay:
            css: |
              position: absolute; inset: 0;
              background: rgba(0, 0, 0, 0.5);
              display: flex; align-items: center; justify-content: center;
            badge: { text: OCULTA, bg: rgba(239, 68, 68, 0.8), color: white }
          info:
            name: { size: 12px, weight: 600, ellipsis: true }
            size: { size: 10px, color: muted }
          actions:
            - toggle:
                active: { text: ● Visible, bg: rgba(16, 185, 129, 0.12), color: "#10b981" }
                hidden: { text: ○ Ocultar, bg: rgba(239, 68, 68, 0.12), color: "#ef4444" }
            - download: { icon: ⬇, bg: rgba(13, 166, 242, 0.1), color: "#0da6f2" }
            - delete: { icon: 🗑, bg: rgba(239, 68, 68, 0.08), color: "#ef4444" }
      empty_state: { icon: 📭, title: Esta carpeta está vacía, subtitle: Sube imágenes usando el botón de arriba. }
      no_selection: { icon: 🖼️, title: Selecciona una carpeta, subtitle: Elige una carpeta del panel izquierdo. }

    responsive:
      breakpoint: 980px
      behavior: stack_vertically
      left_panel_order: 2
      right_panel_order: 1
      image_columns: repeat(auto-fill, minmax(160px, 1fr))

  confirm_modal:
    trigger: delete_folder_or_image
    header: { icon: ⚠️, title: ¿Eliminar? }
    description: "Se eliminará ... de Google Drive permanentemente."
    warning: "Esta acción no se puede deshacer."
    buttons:
      cancel: { variant: ghost }
      confirm: { variant: danger, text: Eliminar }

  file_upload:
    input: { type: file, multiple: true, accept: image/*, hidden: true }
    max_files: 20
    max_size: 50MB
    allowed_types: [image/jpeg, image/png, image/webp, image/gif]
    formdata_field: images
```

### User Advertising

```yaml
page: Advertising
  layout: two_step_flow
  description: "User-facing image gallery. Step 1 = choose folder, Step 2 = browse images with lightbox preview."

  header:
    icon: 📢
    title: Publicidad
    subtitle: Explora imágenes promocionales y descárgalas con un clic.

  step_1__folder_grid:
    columns: repeat(auto-fill, minmax(200px, 1fr))
    gap: 16px
    item:
      css: |
        background: var(--card); border: 1px solid var(--stroke);
        border-radius: 16px; padding: 24px 20px; cursor: pointer; text-align: center;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
      hover: "y: -4px, boxShadow: 0 12px 40px rgba(0, 0, 0, 0.2)"
      icon: 📁
      name: { size: 16px, weight: 800, color: text }
      count: { size: 12px, color: muted, format: "{n} imagen(es)" }

  step_2__back_button:
    css: |
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--stroke); border-radius: 10px;
      padding: 8px 14px; color: var(--text);
      font-size: 13px; font-weight: 600;
    text: ← Volver
    companion: { folder_name: { size: 18px, weight: 800 } }

  step_2__image_grid:
    columns: repeat(auto-fill, minmax(220px, 1fr))
    gap: 16px
    item:
      css: |
        background: var(--card); border: 1px solid var(--stroke);
        border-radius: 16px; overflow: hidden;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
      thumbnail:
        aspect_ratio: 16 / 10
        css: "background: #111; cursor: pointer; overflow: hidden;"
        img_hover_zoom: "scale(1.05)"
        loading: lazy
      info:
        name: { size: 13px, weight: 600, ellipsis: true }
        size: { size: 11px, color: muted }
      download_button:
        css: |
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 14px; border-radius: 8px;
          background: linear-gradient(135deg, #0da6f2, #6333ff);
          color: #fff; font-size: 12px; font-weight: 700;
          box-shadow: 0 4px 12px rgba(13, 166, 242, 0.25);
        text: ⬇ Descargar

  lightbox_preview:
    overlay:
      css: |
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(8px); padding: 20px;
    dialog:
      max_width: 90vw; max_height: 90vh;
    close_button:
      position: absolute; top: -40px; right: 0;
      background: transparent; border: none; color: #fff;
      font-size: 24px; cursor: pointer;
    image:
      css: "max-width: 100%; max-height: 85vh; border-radius: 12px; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);"
    footer:
      css: "display: flex; justify-content: space-between; align-items: center; margin-top: 12px; color: #fff;"
      name: { size: 14px, weight: 600 }
      download: same as card download_button

  empty_state:
    no_folders: { icon: 📭, title: No hay publicidad disponible, subtitle: Pronto tendremos contenido promocional para ti. }
    no_images: { icon: 📭, title: No hay imágenes en esta carpeta }

  sidebar: user
```

### Catalog (referencia)

```yaml
page: Dashboard (Catalog)
  layout: catalog_grid
  card:
    component: catalog-card
    css: |
      background: var(--card); border: 1px solid var(--stroke);
      border-radius: 18px; overflow: hidden;
      box-shadow: var(--shadow);
    banner:
      height: 130px
      badge: { position: absolute, top: 12px, left: 12px }
    body:
      platform_name: { size: 13px, weight: 800, uppercase: true, letter_spacing: 0.4px }
      price: { size: 22px, weight: 900, color: accent }
    cta:
      class: catalog-card__btn
      css: |
        background: rgba(13, 166, 242, 0.08);
        border: 1px solid rgba(13, 166, 242, 0.25);
        color: #0da6f2; border-radius: 8px;
        padding: 8px 16px; font-size: 13px; font-weight: 700;
      hover: "box-shadow: 0 0 18px rgba(13, 166, 242, 0.3); background: rgba(13, 166, 242, 0.15);"

  payment_box:
    component: sb-paybox
    css: |
      background: var(--card); border: 1px solid var(--stroke);
      border-radius: 24px; padding: 20px;
      backdrop-filter: blur(16px);
```

---

## Icons

```yaml
icons:
  system: emoji
  note: "All navigation and UI icons use emojis consistently. No icon library is used except for a few inline SVGs."
  map:
    navigation:
      home: 🏠
      wallet: 💳
      orders: 🧾
      renewals: 🔄
      analytics: 📊
      expirations: ⏳
      codes: 🔐
      advertising: 📢
      support: 🛠️
      platforms: 🎯
      dashboard: 🏠
    admin:
      admin_panel: ⚙️
      stats: 📊
      sales_top: 🏆
      transactions: 💲
      topups: 💸
      history: 📜
      accounts: 🔐
      inventory: 📦
      code_requests: 🎟️
      code_logs: 🎫
      stock_alert: 🔔
      upload_logs: 📋
      categories: 📁
      platforms: 📺
      prices: 💳
      durations: ⏱️
      users: 👥
      support: 🎧
      replacements: 🔁
      advertising_admin: 📢
    actions:
      create: +
      upload: ⬆
      download: ⬇
      refresh: ⟳
      back: ←
      close: ✕
      delete: 🗑
      rename: ✎
      cart: 🛒
      theme: 🌙 or ☀️
      logout: ↩ or 🚪
      apk_download: 📱

  svg_inline:
    - search_lens: "SVG magnifying glass, stroke: currentColor"
    - cart_icon: "SVG cart with circles and path"
    - logo: "StreamingBoxLogo SVG with cyan→blue gradient and polygon play triangle"
```

---

## Responsive

```yaml
responsive:
  breakpoints:
    main: 900px
    secondary: [640, 600, 520, 480, 400, 360]

  rules:
    sidebar_mobile:
      condition: "≤ 900px"
      behavior: "Sidebar becomes fixed drawer, hidden by default, toggle with ☰ button"
      overlay: "rgba(0, 0, 0, 0.45) + blur(2px)"
      toggle_button: "Fixed position, top-left, z-index 1000"

    grid_adaptation:
      catalog: "repeat(auto-fill, minmax(220px→160px→1fr))"
      kpi: "repeat(auto-fit, minmax(220px, 1fr))"
      admin_cards: "4 cols → 3 cols (1100px) → 2 cols (768px) → 1 col (480px)"
      advertising_images: "repeat(auto-fill, minmax(180px→160px, 1fr))"

    glass_disable:
      condition: "≤ 900px"
      rule: "backdrop-filter: none; -webkit-backdrop-filter: none;"

    two_panel_stack:
      condition: "≤ 980px"
      behavior: "Switch to vertical stack, left panel moves below right panel"
```

---

## File Map

```yaml
files:
  styles:
    global_css: frontend/src/styles/auth.css
    special_effects: frontend/src/styles/special-effects.css
  components:
    admin_sidebar: frontend/src/components/admin/AdminSidebar.jsx
    user_sidebar: frontend/src/components/dashboard/Sidebar.jsx
    theme_toggle: frontend/src/components/ThemeToggle.jsx
    logo: frontend/src/components/StreamingBoxLogo.jsx
    balanced_text: frontend/src/components/text/BalancedText.jsx
    notifications: frontend/src/components/dashboard/UserNotifications.jsx
  pages:
    admin_advertising: frontend/src/pages/AdminAdvertising.jsx
    user_advertising: frontend/src/pages/Advertising.jsx
    catalog: frontend/src/pages/Dashboard.jsx
```

---

## Conventions

```yaml
conventions:
  styling: CSS-in-JS
  description: "All component styles are defined as JavaScript objects using CSS variables. No separate .css files per component."
  
  theme: data-attribute
  description: "Theme toggled via html[data-theme='dark|light']. Stored in localStorage as 'sb-theme'."
  
  animation_library: framer-motion
  description: "Used for page transitions, hover effects, grid staggering, and AnimatePresence for modals/toasts."
  
  code_splitting: React.lazy
  description: "Non-critical pages use lazy(() => import(...)) wrapped in Suspense."
  
  color_variables: mandatory
  description: "Always use var(--token) for colors. Hardcoded colors allowed only for gradients and accents that don't change with theme."
  
  glass_effect: conditional
  description: "Use backdrop-filter: blur(16px) on desktop. Disable on mobile."
  
  icons: emoji
  description: "Use emojis for all UI icons. Avoid icon libraries. Only use SVG for the logo and search/cart icons."
  
  errors: toast
  description: "Errors shown as animated red toast at top of content area. Auto-dismiss or click to dismiss."
  
  confirmations: modal
  description: "Destructive actions require a centered modal with ⚠️ icon, description, and Cancel+Confirm buttons."
```

---

## Brand DNA

```yaml
brand:
  name: Streaming Box
  personality: [modern, premium, dark, tech-forward]
  visual_keywords: [glass, glow, gradients, depth, navy, cyan, violet]
  design_system: stitch
  note: "The 'stitch' design system combines glass morphism with colored glow accents, giving a premium streaming-tech aesthetic."
  
  signature_elements:
    - "Frosted glass cards with subtle white gradient overlay (::before pseudo)"
    - "Cyan (#0da6f2) to violet (#6333ff) gradient as primary CTA color"
    - "Rotating conic-gradient beam effect on featured buttons"
    - "Large blurred orbs in page background for atmosphere"
    - "Emoji icons throughout the interface for playful contrast against the premium aesthetic"
    - "Animated active indicators (layoutId dots in sidebar, shimmer on cards)"
```
