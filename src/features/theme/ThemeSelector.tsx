import { useTheme, type ThemePreference, type ResolvedTheme } from '@/features/theme/theme-context'

const themeOptions: Array<{ value: Exclude<ThemePreference, 'system'>; label: string; icon: ResolvedTheme }> = [
  { value: 'light', label: 'Modo claro', icon: 'light' },
  { value: 'dark', label: 'Modo oscuro', icon: 'dark' },
]

export function ThemeSelector() {
  const { preference, resolvedTheme, setPreference } = useTheme()

  return (
    <div className="theme-selector" aria-label="Seleccionar tema">
      {themeOptions.map((option) => {
        const isActive =
          option.value === preference || (preference === 'system' && option.value === resolvedTheme)

        return (
          <button
            key={option.value}
            type="button"
            className={isActive ? 'theme-selector__item theme-selector__item--active' : 'theme-selector__item'}
            aria-label={option.label}
            aria-pressed={isActive}
            title={option.label}
            onClick={() => {
              setPreference(option.value)
            }}
          >
            {option.icon === 'light' ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" className="theme-selector__icon">
                <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M12 2.8v2.4M12 18.8v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" className="theme-selector__icon">
                <path
                  d="M20.1 14.8A7.8 7.8 0 0 1 9.2 3.9a8.6 8.6 0 1 0 10.9 10.9Z"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}
