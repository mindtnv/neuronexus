export function isReviewEditingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'));
}

export function isReviewInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button,a,input,textarea,select,summary,audio,video,.nn-content-error,[contenteditable],[role="button"],[role="link"]'));
}
