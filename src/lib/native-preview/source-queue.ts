/** One native decoder request at a time, including StrictMode re-entry. */
export class NativeSourceQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.catch(() => {}).then(work);
    this.tail = result;
    return result;
  }
}
