/**
 * Lets the system back button close open dialogs before it leaves the screen.
 * All open sheets share one extra history entry (flagged `sheet`); a back press closes the top sheet.
 */
const stack: (() => void)[] = [];
let entry = false;

export const sheetEntryActive = () => entry;

/** The sheet entry is about to be reused by a screen change; stop treating it as a dialog entry. */
export function consumeSheetEntry() {
  entry = false;
}

export function registerSheet(close: () => void): () => void {
  stack.push(close);
  if (!entry) {
    entry = true;
    window.history.pushState({ ...(window.history.state as object | null), sheet: true }, "");
  }
  return () => {
    const i = stack.lastIndexOf(close);
    if (i >= 0) stack.splice(i, 1);
    if (stack.length === 0) {
      // wait a tick: another sheet may open in the same render (e.g. route list → claim dialog)
      window.setTimeout(() => {
        if (stack.length === 0 && entry) {
          entry = false;
          window.history.back();
        }
      }, 0);
    }
  };
}

/** Call on every popstate. Returns true when the back press was used to close a dialog. */
export function handleSheetPop(state: { sheet?: boolean } | null): boolean {
  if (!entry || state?.sheet) return false;
  entry = false;
  stack[stack.length - 1]?.();
  window.setTimeout(() => {
    if (stack.length > 0 && !entry) {
      entry = true;
      window.history.pushState({ ...(window.history.state as object | null), sheet: true }, "");
    }
  }, 0);
  return true;
}
