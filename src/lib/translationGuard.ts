/**
 * Browser page translation (Chrome / Android auto-translate, Safari, Edge) swaps React's
 * text nodes for its own `<font>` wrappers. When React later removes or inserts next to a
 * node that is no longer where it left it, the DOM throws `NotFoundError` and React tears
 * down to the nearest error boundary — which used to be the one around the whole site,
 * header and menu included (dashboard pages now have their own, in Layout).
 *
 * The standard workaround (facebook/react#11538): when the node is not a child of this
 * parent, skip the move instead of throwing. Only the cases that would otherwise throw
 * change; every normal call goes straight to the original method.
 *
 * Imported once for its side effect by AppProviders, before anything renders.
 */
const PATCHED = "__pickemTranslationGuard";

if (typeof window !== "undefined" && typeof Node === "function" && Node.prototype) {
  const proto = Node.prototype as Node & Record<string, unknown>;
  if (!proto[PATCHED]) {
    proto[PATCHED] = true;

    const originalRemoveChild = Node.prototype.removeChild;
    Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
      if (child.parentNode !== this) {
        console.warn("[translationGuard] removeChild skipped: node has a different parent");
        return child;
      }
      return originalRemoveChild.call(this, child) as T;
    };

    const originalInsertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function <T extends Node>(
      this: Node,
      newNode: T,
      referenceNode: Node | null,
    ): T {
      if (referenceNode && referenceNode.parentNode !== this) {
        console.warn("[translationGuard] insertBefore skipped: reference node has a different parent");
        return newNode;
      }
      return originalInsertBefore.call(this, newNode, referenceNode) as T;
    };
  }
}

export {};
