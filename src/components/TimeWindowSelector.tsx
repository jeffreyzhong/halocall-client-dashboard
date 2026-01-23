'use client'

import { useState, useRef, useEffect } from 'react'

type TimeWindow = 'today' | 'last_7_days' | 'this_month' | 'last_30_days'

interface TimeWindowOption {
  value: TimeWindow
  label: string
}

const timeWindowOptions: TimeWindowOption[] = [
  { value: 'today', label: 'Today' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_30_days', label: 'Last 30 Days' },
]

interface TimeWindowSelectorProps {
  onTimeWindowChange?: (timeWindow: TimeWindow) => void
}

export default function TimeWindowSelector({ onTimeWindowChange }: TimeWindowSelectorProps) {
  const [selectedTimeWindow, setSelectedTimeWindow] = useState<TimeWindowOption>(timeWindowOptions[1])
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (option: TimeWindowOption) => {
    setSelectedTimeWindow(option)
    onTimeWindowChange?.(option.value)
    setIsOpen(false)
  }

  return (
    <div className="relative z-[100]" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-3 min-w-[160px] px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-lg border border-[var(--border-subtle)] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {selectedTimeWindow.label}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-[100] top-full left-0 mt-1 min-w-[160px] py-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)] shadow-lg">
          {timeWindowOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors cursor-pointer ${
                selectedTimeWindow.value === option.value
                  ? 'bg-[var(--bg-tertiary)]'
                  : ''
              }`}
            >
              <span className="text-sm text-[var(--text-primary)]">{option.label}</span>
              {selectedTimeWindow.value === option.value && (
                <svg
                  className="w-4 h-4 ml-auto text-[var(--accent-green)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
