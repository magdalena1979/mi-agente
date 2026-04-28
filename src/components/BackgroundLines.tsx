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
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={1.2}
          />

          {/* gris diagonal */}
          <line
            x1="300"
            y1="1000"
            x2="1000"
            y2="200"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1.2}
          />

          {/* magenta */}
          <line
            x1="250"
            y1="1000"
            x2="800"
            y2="100"
            stroke="#E02680"
            strokeOpacity={0.5}
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
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
          />

          <path
            d="M0 400 Q300 250 700 300"
            stroke="rgba(255,255,255,0.035)"
            strokeWidth={1}
            fill="none"
          />

        </svg>
      </div>
    </>
  )
}

export default BackgroundLines