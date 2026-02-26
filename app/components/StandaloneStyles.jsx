'use client'

export default function StandaloneStyles() {
  return (
    <style jsx global>{`
      header, footer, .nextra-nav-container, .nx-header, .nx-footer {
        display: none !important;
      }
      main, .nextra-content, .nx-main {
        padding: 0 !important;
        margin: 0 !important;
        max-width: none !important;
      }
      .predict-standalone-container {
        --bg0: #070a13;
        --bg1: #0b1220;
        --bg2: #0f1b2d;
        --c1: #00e5ff;
        --c2: #7c4dff;
        --text: #e6f1ff;
        background: radial-gradient(1200px 600px at 10% -10%, rgba(124,77,255,0.25), transparent),
                    radial-gradient(1200px 600px at 90% 110%, rgba(0,229,255,0.2), transparent),
                    linear-gradient(180deg, var(--bg0), var(--bg1) 40%, var(--bg2));
        min-height: 100vh;
        color: var(--text);
        max-width: 100%;
        margin: 0;
        padding: 16px;
      }
      @media (min-width: 640px) {
        .predict-standalone-container {
          padding: 32px;
          display: grid;
          place-items: start center;
        }
      }
      .predict-title {
        margin: 8px 0 4px;
        font-size: clamp(22px, 4vw, 40px);
        line-height: 1.1;
        background: linear-gradient(90deg, var(--c1), var(--c2));
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        text-shadow: 0 0 18px rgba(0,229,255,0.25);
      }
      .predict-subtitle {
        margin: 0 0 16px;
        color: rgba(230,241,255,0.7);
      }
      .predict-standalone-container .not-prose {
        background: rgba(11, 18, 32, 0.6);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(124,77,255,0.25);
        box-shadow: 0 6px 30px rgba(0, 229, 255, 0.08), inset 0 0 0 1px rgba(0,229,255,0.06);
      }
      .predict-standalone-container input[type="text"] {
        background: rgba(7,10,19,0.7) !important;
        color: var(--text) !important;
        border: 1px solid rgba(0,229,255,0.35) !important;
        outline: none !important;
      }
      .predict-standalone-container input[type="text"]::placeholder {
        color: rgba(230,241,255,0.45);
      }
      .predict-standalone-container button[type="submit"] {
        background: linear-gradient(90deg, rgba(0,229,255,0.2), rgba(124,77,255,0.2));
        border: 1px solid rgba(124,77,255,0.4) !important;
        color: var(--text);
        transition: transform 0.12s ease, box-shadow 0.12s ease;
      }
      .predict-standalone-container button[type="submit"]:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 18px rgba(124,77,255,0.25), 0 0 0 1px rgba(0,229,255,0.2) inset;
      }
      .predict-standalone-container canvas {
        filter: drop-shadow(0 8px 24px rgba(0,229,255,0.06));
      }
    `}</style>
  )
}
