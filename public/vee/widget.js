const sheet = new CSSStyleSheet();
sheet.replaceSync(`
  :host {
    --_accent: var(--khala-accent, #0B0B0B);
    --_yellow: var(--khala-yellow, #FFD60A);
    --_paper: var(--khala-paper, #F1F1EF);
    --_bg: var(--khala-bg, #FFFFFF);
    --_fg: var(--khala-fg, #0B0B0B);
    --_muted: var(--khala-muted, #5E5E59);
    --_border: var(--khala-border, rgba(0, 0, 0, 0.12));
    --_danger: #B91C1C;
    --_danger-bg: #FEF2F2;
    --_danger-border: rgba(185, 28, 28, 0.25);
    --_ease: cubic-bezier(0.22, 1, 0.36, 1);
    --_vv-height: 100dvh;
    --_kb-offset: 0px;
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 2147483000;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    pointer-events: none;
    font-family: var(--font-body, 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    font-size: 14px;
    line-height: 1.5;
    color: var(--_fg);
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  button, input, textarea {
    font: inherit;
    color: inherit;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(11, 11, 11, 0.32);
    opacity: 0;
    pointer-events: none;
    touch-action: none;
    transition: opacity 0.28s var(--_ease);
    display: none;
  }

  .launcher {
    position: relative;
    pointer-events: auto;
    width: 56px;
    height: 66px;
    padding: 0;
    border: 0;
    border-radius: 18px;
    background: transparent;
    display: inline-flex;
    align-items: flex-end;
    justify-content: center;
    cursor: pointer;
    font-size: 4px;
    transition: transform 0.26s var(--_ease), opacity 0.22s ease;
  }

  @media (hover: hover) {
    .launcher:hover {
      transform: translateY(-3px);
    }
  }

  .launcher:active {
    transform: scale(0.94);
  }

  /* ---- Vee: black oval body, dark screen face, two white eyes, two small arms ---- */
  .vee {
    position: relative;
    display: block;
    width: 11em;
    height: 14em;
    flex-shrink: 0;
    transform-origin: 50% 100%;
  }

  .vee-body {
    position: absolute;
    inset: 0;
    background: #0B0B0B;
    border-radius: 50%;
  }

  .launcher .vee-body {
    box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.4), 0 6px 18px rgba(0, 0, 0, 0.32);
  }

  .vee-arm {
    position: absolute;
    top: 7.2em;
    width: 1.8em;
    height: 4.6em;
    background: #0B0B0B;
    border-radius: 0.9em;
    transform-origin: 50% 0.8em;
  }

  .vee-arm-l { left: -1.1em; }
  .vee-arm-r { right: -1.1em; }

  .vee-screen {
    position: absolute;
    left: 1.4em;
    top: 3em;
    width: 8.2em;
    height: 5em;
    background: #2B2B29;
    border-radius: 2.4em;
    overflow: hidden;
  }

  .vee-eyes {
    position: absolute;
    left: 2em;
    top: 1.5em;
    display: flex;
    gap: 1.4em;
    transition: transform 0.25s var(--_ease), opacity 0.2s ease;
  }

  .vee-eyes span {
    display: block;
    width: 1.4em;
    height: 2em;
    background: #FFFFFF;
    border-radius: 0.5em;
    transition: height 0.4s var(--_ease), transform 0.4s var(--_ease);
  }

  .vee-happy {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  /* Eye states */
  .vee.g-hello .vee-eyes,
  .vee.g-done .vee-eyes,
  .launcher:hover .vee:not(.is-resting) .vee-eyes { opacity: 0; }
  .vee.g-hello .vee-happy,
  .vee.g-done .vee-happy,
  .launcher:hover .vee:not(.is-resting) .vee-happy { opacity: 1; }
  .vee.g-think .vee-eyes { transform: translate(-0.4em, -0.6em); }
  .vee.g-point .vee-eyes { transform: translate(0.8em, -0.3em); }
  .vee.is-resting .vee-eyes span { height: 0.5em; transform: translateY(0.8em); }

  /* Gestures: each plays once, then Vee goes still */
  @keyframes vee-wave {
    0%, 100% { transform: rotate(0deg); }
    18% { transform: rotate(-150deg); }
    34% { transform: rotate(-118deg); }
    50% { transform: rotate(-158deg); }
    66% { transform: rotate(-118deg); }
    82% { transform: rotate(-150deg); }
  }
  @keyframes vee-point-arm {
    0%, 100% { transform: rotate(0deg); }
    20%, 80% { transform: rotate(-125deg); }
  }
  @keyframes vee-lean {
    0%, 100% { transform: rotate(0deg); }
    20%, 80% { transform: rotate(7deg); }
  }
  @keyframes vee-tilt {
    0%, 100% { transform: rotate(-4deg); }
    50% { transform: rotate(3deg); }
  }
  @keyframes vee-hop {
    0%, 50%, 100% { transform: translateY(0); }
    20% { transform: translateY(-1.6em); }
    35% { transform: translateY(0); }
    42% { transform: translateY(-0.6em); }
  }
  @keyframes vee-raise {
    0%, 100% { transform: rotate(0deg); }
    15%, 80% { transform: rotate(-165deg); }
  }
  @keyframes vee-shrug-l {
    0%, 100% { transform: rotate(0deg); }
    25%, 75% { transform: rotate(70deg); }
  }
  @keyframes vee-shrug-r {
    0%, 100% { transform: rotate(0deg); }
    25%, 75% { transform: rotate(-70deg); }
  }
  @keyframes vee-settle {
    to { transform: translateY(0.4em) scale(1.03, 0.96); }
  }

  .vee.g-hello .vee-arm-r { animation: vee-wave 1.5s ease-in-out 1; }
  .vee.g-point { animation: vee-lean 2.2s var(--_ease) 1; }
  .vee.g-point .vee-arm-r { animation: vee-point-arm 2.2s var(--_ease) 1; }
  .vee.g-think { animation: vee-tilt 2.6s ease-in-out 8; }
  .vee.g-think .vee-arm-l { transform: rotate(150deg) translate(-0.6em, -0.4em); transition: transform 0.3s var(--_ease); }
  .vee.g-done { animation: vee-hop 1.4s ease-in-out 1; }
  .vee.g-done .vee-arm-r { animation: vee-raise 1.4s var(--_ease) 1; }
  .vee.g-shrug .vee-arm-l { animation: vee-shrug-l 1.8s ease-in-out 1; }
  .vee.g-shrug .vee-arm-r { animation: vee-shrug-r 1.8s ease-in-out 1; }
  .vee.is-resting { animation: vee-settle 1.6s ease-out 1 forwards; }

  @keyframes vee-point-up {
    0%, 100% { transform: rotate(0deg); }
    20%, 80% { transform: rotate(-158deg); }
  }
  @keyframes vee-lean-up {
    0%, 100% { transform: rotate(0deg); }
    20%, 80% { transform: rotate(-5deg); }
  }
  .guide-vee .vee.g-point { animation-name: vee-lean-up; }
  .guide-vee .vee.g-point .vee-arm-r { animation-name: vee-point-up; }
  .guide-vee .vee.g-point .vee-eyes { transform: translate(0.6em, -0.6em); }

  /* Guide mode: a second Vee that glides to a link on the page and points at it */
  .guide-vee {
    position: fixed;
    left: 0;
    top: 0;
    font-size: 4px;
    pointer-events: none;
    visibility: hidden;
    will-change: transform;
  }

  .guide-vee.is-active {
    visibility: visible;
  }

  .guide-flip {
    display: block;
  }

  .guide-vee.is-flipped .guide-flip {
    transform: scaleX(-1);
  }

  .guide-vee .vee-body {
    box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.4), 0 6px 18px rgba(0, 0, 0, 0.32);
  }

  .launcher .vee {
    transition: opacity 0.2s ease;
  }

  .launcher.is-away .vee {
    opacity: 0;
  }


  /* ---- More gestures: read a book, heart eyes, wave goodbye, nod ---- */
  .vee-book {
    position: absolute;
    left: 2.2em;
    top: 8.6em;
    width: 6.6em;
    height: 4em;
    border: 0.3em solid #0B0B0B;
    border-radius: 0.4em;
    background: linear-gradient(90deg, #FFD60A 47%, #0B0B0B 47% 53%, #FFD60A 53%);
    opacity: 0;
    transform: translateY(1.2em) scale(0.7);
    transition: opacity 0.25s ease, transform 0.35s var(--_ease);
  }

  .vee-hearts {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .vee.g-read .vee-book { opacity: 1; transform: none; }
  .vee.g-read .vee-eyes { transform: translate(0, 0.9em); }
  .vee.g-read .vee-arm-l { transform: rotate(-38deg); transition: transform 0.3s var(--_ease); }
  .vee.g-read .vee-arm-r { transform: rotate(38deg); transition: transform 0.3s var(--_ease); }

  .vee.g-love .vee-eyes { opacity: 0; }
  .vee.g-love .vee-hearts { opacity: 1; }
  .vee.g-love { animation: vee-hop 1.4s ease-in-out 1; }

  .vee.g-bye .vee-eyes { opacity: 0; }
  .vee.g-bye .vee-happy { opacity: 1; }
  .vee.g-bye .vee-arm-r { animation: vee-wave 1.5s ease-in-out 1; }

  @keyframes vee-nod {
    0%, 100% { transform: translateY(0); }
    25%, 65% { transform: translateY(0.7em); }
    45% { transform: translateY(0); }
  }
  .vee.g-nod .vee-screen { animation: vee-nod 0.9s ease-in-out 1; }

  /* ---- Tour guide ---- */
  .tour-ring {
    position: fixed;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    border: 3px solid var(--_yellow);
    outline: 1px solid #0B0B0B;
    box-shadow: 0 0 0 100vmax rgba(11, 11, 11, 0.28);
    pointer-events: none;
    display: none;
    transition: transform 0.45s var(--_ease), width 0.45s var(--_ease), height 0.45s var(--_ease);
  }

  .tour-ring.is-on { display: block; }

  .tour-bubble {
    position: fixed;
    left: 0;
    top: 0;
    width: 300px;
    max-width: calc(100vw - 24px);
    background: #FFFFFF;
    color: #0B0B0B;
    border: 1px solid #0B0B0B;
    box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.35);
    padding: 14px 14px 12px;
    display: none;
    flex-direction: column;
    gap: 10px;
    pointer-events: auto;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .tour-bubble.is-on { display: flex; }
  .tour-bubble.is-shown { opacity: 1; }

  .tour-step {
    font-size: 10.5px;
    letter-spacing: 0.08em;
    font-weight: 600;
    color: var(--_muted);
  }

  .tour-text {
    font-size: 14.5px;
    line-height: 1.5;
    margin: 0;
  }

  .tour-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .tour-btn {
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid #0B0B0B;
    background: #FFFFFF;
    color: #0B0B0B;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 0;
  }

  .tour-btn.is-main {
    background: var(--_yellow);
    margin-left: auto;
  }

  .tour-btn.is-quiet {
    border-color: transparent;
    font-weight: 500;
    text-decoration: underline;
    padding: 0 6px;
  }

  .tour-btn:focus-visible {
    outline: 2px solid #0B0B0B;
    outline-offset: 2px;
  }

  .tour-offer {
    position: fixed;
    right: 24px;
    bottom: 102px;
    width: 250px;
    background: #FFFFFF;
    color: #0B0B0B;
    border: 1px solid #0B0B0B;
    box-shadow: 0 12px 30px -12px rgba(0, 0, 0, 0.35);
    padding: 12px;
    display: none;
    flex-direction: column;
    gap: 10px;
    pointer-events: auto;
  }

  .tour-offer.is-on { display: flex; }

  :host([data-open="true"]) .tour-offer { display: none; }

  @media (max-width: 639px) {
    .tour-offer {
      right: max(14px, env(safe-area-inset-right));
      bottom: calc(max(14px, env(safe-area-inset-bottom)) + 72px);
      width: min(250px, calc(100vw - 28px));
    }
    .tour-bubble {
      left: 12px !important;
      right: 12px;
      top: auto !important;
      bottom: max(12px, env(safe-area-inset-bottom));
      width: auto;
      transform: none !important;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tour-ring, .tour-bubble, .vee-book, .vee-hearts { transition: none; }
  }

  .launcher:focus-visible,
  .icon-btn:focus-visible,
  .chip:focus-visible,
  .send-btn:focus-visible,
  .scroll-bottom-btn:focus-visible,
  .retry-btn:focus-visible,
  .input:focus-visible {
    outline: 2px solid #0B0B0B;
    outline-offset: 2px;
  }

  .icon-btn:focus-visible {
    outline-color: var(--_yellow);
  }

  .panel {
    position: relative;
    width: min(380px, calc(100vw - 32px));
    height: min(540px, calc(100dvh - 104px));
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    background: var(--_paper);
    border: 1px solid #0B0B0B;
    border-radius: 24px;
    overflow: hidden;
    overscroll-behavior: contain;
    visibility: hidden;
    opacity: 0;
    transform: translateY(14px) scale(0.95);
    transform-origin: bottom right;
    pointer-events: none;
    box-shadow: none;
    transition: opacity 0.28s var(--_ease), transform 0.28s var(--_ease), visibility 0.28s;
  }

  .panel.is-open {
    visibility: visible;
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
    box-shadow: 0 24px 52px -12px rgba(0, 0, 0, 0.28);
  }

  .header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 16px;
    background: #0B0B0B;
    color: #FFFFFF;
    border-bottom: 1px solid #0B0B0B;
  }

  .header-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--_yellow);
    display: inline-flex;
    align-items: flex-end;
    justify-content: center;
    flex-shrink: 0;
    font-size: 2.1px;
    padding-bottom: 3px;
  }

  .header-info {
    min-width: 0;
  }

  .agent-name {
    font-family: var(--font-sub, 'Space Grotesk', system-ui, sans-serif);
    font-weight: 600;
    font-size: 14.5px;
    letter-spacing: -0.02em;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Name only in the header; the status line still appears when offline */
  :host([hide-tagline]:not([data-offline])) .tagline {
    display: none;
  }

  .tagline {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    font-family: var(--font-sub, 'Space Grotesk', system-ui, sans-serif);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.74);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--_yellow);
    flex-shrink: 0;
    transition: background-color 0.2s ease;
  }

  :host([data-offline="true"]) .dot {
    background: #9CA3AF;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .icon-btn {
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: transparent;
    color: #FFFFFF;
    width: 36px;
    height: 36px;
    min-width: 36px;
    min-height: 36px;
    border-radius: 50%;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.2s var(--_ease);
  }

  @media (hover: hover) {
    .icon-btn:hover {
      background: var(--_yellow);
      color: #0B0B0B;
      border-color: var(--_yellow);
      transform: scale(1.06);
    }
  }

  .icon-btn:active {
    transform: scale(0.93);
  }

  .messages-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .messages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background:
      radial-gradient(rgba(0, 0, 0, 0.11) 1px, transparent 1.2px) 0 0 / 22px 22px,
      var(--_paper);
  }

  .scroll-bottom-btn {
    position: absolute;
    right: 12px;
    bottom: 10px;
    z-index: 2;
    border: 1px solid #0B0B0B;
    border-radius: 999px;
    background: var(--_bg);
    color: #0B0B0B;
    padding: 6px 12px;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16);
    opacity: 0;
    transform: translateY(8px);
    pointer-events: none;
    transition: opacity 0.2s ease, transform 0.22s var(--_ease), background-color 0.2s ease;
  }

  .scroll-bottom-btn.is-visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .scroll-bottom-btn:hover {
    background: var(--_yellow);
  }

  @keyframes khala-msg-in {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes khala-line-in {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes khala-wave {
    0%, 60%, 100% {
      opacity: 0.35;
      transform: translateY(0);
    }
    30% {
      opacity: 1;
      transform: translateY(-4px);
    }
  }

  .msg-row {
    display: flex;
    flex-direction: column;
    max-width: 100%;
    animation: khala-msg-in 0.28s var(--_ease) both;
  }

  .msg-row.user {
    align-items: flex-end;
  }

  .msg-row.bot {
    align-items: flex-start;
  }

  .msg {
    max-width: 85%;
    padding: 11px 14px;
    border-radius: 18px;
    font-size: 13.5px;
    line-height: 1.52;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .msg.bot {
    background: var(--_bg);
    color: var(--_fg);
    border: 1px solid var(--_border);
    border-bottom-left-radius: 4px;
  }

  .msg.user {
    background: #0B0B0B;
    color: #FFFFFF;
    border: 1px solid #0B0B0B;
    border-bottom-right-radius: 4px;
  }

  .msg.bot.is-error {
    background: var(--_danger-bg);
    border-color: var(--_danger-border);
    color: #7F1D1D;
  }

  .msg-meta {
    font-size: 10px;
    line-height: 1.2;
    color: var(--_muted);
    margin-top: 3px;
    padding: 0 4px;
    user-select: none;
  }

  .retry-btn {
    margin-top: 8px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid #0B0B0B;
    border-radius: 999px;
    background: #FFFFFF;
    color: #0B0B0B;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.18s ease, transform 0.18s var(--_ease);
  }

  .retry-btn:hover {
    background: var(--_yellow);
  }

  .retry-btn:active {
    transform: scale(0.96);
  }

  .msg.bot.is-revealing p,
  .msg.bot.is-revealing li,
  .msg.bot.is-revealing h3,
  .msg.bot.is-revealing h4 {
    animation: khala-line-in 0.26s var(--_ease) both;
    animation-delay: calc(var(--line-idx, 0) * 40ms);
  }

  .msg p {
    margin: 0 0 8px;
  }

  .msg p:last-child {
    margin-bottom: 0;
  }

  .msg h3,
  .msg h4 {
    margin: 2px 0 6px;
    font-family: var(--font-sub, 'Space Grotesk', system-ui, sans-serif);
    font-size: 13.5px;
    font-weight: 700;
    line-height: 1.35;
  }

  .msg ul,
  .msg ol {
    margin: 6px 0;
    padding-left: 18px;
  }

  .msg ul:last-child,
  .msg ol:last-child {
    margin-bottom: 0;
  }

  .msg li + li {
    margin-top: 4px;
  }

  .msg code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.9em;
    background: rgba(0, 0, 0, 0.06);
    padding: 1px 5px;
    border-radius: 6px;
  }

  .msg a {
    color: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    border-radius: 4px;
    padding: 0 2px;
  }

  .msg.bot a:hover {
    background: var(--_yellow);
    color: #0B0B0B;
    text-decoration: none;
  }

  .msg.typing {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--_muted);
    font-size: 12.5px;
    border-radius: 999px;
    padding: 9px 15px;
  }

  .typing-dots {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .typing-dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #0B0B0B;
    display: inline-block;
    animation: khala-wave 1.15s ease-in-out infinite;
  }

  .typing-dots span:nth-child(2) {
    animation-delay: 0.16s;
  }

  .typing-dots span:nth-child(3) {
    animation-delay: 0.32s;
  }

  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 2px;
    animation: khala-msg-in 0.3s var(--_ease) 0.08s both;
  }

  .chip {
    border: 1px solid rgba(0, 0, 0, 0.18);
    background: var(--_bg);
    color: var(--_fg);
    border-radius: 999px;
    padding: 7px 13px;
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    line-height: 1.35;
    transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.22s var(--_ease);
  }

  @media (hover: hover) {
    .chip:hover {
      background: var(--_yellow);
      border-color: #0B0B0B;
      color: #0B0B0B;
      transform: translateY(-1px);
    }
  }

  .chip:active {
    background: var(--_yellow);
    border-color: #0B0B0B;
    transform: scale(0.97);
  }

  .composer {
    flex-shrink: 0;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 10px 12px 12px;
    border-top: 1px solid var(--_border);
    background: var(--_bg);
  }

  .input {
    flex: 1;
    min-width: 0;
    height: 40px;
    min-height: 40px;
    max-height: 104px;
    resize: none;
    overflow-y: hidden;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 20px;
    padding: 9px 14px;
    line-height: 20px;
    background: var(--_paper);
    color: var(--_fg);
    transition: background-color 0.2s ease, border-color 0.2s ease;
  }

  .input::placeholder {
    color: var(--_muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .input:focus {
    background: var(--_bg);
    border-color: #0B0B0B;
    outline: none;
  }

  .send-btn {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 1px solid #0B0B0B;
    border-radius: 50%;
    background: #0B0B0B;
    color: #FFFFFF;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease, opacity 0.2s ease, transform 0.22s var(--_ease);
  }

  @media (hover: hover) {
    .send-btn:hover:not(:disabled) {
      background: var(--_yellow);
      color: #0B0B0B;
    }
  }

  .send-btn:active:not(:disabled) {
    transform: scale(0.94);
  }

  .send-btn:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }

  /* Tablet */
  @media (min-width: 640px) and (max-width: 768px) {
    :host {
      right: 18px;
      bottom: 18px;
    }
    .panel {
      width: 368px;
      height: min(520px, calc(100dvh - 96px));
      border-radius: 22px;
      margin-bottom: 12px;
    }
  }

  @media (pointer: coarse) {
    .input {
      font-size: 16px;
    }
  }

  /* Dedicated mobile layout (360px - 430px and <= 639px) */
  @media (max-width: 639px) {
    :host {
      right: max(14px, env(safe-area-inset-right));
      bottom: max(14px, env(safe-area-inset-bottom));
    }
    :host([data-open="true"]) {
      right: max(10px, env(safe-area-inset-right));
      bottom: max(10px, env(safe-area-inset-bottom));
    }
    .backdrop {
      display: block;
    }
    :host([data-open="true"]) .backdrop {
      opacity: 1;
      pointer-events: auto;
    }
    .launcher {
      width: 52px;
      height: 62px;
      font-size: 3.7px;
    }
    :host([data-open="true"]) .launcher {
      position: absolute;
      right: 0;
      bottom: 0;
      opacity: 0;
      pointer-events: none;
      transform: scale(0.8);
    }
    .panel {
      width: calc(100vw - 20px);
      max-width: 420px;
      height: min(520px, calc(var(--_vv-height, 100dvh) - 24px));
      max-height: calc(var(--_vv-height, 100dvh) - 20px);
      margin-bottom: var(--_kb-offset, 0px);
      border-radius: 22px;
      transform: translateY(20px) scale(0.97);
      transform-origin: bottom center;
    }
    .header {
      padding: 11px 14px;
    }
    .messages {
      padding: 12px;
      gap: 9px;
    }
    .msg {
      max-width: 86%;
      padding: 10px 13px;
      font-size: 14px;
    }
    .chip {
      padding: 8px 13px;
      font-size: 12.5px;
    }
    .composer {
      padding: 9px 10px 11px;
      gap: 8px;
    }
    .input {
      font-size: 16px;
      height: 42px;
      min-height: 42px;
      line-height: 22px;
      padding: 9px 14px;
      border-radius: 21px;
    }
    .send-btn {
      width: 42px;
      height: 42px;
    }
  }

  /* Compact small phones (320px - 359px) */
  @media (max-width: 359px) {
    :host {
      right: max(10px, env(safe-area-inset-right));
      bottom: max(10px, env(safe-area-inset-bottom));
    }
    :host([data-open="true"]) {
      right: max(6px, env(safe-area-inset-right));
      bottom: max(8px, env(safe-area-inset-bottom));
    }
    .panel {
      width: calc(100vw - 12px);
      height: calc(var(--_vv-height, 100dvh) - 16px);
      max-height: calc(var(--_vv-height, 100dvh) - 16px);
      border-radius: 18px;
    }
    .header {
      padding: 10px 12px;
    }
    .avatar {
      width: 32px;
      height: 32px;
      font-size: 1.9px;
    }
    .agent-name {
      font-size: 13.5px;
    }
    .messages {
      padding: 10px;
    }
    .msg {
      max-width: 90%;
      padding: 9px 12px;
      font-size: 13.5px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .backdrop,
    .panel,
    .launcher,
    .vee-eyes,
    .vee-eyes span,
    .vee-happy,
    .icon-btn,
    .chip,
    .input,
    .send-btn,
    .scroll-bottom-btn,
    .retry-btn {
      transition: none;
    }
    .msg-row,
    .msg.bot.is-revealing p,
    .msg.bot.is-revealing li,
    .msg.bot.is-revealing h3,
    .msg.bot.is-revealing h4,
    .suggestions,
    .typing-dots span,
    .vee,
    .vee * {
      animation: none !important;
    }
  }
`);

