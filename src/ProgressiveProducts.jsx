import React, { useEffect, useRef, useState } from "react";

const BATCH_SIZE = 24;

// Mount only the next batch of cards as the visitor approaches the end.
export function ProgressiveProducts({ groups, children }) {
  const [visible, setVisible] = useState(BATCH_SIZE);
  const sentinel = useRef(null);
  const hasMore = visible < groups.length;

  useEffect(() => {
    if (!hasMore || !sentinel.current || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        // One batch per observation; reconnect after the new cards are mounted.
        observer.disconnect();
        setVisible((count) => Math.min(count + BATCH_SIZE, groups.length));
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, visible, groups.length]);

  return (
    <>
      <div className="product-grid real-products">
        {groups.slice(0, visible).map(children)}
      </div>
      {groups.length > 0 && (
        <div className="product-progress" ref={sentinel}>
          <p role="status" aria-live="polite">
            Showing {Math.min(visible, groups.length)} of {groups.length} products
          </p>
          {hasMore && (
            <button
              className="secondary"
              onClick={() => setVisible((count) => Math.min(count + BATCH_SIZE, groups.length))}
            >
              Load more products
            </button>
          )}
        </div>
      )}
    </>
  );
}
