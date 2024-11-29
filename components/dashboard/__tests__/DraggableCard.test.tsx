import React from 'react'
import { render, screen } from '@testing-library/react'
import { DraggableCard } from '../DraggableCard'
import { useSortable } from '@dnd-kit/sortable'

// Mock @dnd-kit/sortable
jest.mock('@dnd-kit/sortable', () => ({
  useSortable: jest.fn()
}))

describe('DraggableCard', () => {
  const mockSetNodeRef = jest.fn()
  const mockListeners = {
    onMouseDown: jest.fn(),
    onTouchStart: jest.fn()
  }
  const mockAttributes = {
    role: 'button',
    'aria-roledescription': 'draggable'
  }

  beforeEach(() => {
    ;(useSortable as jest.Mock).mockReturnValue({
      setNodeRef: mockSetNodeRef,
      listeners: mockListeners,
      attributes: mockAttributes,
      transform: null,
      transition: null,
      isDragging: false
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('renders children correctly', () => {
    render(
      <DraggableCard id="test-id">
        <div>Test Content</div>
      </DraggableCard>
    )

    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('applies draggable functionality', () => {
    render(
      <DraggableCard id="test-id">
        <div>Test Content</div>
      </DraggableCard>
    )

    expect(mockSetNodeRef).toHaveBeenCalled()
  })

  it('applies transform styles when dragging', () => {
    ;(useSortable as jest.Mock).mockReturnValue({
      setNodeRef: mockSetNodeRef,
      listeners: mockListeners,
      attributes: mockAttributes,
      transform: { x: 10, y: 20, scaleX: 1, scaleY: 1 },
      transition: 'transform 200ms ease',
      isDragging: true
    })

    render(
      <DraggableCard id="test-id">
        <div>Test Content</div>
      </DraggableCard>
    )

    const card = screen.getByRole('button').parentElement
    expect(card).toHaveStyle({
      transform: 'translate3d(10px, 20px, 0) scaleX(1) scaleY(1)',
      transition: 'transform 200ms ease'
    })
  })
})