const template = document.createElement('template');
template.innerHTML = `
  <div class="backdrop" data-el="backdrop" aria-hidden="true"></div>
  <section class="panel" role="dialog" aria-label="AI Support Chat" aria-hidden="true">
    <header class="header">
      <div class="header-brand">
        <div class="avatar" aria-hidden="true">
          <span class="vee" data-el="vee-avatar" aria-hidden="true">
      <span class="vee-arm vee-arm-l"></span>
      <span class="vee-arm vee-arm-r"></span>
      <span class="vee-body"></span>
      <span class="vee-book"></span>
      <span class="vee-screen">
        <span class="vee-eyes"><span></span><span></span></span>
        <svg class="vee-happy" viewBox="0 0 82 50" aria-hidden="true"><path d="M20 30 Q27 18 34 30" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/><path d="M48 30 Q55 18 62 30" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/></svg>
        <svg class="vee-hearts" viewBox="0 0 82 50" aria-hidden="true"><path d="M27 33 C20 28 17 24 20 20 C22 17.5 25.5 18 27 21 C28.5 18 32 17.5 34 20 C37 24 34 28 27 33Z" fill="#FFD60A"/><path d="M55 33 C48 28 45 24 48 20 C50 17.5 53.5 18 55 21 C56.5 18 60 17.5 62 20 C65 24 62 28 55 33Z" fill="#FFD60A"/></svg>
      </span>
    </span>
        </div>
        <div class="header-info">
          <div class="agent-name" data-el="agent-name">Support AI</div>
          <div class="tagline"><span class="dot" aria-hidden="true"></span><span data-el="tagline">Online</span></div>
        </div>
      </div>
      <div class="header-actions">
        <button type="button" class="icon-btn" data-el="reset" title="New conversation" aria-label="New conversation">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
        <button type="button" class="icon-btn" data-el="close" title="Close chat" aria-label="Close chat">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </header>
    <div class="messages-wrap">
      <div class="messages" data-el="messages" aria-live="polite"></div>
      <button type="button" class="scroll-bottom-btn" data-el="scroll-bottom" aria-label="Jump to latest message">&darr; Latest</button>
    </div>
    <form class="composer" data-el="form">
      <textarea class="input" data-el="input" rows="1" placeholder="Type your question..." maxlength="2000" aria-label="Type your message"></textarea>
      <button type="submit" class="send-btn" data-el="send" aria-label="Send message" title="Send message" disabled>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m5 12 7-7 7 7" />
          <path d="M12 19V5" />
        </svg>
      </button>
    </form>
  </section>
<div class="tour-ring" data-el="tour-ring" aria-hidden="true"></div>
  <div class="tour-bubble" data-el="tour-bubble" role="dialog" aria-label="Site tour" aria-modal="false">
    <div class="tour-step" data-el="tour-step"></div>
    <p class="tour-text" data-el="tour-text" aria-live="polite"></p>
    <div class="tour-actions">
      <button type="button" class="tour-btn is-quiet" data-el="tour-skip">Skip tour</button>
      <button type="button" class="tour-btn" data-el="tour-back">Back</button>
      <button type="button" class="tour-btn is-main" data-el="tour-next">Next</button>
    </div>
  </div>
  <div class="tour-offer" data-el="tour-offer" role="dialog" aria-label="Tour offer">
    <p class="tour-text" data-el="tour-offer-text">New here? I can show you around in under a minute.</p>
    <div class="tour-actions">
      <button type="button" class="tour-btn is-quiet" data-el="tour-offer-no">No thanks</button>
      <button type="button" class="tour-btn is-main" data-el="tour-offer-yes">Show me</button>
    </div>
  </div>
  <span class="guide-vee" data-el="guide" aria-hidden="true"><span class="guide-flip"><span class="vee" data-el="vee-guide">
      <span class="vee-arm vee-arm-l"></span>
      <span class="vee-arm vee-arm-r"></span>
      <span class="vee-body"></span>
      <span class="vee-book"></span>
      <span class="vee-screen">
        <span class="vee-eyes"><span></span><span></span></span>
        <svg class="vee-happy" viewBox="0 0 82 50" aria-hidden="true"><path d="M20 30 Q27 18 34 30" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/><path d="M48 30 Q55 18 62 30" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/></svg>
        <svg class="vee-hearts" viewBox="0 0 82 50" aria-hidden="true"><path d="M27 33 C20 28 17 24 20 20 C22 17.5 25.5 18 27 21 C28.5 18 32 17.5 34 20 C37 24 34 28 27 33Z" fill="#FFD60A"/><path d="M55 33 C48 28 45 24 48 20 C50 17.5 53.5 18 55 21 C56.5 18 60 17.5 62 20 C65 24 62 28 55 33Z" fill="#FFD60A"/></svg>
      </span>
    </span></span></span>
  <button type="button" class="launcher" data-el="launcher" aria-expanded="false" aria-label="Chat with AI Support" title="Chat with AI Support">
    <span class="vee" data-el="vee-launcher" aria-hidden="true">
      <span class="vee-arm vee-arm-l"></span>
      <span class="vee-arm vee-arm-r"></span>
      <span class="vee-body"></span>
      <span class="vee-book"></span>
      <span class="vee-screen">
        <span class="vee-eyes"><span></span><span></span></span>
        <svg class="vee-happy" viewBox="0 0 82 50" aria-hidden="true"><path d="M20 30 Q27 18 34 30" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/><path d="M48 30 Q55 18 62 30" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/></svg>
        <svg class="vee-hearts" viewBox="0 0 82 50" aria-hidden="true"><path d="M27 33 C20 28 17 24 20 20 C22 17.5 25.5 18 27 21 C28.5 18 32 17.5 34 20 C37 24 34 28 27 33Z" fill="#FFD60A"/><path d="M55 33 C48 28 45 24 48 20 C50 17.5 53.5 18 55 21 C56.5 18 60 17.5 62 20 C65 24 62 28 55 33Z" fill="#FFD60A"/></svg>
      </span>
    </span>
  </button>
`;

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit'
});

