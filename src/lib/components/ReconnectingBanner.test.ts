// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'

import ReconnectingBanner from './ReconnectingBanner.svelte'

describe('ReconnectingBanner', () => {
  it('renders nothing when show is false', () => {
    render(ReconnectingBanner, { props: { show: false } })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows an accessible reconnecting message when show is true', () => {
    render(ReconnectingBanner, { props: { show: true } })

    const banner = screen.getByRole('status')
    expect(banner).toBeInTheDocument()
    // Base locale is English, so the compiled message resolves to "Reconnecting…".
    expect(banner).toHaveTextContent('Reconnecting')
    // Announced politely to assistive tech rather than interrupting.
    expect(banner).toHaveAttribute('aria-live', 'polite')
  })
})
