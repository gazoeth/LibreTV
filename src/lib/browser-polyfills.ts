/**
 * Safari 12 缺少 AbortSignal.timeout/any。Next.js 只注入常见平台 API
 * polyfill，这两个较新的静态方法需由应用在交互前补齐。
 */
type CompatibleAbortSignal = typeof AbortSignal & {
  any?: (signals: AbortSignal[]) => AbortSignal;
  timeout?: (milliseconds: number) => AbortSignal;
};

const compatibleAbortSignal = AbortSignal as CompatibleAbortSignal;

if (typeof compatibleAbortSignal.timeout !== 'function') {
  compatibleAbortSignal.timeout = (milliseconds) => {
    const controller = new AbortController();
    window.setTimeout(() => controller.abort(), Math.max(0, milliseconds));
    return controller.signal;
  };
}

if (typeof compatibleAbortSignal.any !== 'function') {
  compatibleAbortSignal.any = (signals) => {
    const controller = new AbortController();
    const cleanups: Array<() => void> = [];

    const abort = () => {
      if (controller.signal.aborted) return;
      controller.abort();
      for (const cleanup of cleanups.splice(0)) cleanup();
    };

    for (const signal of signals) {
      if (signal.aborted) {
        abort();
        break;
      }

      const onAbort = () => abort();
      signal.addEventListener('abort', onAbort);
      cleanups.push(() => signal.removeEventListener('abort', onAbort));
    }

    return controller.signal;
  };
}
