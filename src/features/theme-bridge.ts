/** Lets non-React code (commands) drive the next-themes provider. */
export const themeBridge = {
  current: null as null | { resolved: string | undefined; set: (t: string) => void },
  toggle() {
    const c = this.current
    if (c) c.set(c.resolved === 'dark' ? 'light' : 'dark')
  },
}
