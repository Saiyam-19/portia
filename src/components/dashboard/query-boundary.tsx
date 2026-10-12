'use client'
import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
export default class QueryBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <div role="alert" className="m-5 flex flex-col gap-3 text-sm text-muted-foreground"><p>Couldn’t load saved conversations. Your messages haven’t been changed.</p><Button variant="outline" onClick={() => this.setState({ failed: false })}>Try again</Button></div>
    return this.props.children
  }
}