function formatTimestamp(date = new Date()) {
  try {
    return timeFormatter.format(date);
  } catch {
    return '';
  }
}

/**
 * Append plain text with inline markdown links, bare URLs, **bold**, *italic*, and `code` safely.
 */
function appendInlineFormatted(parent, text) {
  const tokenRe = /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`|https?:\/\/[^\s)]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.append(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    const token = match[0];
    if (token.startsWith('[')) {
      const mdLink = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (mdLink) {
        const link = document.createElement('a');
        link.href = mdLink[2];
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = mdLink[1];
        parent.append(link);
      } else {
        parent.append(document.createTextNode(token));
      }
    } else if (token.startsWith('**') && token.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = token.slice(2, -2);
      parent.append(strong);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      const em = document.createElement('em');
      em.textContent = token.slice(1, -1);
      parent.append(em);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      const code = document.createElement('code');
      code.textContent = token.slice(1, -1);
      parent.append(code);
    } else {
      let url = token;
      let trailing = '';
      while (/[.,!?;:]$/.test(url)) {
        trailing = url.slice(-1) + trailing;
        url = url.slice(0, -1);
      }
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = url;
      parent.append(link);
      if (trailing) parent.append(document.createTextNode(trailing));
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parent.append(document.createTextNode(text.slice(lastIndex)));
  }
}

/**
 * Safely render headings, paragraphs, bullet/numbered lists, bold/italic/code, and links without innerHTML.
 */
function renderFormattedText(container, text) {
  container.replaceChildren();
  const lines = String(text || '').split(/\r?\n/);
  let currentList = null;
  let listTag = null;
  let paragraphLines = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const p = document.createElement('p');
    paragraphLines.forEach((line, idx) => {
      if (idx > 0) p.append(document.createElement('br'));
      appendInlineFormatted(p, line);
    });
    container.append(p);
    paragraphLines = [];
  };

  const flushList = () => {
    if (!currentList) return;
    container.append(currentList);
    currentList = null;
    listTag = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
    const bulletMatch = line.match(/^(?:[-*•])\s+(.+)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);

    if (headingMatch) {
      flushParagraph();
      flushList();
      const h = document.createElement('h3');
      appendInlineFormatted(h, headingMatch[1]);
      container.append(h);
    } else if (bulletMatch || orderedMatch) {
      flushParagraph();
      const targetTag = orderedMatch ? 'ol' : 'ul';
      if (!currentList || listTag !== targetTag) {
        flushList();
        currentList = document.createElement(targetTag);
        listTag = targetTag;
      }
      const li = document.createElement('li');
      appendInlineFormatted(li, (orderedMatch || bulletMatch)[1]);
      currentList.append(li);
    } else {
      flushList();
      paragraphLines.push(line);
    }
  }

  flushParagraph();
  flushList();
}

class KhalaSupportWidget extends HTMLElement {
  static get observedAttributes() {
    return ['client', 'api-base'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open', delegatesFocus: true });
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.append(template.content.cloneNode(true));

    this._els = {
      backdrop: this.shadowRoot.querySelector('[data-el="backdrop"]'),
      panel: this.shadowRoot.querySelector('.panel'),
      launcher: this.shadowRoot.querySelector('[data-el="launcher"]'),
      close: this.shadowRoot.querySelector('[data-el="close"]'),
      reset: this.shadowRoot.querySelector('[data-el="reset"]'),
      agentName: this.shadowRoot.querySelector('[data-el="agent-name"]'),
      tagline: this.shadowRoot.querySelector('[data-el="tagline"]'),
      messages: this.shadowRoot.querySelector('[data-el="messages"]'),
      scrollBottom: this.shadowRoot.querySelector('[data-el="scroll-bottom"]'),
      form: this.shadowRoot.querySelector('[data-el="form"]'),
      input: this.shadowRoot.querySelector('[data-el="input"]'),
      send: this.shadowRoot.querySelector('[data-el="send"]'),
      veeLauncher: this.shadowRoot.querySelector('[data-el="vee-launcher"]'),
      veeAvatar: this.shadowRoot.querySelector('[data-el="vee-avatar"]'),
      guide: this.shadowRoot.querySelector('[data-el="guide"]'),
      tourRing: this.shadowRoot.querySelector('[data-el="tour-ring"]'),
      tourBubble: this.shadowRoot.querySelector('[data-el="tour-bubble"]'),
      tourStep: this.shadowRoot.querySelector('[data-el="tour-step"]'),
      tourText: this.shadowRoot.querySelector('[data-el="tour-text"]'),
      tourSkip: this.shadowRoot.querySelector('[data-el="tour-skip"]'),
      tourBack: this.shadowRoot.querySelector('[data-el="tour-back"]'),
      tourNext: this.shadowRoot.querySelector('[data-el="tour-next"]'),
      tourOffer: this.shadowRoot.querySelector('[data-el="tour-offer"]'),
      tourOfferYes: this.shadowRoot.querySelector('[data-el="tour-offer-yes"]'),
      tourOfferNo: this.shadowRoot.querySelector('[data-el="tour-offer-no"]'),
      veeGuide: this.shadowRoot.querySelector('[data-el="vee-guide"]')
    };
    this._guideTimers = [];
    this._tour = null;
    this._veePos = null;
    this._guideCleanup = null;
    this._veeTimers = new Map();
    this._restTimer = null;

    this._history = [];
    this._config = null;
    this._busy = false;
    this._isOpen = false;
    this._scrollQueued = false;
    this._suggestionsEl = null;
    this._listenersBound = false;
    this._wasNearBottom = true;

    this._onDocPointerDown = (e) => {
      if (this._isOpen && !e.composedPath().includes(this)) {
        this.close();
      }
    };

    this._onViewportChange = () => this._updateViewportMetrics();
    this._onOnlineChange = () => this._syncOnlineStatus();
  }

  connectedCallback() {
    if (!this._listenersBound) {
      this._listenersBound = true;
      this._els.launcher.addEventListener('click', () => this.toggle());
      this._els.launcher.addEventListener('pointerenter', () => this._wakeVee());
      this._els.tourNext.addEventListener('click', () => this._tour && this._showTourStep(this._tour.i + 1));
      this._els.tourBack.addEventListener('click', () => this._tour && this._showTourStep(this._tour.i - 1));
      this._els.tourSkip.addEventListener('click', () => this.endTour(false));
      this._els.tourOfferYes.addEventListener('click', () => this.startTour());
      this._els.tourOfferNo.addEventListener('click', () => this._hideTourOffer(true));
      this._els.launcher.addEventListener('focus', () => this._wakeVee());
      this._els.close.addEventListener('click', () => this.close());
      this._els.backdrop.addEventListener('click', () => this.close());
      this._els.reset.addEventListener('click', () => this.resetConversation());
      this._els.scrollBottom.addEventListener('click', () => {
        this._scrollToBottom(true);
        this._els.scrollBottom.classList.remove('is-visible');
      });

      this._els.messages.addEventListener('scroll', () => {
        this._wasNearBottom = this._isNearBottom();
        if (this._wasNearBottom) {
          this._els.scrollBottom.classList.remove('is-visible');
        }
      }, { passive: true });

      this._els.input.addEventListener('input', () => {
        this._autoResizeInput();
        this._syncSendState();
      });

      this._els.input.addEventListener('focus', () => {
        this._updateViewportMetrics();
        if (this._wasNearBottom) {
          this._scrollToBottom();
        }
      });

      this._els.input.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey && !this._isCoarsePointer()) {
          e.preventDefault();
          if (!this._busy && this._els.input.value.trim()) {
            this.sendMessage(this._els.input.value);
          }
        }
      });

      this._els.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.sendMessage(this._els.input.value);
      });

      this.shadowRoot.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._isOpen) {
          this.close();
        }
      });
    }

    document.addEventListener('pointerdown', this._onDocPointerDown);
    window.addEventListener('online', this._onOnlineChange);
    window.addEventListener('offline', this._onOnlineChange);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this._onViewportChange);
      window.visualViewport.addEventListener('scroll', this._onViewportChange);
    }

    this._updateViewportMetrics();
    this._syncOnlineStatus();
    this._syncSendState();
    this.loadClientConfig();
    this._wakeVee();
    clearTimeout(this._helloTimer);
    this._helloTimer = setTimeout(() => {
      let seen = false;
      try { seen = sessionStorage.getItem('khala-vee-hello') === '1'; sessionStorage.setItem('khala-vee-hello', '1'); } catch {}
      if (!seen && !this._isOpen) this._gesture(this._els.veeLauncher, 'hello', 1600);
    }, 1500);
    clearTimeout(this._offerTimer);
    let wantTour = false;
    try {
      const params = new URLSearchParams(location.search);
      if (params.get('tour') === '1') {
        wantTour = true;
        params.delete('tour');
        const q = params.toString();
        history.replaceState(history.state, '', location.pathname + (q ? `?${q}` : '') + location.hash);
      }
    } catch {}
    this._offerTimer = setTimeout(() => {
      if (wantTour) this.startTour(); else this._maybeOfferTour();
    }, wantTour ? 1800 : 6000);
  }

  disconnectedCallback() {
    document.removeEventListener('pointerdown', this._onDocPointerDown);
    clearTimeout(this._restTimer);
    clearTimeout(this._helloTimer);
    clearTimeout(this._offerTimer);
    this.endTour(false);
    this._veeTimers.forEach((t) => clearTimeout(t));
    this._endGuide();
    window.removeEventListener('online', this._onOnlineChange);
    window.removeEventListener('offline', this._onOnlineChange);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this._onViewportChange);
      window.visualViewport.removeEventListener('scroll', this._onViewportChange);
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal !== newVal && this.isConnected && (name === 'client' || name === 'api-base')) {
      this.loadClientConfig();
    }
  }

  get clientId() {
    return this.getAttribute('client') || 'tamyiz';
  }

  get apiBase() {
    return (this.getAttribute('api-base') || window.location.origin).replace(/\/$/, '');
  }

  _isCoarsePointer() {
    return Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  }

  _isNearBottom() {
    const el = this._els.messages;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 72;
  }

  _autoResizeInput() {
    const el = this._els.input;
    if (!el.value) {
      el.style.height = '';
      el.style.overflowY = 'hidden';
      return;
    }
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, 104);
    if (next > 0) {
      el.style.height = `${next}px`;
    }
    el.style.overflowY = el.scrollHeight > 104 ? 'auto' : 'hidden';
  }

  _syncSendState() {
    this._els.send.disabled = this._busy || !this._els.input.value.trim();
  }

  _syncOnlineStatus() {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (offline) {
      this.setAttribute('data-offline', 'true');
      this._els.tagline.textContent = 'Offline — check connection';
    } else {
      this.removeAttribute('data-offline');
      this._els.tagline.textContent = this._config?.tagline || 'Online';
    }
  }

  _updateViewportMetrics() {
    const vv = window.visualViewport;
    if (!vv) return;
    const kbOffset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    this.style.setProperty('--_vv-height', `${Math.round(vv.height)}px`);
    this.style.setProperty('--_kb-offset', `${kbOffset}px`);
    if (this._isOpen && this._wasNearBottom) {
      this._scrollToBottom();
    }
  }

  _gesture(vee, name, ms) {
    if (!vee) return;
    clearTimeout(this._veeTimers.get(vee));
    vee.classList.remove('g-hello', 'g-point', 'g-think', 'g-done', 'g-shrug', 'g-read', 'g-love', 'g-bye', 'g-nod');
    if (!name) return;
    void vee.offsetWidth;
    vee.classList.add(`g-${name}`);
    if (ms) {
      this._veeTimers.set(vee, setTimeout(() => vee.classList.remove(`g-${name}`), ms));
    }
  }

  _wakeVee() {
    this._els.veeLauncher.classList.remove('is-resting');
    clearTimeout(this._restTimer);
    this._restTimer = setTimeout(() => {
      if (!this._isOpen) this._els.veeLauncher.classList.add('is-resting');
    }, 30_000);
  }

  _siteLinkIn(reply) {
    const text = String(reply || '');
    const candidates = [];
    const md = /\]\(([^)\s]+)\)/g;
    let m;
    while ((m = md.exec(text))) candidates.push(m[1]);
    const bare = /https?:\/\/[^\s)<>"']+/g;
    while ((m = bare.exec(text))) candidates.push(m[0]);
    const siteHost = (() => {
      try { return new URL(this._config?.siteUrl || location.origin).host; } catch { return location.host; }
    })();
    for (const raw of candidates) {
      let url;
      try { url = new URL(raw.replace(/[.,;:!?]+$/, ''), location.origin); } catch { continue; }
      if (url.host !== location.host && url.host !== siteHost) continue;
      if (url.pathname === '/' && !url.hash) continue;
      return url;
    }
    return null;
  }

  _findPageLink(url) {
    const norm = (p) => (p.replace(/\/+$/, '').replace(/\.html$/, '') || '/');
    const want = norm(url.pathname);
    const links = Array.from(document.querySelectorAll('a[href]'));
    for (const a of links) {
      let path;
      try { path = norm(new URL(a.getAttribute('href'), location.href).pathname); } catch { continue; }
      if (path !== want) continue;
      const r = a.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (r.top < 0 || r.bottom > window.innerHeight || r.left < 0 || r.right > window.innerWidth) continue;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(hit === a || a.contains(hit))) continue;
      return a;
    }
    return null;
  }

  _endGuide() {
    this._guideTimers.forEach((t) => clearTimeout(t));
    this._guideTimers = [];
    if (this._guideCleanup) this._guideCleanup();
    this._guideCleanup = null;
  }

  _guideTo(url) {
    if (!url) return false;
    const link = this._findPageLink(url);
    if (!link) return false;
    this._endGuide();

    const prev = {
      backgroundColor: link.style.backgroundColor,
      color: link.style.color,
      boxShadow: link.style.boxShadow
    };
    const highlight = () => {
      link.style.backgroundColor = '#FFD60A';
      link.style.color = '#0B0B0B';
      link.style.boxShadow = '0 0 0 4px #FFD60A';
    };
    const unhighlight = () => Object.assign(link.style, prev);

    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const later = (fn, ms) => this._guideTimers.push(setTimeout(fn, ms));

    if (reduced || !this._els.guide.animate) {
      highlight();
      this._guideCleanup = unhighlight;
      later(() => this._endGuide(), 2600);
      return true;
    }

    const guide = this._els.guide;
    const launcher = this._els.launcher;
    const from = this._els.veeLauncher.getBoundingClientRect();
    const target = link.getBoundingClientRect();
    const w = 44;
    const h = 56;
    // Stand just below the link, slightly to its left, so the raised right arm points up at it
    // without covering the neighbouring links.
    let x = target.left - w * 0.55;
    let flip = false;
    if (x < 8) {
      x = target.right - w * 0.45;
      flip = true;
    }
    x = Math.min(Math.max(x, 8), window.innerWidth - w - 8);
    let y = target.bottom + 10;
    if (y + h > window.innerHeight - 8) y = Math.max(target.top - h - 10, 8);
    const start = `translate(${from.left}px, ${from.top}px)`;
    const end = `translate(${x}px, ${y}px)`;
    const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';

    guide.classList.toggle('is-flipped', flip);
    guide.style.transform = start;
    guide.classList.add('is-active');
    launcher.classList.add('is-away');

    const there = guide.animate([{ transform: start }, { transform: end }], { duration: 750, easing: ease, fill: 'forwards' });
    let back = null;

    this._guideCleanup = () => {
      there.cancel();
      if (back) back.cancel();
      unhighlight();
      this._gesture(this._els.veeGuide, null);
      guide.classList.remove('is-active', 'is-flipped');
      guide.style.transform = '';
      launcher.classList.remove('is-away');
    };

    later(() => {
      highlight();
      this._gesture(this._els.veeGuide, 'point', 2300);
    }, 760);
    later(() => {
      unhighlight();
      const now = this._els.veeLauncher.getBoundingClientRect();
      back = guide.animate([{ transform: end }, { transform: `translate(${now.left}px, ${now.top}px)` }], { duration: 650, easing: ease, fill: 'forwards' });
    }, 3200);
    later(() => this._endGuide(), 3900);
    return true;
  }

  _historyForServer() {
    const name = this.getAttribute('agent-name');
    if (!name) return this._history;
    const note = this.getAttribute('agent-note') || '';
    const primer = [
      { role: 'user', text: `For this whole conversation your name is ${name}. Always call yourself ${name}, never "Support AI" or "${this._config?.businessName || 'the business'} Support". ${note}`.trim() },
      { role: 'model', text: `Understood. I'm ${name}.` }
    ];
    return [...primer, ...this._history.slice(-8)];
  }

  _applyAgentName(reply) {
    const name = this.getAttribute('agent-name');
    if (!name) return reply;
    return String(reply).replace(/\b(?:the\s+)?(?:TAMYIZ\S*\s+)?Support\s+AI\b/gi, name);
  }

  // ---------------- Tour guide ----------------
  _tourSteps() {
    const sel = this.getAttribute('tour');
    if (!sel) return null;
    try {
      const el = document.querySelector(sel);
      const steps = JSON.parse(el ? el.textContent : 'null');
      return Array.isArray(steps) && steps.length ? steps : null;
    } catch {
      return null;
    }
  }

  _tourTarget(step) {
    if (step.target === 'launcher') return this._els.launcher;
    const list = Array.from(document.querySelectorAll(step.target || ''));
    return list.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    }) || null;
  }

  _reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  _waitForScroll() {
    return new Promise((resolve) => {
      let last = window.scrollY;
      let still = 0;
      let waited = 0;
      const tick = () => {
        waited += 50;
        if (Math.abs(window.scrollY - last) < 1) still += 50; else still = 0;
        last = window.scrollY;
        if (still >= 150 || waited >= 1400) resolve(); else setTimeout(tick, 50);
      };
      setTimeout(tick, 50);
    });
  }

  _moveVee(x, y, animate) {
    const guide = this._els.guide;
    const to = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    const from = this._veePos ? `translate(${Math.round(this._veePos.x)}px, ${Math.round(this._veePos.y)}px)` : to;
    if (this._veeAnim) { this._veeAnim.cancel(); this._veeAnim = null; }
    guide.style.transform = to;
    if (animate && !this._reduced() && guide.animate && from !== to) {
      this._veeAnim = guide.animate([{ transform: from }, { transform: to }], { duration: 700, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
    this._veePos = { x, y };
  }

  _layoutTour(animate) {
    const t = this._tour;
    if (!t) return;
    const step = t.steps[t.i];
    const el = t.el;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const W = 44;
    const H = 56;
    const phone = vw < 640;
    const ring = this._els.tourRing;
    const bubble = this._els.tourBubble;

    let r;
    if (el === this._els.launcher) {
      ring.classList.remove('is-on');
      const lr = this._els.veeLauncher.getBoundingClientRect();
      r = { left: lr.left, top: lr.top, right: lr.right, bottom: lr.bottom, width: lr.width, height: lr.height };
    } else {
      const b = el.getBoundingClientRect();
      const pad = 8;
      r = { left: b.left - pad, top: b.top - pad, right: b.right + pad, bottom: b.bottom + pad, width: b.width + pad * 2, height: b.height + pad * 2 };
      ring.classList.add('is-on');
      ring.style.transform = `translate(${Math.round(r.left)}px, ${Math.round(r.top)}px)`;
      ring.style.width = `${Math.round(r.width)}px`;
      ring.style.height = `${Math.round(r.height)}px`;
    }

    const bh = bubble.offsetHeight || 150;
    let vx;
    let vy;
    let flip = false;
    if (el === this._els.launcher) {
      vx = r.left;
      vy = r.top;
    } else if (phone) {
      // On phones the bubble sits at the bottom of the screen; Vee peeks over its top edge.
      const bubbleTop = bubble.getBoundingClientRect().top || (vh - bh - 12);
      vx = vw - W - 24;
      vy = bubbleTop - H + 10;
    } else {
      vx = r.left - W * 0.55;
      if (vx < 8) { vx = r.right - W * 0.45; flip = true; }
      vy = r.bottom + 6;
      if (vy + H > vh - 8) vy = Math.max(r.top - H - 6, 8);
    }
    vx = Math.min(Math.max(vx, 8), vw - W - 8);
    vy = Math.min(Math.max(vy, 8), vh - H - 8);
    this._els.guide.classList.toggle('is-flipped', flip);
    this._moveVee(vx, vy, animate);

    if (!phone) {
      const bw = Math.min(300, vw - 24);
      let bx = vx + W + 14;
      if (bx + bw > vw - 12) bx = vx - bw - 14;
      if (bx < 12) bx = Math.min(Math.max(12, vx - bw / 2), vw - bw - 12);
      let by = vy - 6;
      if (by + bh > vh - 12) by = vh - bh - 12;
      if (by < 12) by = 12;
      bubble.style.transform = `translate(${Math.round(bx)}px, ${Math.round(by)}px)`;
    }
  }

  async _showTourStep(i) {
    const t = this._tour;
    if (!t) return;
    const total = t.steps.length;
    if (i < 0) i = 0;
    if (i >= total) { this.endTour(true); return; }

    let step = t.steps[i];
    let el = this._tourTarget(step);
    const dir = i >= t.i ? 1 : -1;
    while (!el) {
      i += dir;
      if (i < 0 || i >= total) { this.endTour(true); return; }
      step = t.steps[i];
      el = this._tourTarget(step);
    }
    t.i = i;
    t.el = el;
    const token = ++t.token;

    this._els.tourBubble.classList.remove('is-shown');
    if (el !== this._els.launcher) {
      const r = el.getBoundingClientRect();
      const fits = r.top >= 70 && r.bottom <= window.innerHeight - 220;
      if (!fits) {
        const y = window.scrollY + r.top - Math.max(90, window.innerHeight * 0.22);
        window.scrollTo({ top: Math.max(0, y), behavior: this._reduced() ? 'auto' : 'smooth' });
        await this._waitForScroll();
        if (!this._tour || token !== this._tour.token) return;
      }
    }

    this._els.tourStep.textContent = `[ ${i + 1} / ${total} ]`;
    this._els.tourText.textContent = step.text || '';
    this._els.tourBack.hidden = i === 0;
    this._els.tourNext.textContent = i === total - 1 ? 'Done' : 'Next';
    this._els.tourBubble.classList.add('is-on');
    this._layoutTour(true);
    this._gesture(this._els.veeGuide, step.gesture || 'point', 2400);
    later.call(this, () => {
      if (!this._tour || token !== this._tour.token) return;
      this._layoutTour(false);
      this._els.tourBubble.classList.add('is-shown');
      this._els.tourNext.focus({ preventScroll: true });
    }, this._reduced() ? 0 : 520);

    function later(fn, ms) { this._guideTimers.push(setTimeout(fn, ms)); }
  }

  _requestTour() {
    const first = this._tourTarget(this._tourSteps()[0]);
    if (first) { this.startTour(); return; }
    const home = this.getAttribute('tour-home') || '/';
    location.assign(`${home}${home.includes('?') ? '&' : '?'}tour=1`);
  }

  startTour() {
    const all = this._tourSteps();
    if (!all || this._tour) return false;
    const steps = all.filter((step) => this._tourTarget(step));
    if (!steps.length) return false;
    this._endGuide();
    this._hideTourOffer(true);
    if (this._isOpen) this.close();
    this._wakeVee();
    clearTimeout(this._restTimer);

    const start = this._els.veeLauncher.getBoundingClientRect();
    this._veePos = { x: start.left, y: start.top };
    this._els.guide.style.transform = `translate(${start.left}px, ${start.top}px)`;
    this._els.guide.classList.add('is-active');
    this._els.launcher.classList.add('is-away');

    this._tour = { steps, i: 0, el: null, token: 0 };
    this._onTourViewport = () => {
      if (this._tourRaf) return;
      this._tourRaf = requestAnimationFrame(() => {
        this._tourRaf = null;
        this._layoutTour(false);
      });
    };
    this._onTourKey = (e) => {
      if (e.key === 'Escape') this.endTour(false);
    };
    window.addEventListener('scroll', this._onTourViewport, { passive: true });
    window.addEventListener('resize', this._onTourViewport);
    document.addEventListener('keydown', this._onTourKey);
    try { localStorage.setItem('khala-tour-seen', '1'); } catch {}
    this._showTourStep(0);
    return true;
  }

  endTour(finished) {
    if (!this._tour) return;
    this._tour.token++;
    this._tour = null;
    window.removeEventListener('scroll', this._onTourViewport);
    window.removeEventListener('resize', this._onTourViewport);
    document.removeEventListener('keydown', this._onTourKey);
    this._guideTimers.forEach((t) => clearTimeout(t));
    this._guideTimers = [];
    this._els.tourRing.classList.remove('is-on');
    this._els.tourBubble.classList.remove('is-on', 'is-shown');
    this._gesture(this._els.veeGuide, null);

    const done = () => {
      if (this._veeAnim) { this._veeAnim.cancel(); this._veeAnim = null; }
      this._els.guide.classList.remove('is-active', 'is-flipped');
      this._els.guide.style.transform = '';
      this._els.launcher.classList.remove('is-away');
      this._veePos = null;
      this._gesture(this._els.veeLauncher, finished ? 'bye' : null, 1600);
      this._wakeVee();
      this._els.launcher.focus({ preventScroll: true });
    };
    const home = this._els.veeLauncher.getBoundingClientRect();
    this._els.guide.classList.remove('is-flipped');
    this._moveVee(home.left, home.top, true);
    if (this._veeAnim) this._veeAnim.onfinish = done; else done();
  }

  _maybeOfferTour() {
    if (!this._tourSteps() || this._tour || this._isOpen) return;
    if (this.hasAttribute('tour-no-offer')) return;
    try { if (localStorage.getItem('khala-tour-seen') === '1') return; } catch { return; }
    const first = this._tourTarget(this._tourSteps()[0]);
    if (!first) return;
    this._els.tourOffer.classList.add('is-on');
    this._gesture(this._els.veeLauncher, 'hello', 1600);
  }

  _hideTourOffer(remember) {
    this._els.tourOffer.classList.remove('is-on');
    if (remember) {
      try { localStorage.setItem('khala-tour-seen', '1'); } catch {}
    }
  }

  _gestureForReply(reply) {
    const text = String(reply || '');
    if (/\b(not sure|don't know|do not know|don't have that|cannot help|can't help)\b/i.test(text)) return 'shrug';
    if (/tamyiz\.pages\.dev\/[a-z]|\]\(\/[a-z]/i.test(text)) return 'point';
    if (/^\W*(yes|yep|sure|absolutely|of course|definitely)\b/i.test(text)) return 'nod';
    return 'done';
  }

  open() {
    this._isOpen = true;
    this._updateViewportMetrics();
    this.setAttribute('data-open', 'true');
    this._els.panel.classList.add('is-open');
    this._els.panel.setAttribute('aria-hidden', 'false');
    this._els.launcher.setAttribute('aria-expanded', 'true');
    this._els.veeLauncher.classList.remove('is-resting');
    clearTimeout(this._restTimer);
    this._gesture(this._els.veeAvatar, 'hello', 1600);
    this._scrollToBottom();
    if (!this._isCoarsePointer()) {
      requestAnimationFrame(() => this._els.input.focus());
    }
  }

  close() {
    this._isOpen = false;
    this.removeAttribute('data-open');
    this._els.panel.classList.remove('is-open');
    this._els.panel.setAttribute('aria-hidden', 'true');
    this._els.launcher.setAttribute('aria-expanded', 'false');
    this._wakeVee();
    this._els.input.blur();
    if (this.shadowRoot.activeElement && this.shadowRoot.activeElement !== this._els.launcher) {
      this._els.launcher.focus();
    }
  }

  toggle() {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  async loadClientConfig() {
    try {
      const res = await fetch(`${this.apiBase}/api/clients/${encodeURIComponent(this.clientId)}/config`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._config = await res.json();

      if (this._config.accentColor) {
        this.style.setProperty('--khala-accent', this._config.accentColor);
      }
      this._els.agentName.textContent = this.getAttribute('agent-name') || this._config.agentName || 'Support AI';
      this._syncOnlineStatus();
      const label = `Chat with ${this._config.businessName || 'us'}`;
      this._els.launcher.setAttribute('aria-label', label);
      this._els.launcher.setAttribute('title', label);
      this._els.input.placeholder = this._config.placeholder || 'Type your question...';
      this.resetConversation();
    } catch {
      this._els.agentName.textContent = this.getAttribute('agent-name') || 'Support AI';
      this._syncOnlineStatus();
      this.resetConversation('Hi! How can I help you today?');
    }
  }

  resetConversation(fallbackGreeting) {
    this._history = [];
    this._suggestionsEl = null;
    this._wasNearBottom = true;
    this._els.scrollBottom.classList.remove('is-visible');
    this._els.messages.replaceChildren();
    const greeting = this._config?.greeting || fallbackGreeting || 'Hi! How can I help you today?';
    this._appendMessage('bot', this._applyAgentName(greeting));
    this._renderSuggestions(this._config?.suggestedQuestions || []);
  }

  _scrollToBottom(smooth = false) {
    if (this._scrollQueued) return;
    this._scrollQueued = true;
    requestAnimationFrame(() => {
      this._scrollQueued = false;
      const el = this._els.messages;
      if (smooth && typeof el.scrollTo === 'function') {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } else {
        el.scrollTop = el.scrollHeight;
      }
      this._wasNearBottom = true;
      this._els.scrollBottom.classList.remove('is-visible');
    });
  }

  _renderSuggestions(questions) {
    if (this._suggestionsEl) {
      this._suggestionsEl.remove();
      this._suggestionsEl = null;
    }
    const tourLabel = this._tourSteps() ? (this.getAttribute('tour-label') || 'Give me a tour') : null;
    if ((!Array.isArray(questions) || questions.length === 0) && !tourLabel) return;

    const wrap = document.createElement('div');
    wrap.className = 'suggestions';
    if (tourLabel) {
      const tourBtn = document.createElement('button');
      tourBtn.type = 'button';
      tourBtn.className = 'chip';
      tourBtn.textContent = tourLabel;
      tourBtn.addEventListener('click', () => this._requestTour());
      wrap.append(tourBtn);
    }
    questions = Array.isArray(questions) ? questions : [];
    for (const q of questions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.textContent = q;
      btn.addEventListener('click', () => this.sendMessage(q));
      wrap.append(btn);
    }
    this._suggestionsEl = wrap;
    this._els.messages.append(wrap);
  }

  _appendMessage(role, text, options = {}) {
    const { animateBlocks = false, isError = false, retryText = null, preserveScroll = true } = options;
    const wasNearBottom = this._isNearBottom();

    const row = document.createElement('div');
    row.className = `msg-row ${role}`;

    const div = document.createElement('div');
    div.className = `msg ${role}${isError ? ' is-error' : ''}`;
    if (role === 'bot') {
      renderFormattedText(div, text);
      if (animateBlocks) {
        div.classList.add('is-revealing');
        const blocks = div.querySelectorAll('p, li, h3, h4');
        blocks.forEach((el, idx) => {
          el.style.setProperty('--line-idx', String(Math.min(idx, 8)));
        });
      }
      if (isError && retryText) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'retry-btn';
        retryBtn.textContent = '\u21bb Retry';
        retryBtn.addEventListener('click', () => {
          row.remove();
          this.sendMessage(retryText, { skipUserBubble: true });
        });
        div.append(retryBtn);
      }
    } else {
      div.textContent = text;
    }

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = formatTimestamp();

    row.append(div, meta);
    this._els.messages.append(row);

    if (preserveScroll && !wasNearBottom && role === 'bot') {
      this._els.scrollBottom.classList.add('is-visible');
    } else if (role === 'bot' && animateBlocks) {
      requestAnimationFrame(() => {
        const msgBox = this._els.messages;
        if (row.offsetHeight > msgBox.clientHeight * 0.75 && typeof row.scrollIntoView === 'function') {
          row.scrollIntoView({ block: 'start', behavior: 'smooth' });
        } else {
          this._scrollToBottom(true);
        }
      });
    } else {
      this._scrollToBottom();
    }

    return row;
  }

  _appendTypingIndicator() {
    const wasNearBottom = this._isNearBottom();
    const row = document.createElement('div');
    row.className = 'msg-row bot';

    const div = document.createElement('div');
    div.className = 'msg bot typing';
    const dots = document.createElement('span');
    dots.className = 'typing-dots';
    dots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i += 1) {
      dots.append(document.createElement('span'));
    }
    const label = document.createElement('span');
    label.textContent = 'Writing reply...';
    div.append(dots, label);

    row.append(div);
    this._els.messages.append(row);
    if (wasNearBottom) {
      this._scrollToBottom();
    }
    return row;
  }

  async sendMessage(rawText, options = {}) {
    const text = (rawText || '').trim();
    if (!text || this._busy) return;
    if (this._tourSteps() && /\b(tour|show me around|walk me through|guide me)\b/i.test(text) && text.length < 80) {
      this._els.input.value = '';
      this._requestTour();
      return;
    }

    const { skipUserBubble = false } = options;

    this._busy = true;
    if (!skipUserBubble) {
      this._els.input.value = '';
      this._autoResizeInput();
    }
    this._syncSendState();

    if (this._suggestionsEl) {
      this._suggestionsEl.remove();
      this._suggestionsEl = null;
    }

    if (!skipUserBubble) {
      this._appendMessage('user', text, { preserveScroll: false });
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this._syncOnlineStatus();
      this._appendMessage('bot', 'You appear to be offline. Check your internet connection and tap Retry.', {
        animateBlocks: true,
        isError: true,
        retryText: text,
        preserveScroll: false
      });
      this._busy = false;
      this._syncSendState();
      return;
    }

    const typingEl = this._appendTypingIndicator();
    this._gesture(this._els.veeAvatar, 'think');

    try {
      const res = await fetch(`${this.apiBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          clientId: this.clientId,
          message: text,
          history: this._historyForServer()
        })
      });

      const data = await res.json();
      typingEl.remove();

      if (!res.ok) {
        this._gesture(this._els.veeAvatar, 'shrug', 1900);
        this._appendMessage('bot', data.error || 'Sorry, something went wrong. Please try again.', {
          animateBlocks: true,
          isError: true,
          retryText: text
        });
      } else {
        this._history.push({ role: 'user', text });
        data.reply = this._applyAgentName(data.reply);
        this._history.push({ role: 'model', text: data.reply });
        this._appendMessage('bot', data.reply, { animateBlocks: true });
        let gesture = this._gestureForReply(data.reply);
        if (gesture === 'done' && /\b(thank|thanks|thx|shukriya|jazak)/i.test(text)) gesture = 'love';
        this._gesture(this._els.veeAvatar, gesture, gesture === 'point' ? 2300 : gesture === 'shrug' ? 1900 : 1500);
        if (gesture === 'point') {
          const url = this._siteLinkIn(data.reply);
          setTimeout(() => this._guideTo(url), 600);
        }
      }
    } catch {
      typingEl.remove();
      this._gesture(this._els.veeAvatar, 'shrug', 1900);
      this._appendMessage('bot', 'Unable to reach the support server right now. Please check your connection and try again.', {
        animateBlocks: true,
        isError: true,
        retryText: text
      });
    } finally {
      this._busy = false;
      this._syncSendState();
      if (this._isOpen && !this._isCoarsePointer()) {
        this._els.input.focus();
      }
    }
  }
}

if (!customElements.get('khala-support-widget')) {
  customElements.define('khala-support-widget', KhalaSupportWidget);
}

// Auto-mount when embedded via <script src=".../widget.js" data-client="tamyiz"></script>
(() => {
  const current = document.currentScript;
  if (!current || current.hasAttribute('data-manual')) return;

  const mount = () => {
    if (document.querySelector('khala-support-widget')) return;
    const el = document.createElement('khala-support-widget');
    const client = current.getAttribute('data-client') || 'tamyiz';
    const apiBase = current.getAttribute('data-api-base') || new URL(current.src).origin;
    el.setAttribute('client', client);
    el.setAttribute('api-base', apiBase);
    const agentName = current.getAttribute('data-agent-name');
    if (agentName) el.setAttribute('agent-name', agentName);
    const agentNote = current.getAttribute('data-agent-note');
    if (agentNote) el.setAttribute('agent-note', agentNote);
    if (current.hasAttribute('data-hide-tagline')) el.setAttribute('hide-tagline', '');
    for (const key of ['tour', 'tour-label', 'tour-home']) {
      const v = current.getAttribute(`data-${key}`);
      if (v) el.setAttribute(key, v);
    }
    document.body.append(el);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
