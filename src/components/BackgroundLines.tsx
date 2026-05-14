import React from 'react'

const BackgroundLines: React.FC = () => {
  return (
    <>
      {/* ================= RIGHT (MAIN) ================= */}
      <div
        style={{
          position: 'fixed',
          bottom: '0',
          right: '0',
          width: 'clamp(600px, 45vw, 1100px)',
          height: 'clamp(600px, 45vw, 1100px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        <svg viewBox="0 0 1000 1000" style={{ width: '100%', height: '100%' }}>
          
          {/* gris base */}
          <line
            x1="0"
            y1="700"
            x2="1000"
            y2="550"
            stroke="var(--bg-line-strong)"
            strokeWidth={1.2}
          />

          {/* gris diagonal */}
          <line
            x1="300"
            y1="1000"
            x2="1000"
            y2="200"
            stroke="var(--bg-line)"
            strokeWidth={1.2}
          />

          {/* magenta */}
          <line
            x1="250"
            y1="1000"
            x2="800"
            y2="100"
            stroke="var(--bg-line-accent)"
            strokeOpacity="var(--bg-line-accent-opacity)"
            strokeWidth={2}
          />
        </svg>
      </div>

      {/* ================= LEFT (SUBTLE) ================= */}
      <div
        style={{
          position: 'fixed',
          top: '80px',
          left: '0',
          width: 'clamp(400px, 30vw, 800px)',
          height: 'clamp(400px, 30vw, 800px)',
          pointerEvents: 'none',
          zIndex: 0,
          opacity: 0.7,
        }}
      >
        <svg viewBox="0 0 800 800" style={{ width: '100%', height: '100%' }}>
          
          <line
            x1="0"
            y1="150"
            x2="700"
            y2="0"
            stroke="var(--bg-line)"
            strokeWidth={1}
          />

          <path
            d="M0 400 Q300 250 700 300"
            stroke="var(--bg-line-soft)"
            strokeWidth={1}
            fill="none"
          />

        </svg>
      </div>
    </>
  )
}

export default BackgroundLines
